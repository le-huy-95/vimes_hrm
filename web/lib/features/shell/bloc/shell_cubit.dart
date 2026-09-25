import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams_app/data/models/integration_models.dart';
import 'package:manage_teams_app/data/models/team_models.dart';
import 'package:manage_teams_app/domain/repositories/integration_repository.dart';
import 'package:manage_teams_app/domain/repositories/team_repository.dart';

sealed class ShellState extends Equatable {
  const ShellState();
  @override
  List<Object?> get props => [];
}

class ShellInitial extends ShellState {
  const ShellInitial();
}

class ShellLoading extends ShellState {
  const ShellLoading();
}

class ShellLoaded extends ShellState {
  const ShellLoaded({
    required this.teams,
    this.selectedTeamId,
    this.integrations = IntegrationStatus.empty,
  });

  final List<Team> teams;
  final String? selectedTeamId;
  final IntegrationStatus integrations;

  @override
  List<Object?> get props => [teams, selectedTeamId, integrations];

  ShellLoaded copyWith({
    List<Team>? teams,
    String? selectedTeamId,
    IntegrationStatus? integrations,
    bool clearTeam = false,
  }) {
    return ShellLoaded(
      teams: teams ?? this.teams,
      selectedTeamId:
          clearTeam ? null : (selectedTeamId ?? this.selectedTeamId),
      integrations: clearTeam
          ? IntegrationStatus.empty
          : (integrations ?? this.integrations),
    );
  }
}

class ShellFailure extends ShellState {
  const ShellFailure(this.message);
  final String message;
  @override
  List<Object?> get props => [message];
}

class ShellCubit extends Cubit<ShellState> {
  ShellCubit({
    required TeamRepository teamRepository,
    required IntegrationRepository integrationRepository,
  })  : _teams = teamRepository,
        _integrations = integrationRepository,
        super(const ShellInitial());

  final TeamRepository _teams;
  final IntegrationRepository _integrations;

  Future<void> load() async {
    final previous = state;
    emit(const ShellLoading());
    try {
      final tree = await _teams.fetchTree();
      final selected =
          previous is ShellLoaded ? previous.selectedTeamId : null;
      var status = IntegrationStatus.empty;
      if (selected != null) {
        try {
          status = await _integrations.getStatus(selected);
        } catch (_) {
          status = IntegrationStatus.empty;
        }
      }
      emit(ShellLoaded(
        teams: tree,
        selectedTeamId: selected,
        integrations: status,
      ));
    } catch (e) {
      emit(ShellFailure(e.toString()));
    }
  }

  Future<void> reload() => load();

  Future<void> setSelectedTeam(String? teamId) async {
    final current = state;
    if (current is! ShellLoaded) {
      if (teamId == null) return;
      await load();
    }
    final loaded = state;
    if (loaded is! ShellLoaded) return;

    if (teamId == null) {
      if (loaded.selectedTeamId == null) return;
      emit(loaded.copyWith(clearTeam: true));
      return;
    }
    if (teamId == loaded.selectedTeamId) return;

    emit(loaded.copyWith(
      selectedTeamId: teamId,
      integrations: IntegrationStatus.empty,
    ));
    try {
      final status = await _integrations.getStatus(teamId);
      final latest = state;
      if (latest is ShellLoaded && latest.selectedTeamId == teamId) {
        emit(latest.copyWith(integrations: status));
      }
    } catch (_) {
      // keep empty flags
    }
  }
}
