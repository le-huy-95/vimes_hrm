import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams_app/data/models/team_models.dart';
import 'package:manage_teams_app/domain/repositories/team_repository.dart';

sealed class TeamDetailEvent extends Equatable {
  const TeamDetailEvent();
  @override
  List<Object?> get props => [];
}

class TeamDetailStarted extends TeamDetailEvent {
  const TeamDetailStarted(this.teamId);
  final String teamId;
  @override
  List<Object?> get props => [teamId];
}

class TeamDetailRefreshed extends TeamDetailEvent {
  const TeamDetailRefreshed();
}

class TeamDetailUpdated extends TeamDetailEvent {
  const TeamDetailUpdated({this.name, this.description});
  final String? name;
  final String? description;
  @override
  List<Object?> get props => [name, description];
}

class TeamDetailMemberInvited extends TeamDetailEvent {
  const TeamDetailMemberInvited({required this.email, required this.role});
  final String email;
  final String role;
  @override
  List<Object?> get props => [email, role];
}

class TeamDetailMemberRoleChanged extends TeamDetailEvent {
  const TeamDetailMemberRoleChanged({
    required this.userId,
    required this.role,
  });
  final String userId;
  final String role;
  @override
  List<Object?> get props => [userId, role];
}

class TeamDetailMemberRemoved extends TeamDetailEvent {
  const TeamDetailMemberRemoved(this.userId);
  final String userId;
  @override
  List<Object?> get props => [userId];
}

class TeamDetailDeleted extends TeamDetailEvent {
  const TeamDetailDeleted();
}

sealed class TeamDetailState extends Equatable {
  const TeamDetailState();
  @override
  List<Object?> get props => [];
}

class TeamDetailInitial extends TeamDetailState {
  const TeamDetailInitial();
}

class TeamDetailLoading extends TeamDetailState {
  const TeamDetailLoading();
}

class TeamDetailReady extends TeamDetailState {
  const TeamDetailReady({
    required this.team,
    required this.members,
    required this.myRole,
    this.message,
  });

  final Team team;
  final List<TeamMember> members;
  final String? myRole;
  final String? message;

  bool get isLead => myRole == 'lead';

  @override
  List<Object?> get props => [team, members, myRole, message];
}

class TeamDetailFailure extends TeamDetailState {
  const TeamDetailFailure(this.message);
  final String message;
  @override
  List<Object?> get props => [message];
}

class TeamDetailGone extends TeamDetailState {
  const TeamDetailGone();
}

class TeamDetailBloc extends Bloc<TeamDetailEvent, TeamDetailState> {
  TeamDetailBloc({
    required TeamRepository teamRepository,
    required this.currentUserId,
  })  : _teams = teamRepository,
        super(const TeamDetailInitial()) {
    on<TeamDetailStarted>(_onStarted);
    on<TeamDetailRefreshed>(_onRefreshed);
    on<TeamDetailUpdated>(_onUpdated);
    on<TeamDetailMemberInvited>(_onInvited);
    on<TeamDetailMemberRoleChanged>(_onRoleChanged);
    on<TeamDetailMemberRemoved>(_onRemoved);
    on<TeamDetailDeleted>(_onDeleted);
  }

  final TeamRepository _teams;
  final String currentUserId;
  String? _teamId;

  Future<void> _load(Emitter<TeamDetailState> emit, {String? message}) async {
    final id = _teamId;
    if (id == null) return;
    emit(const TeamDetailLoading());
    try {
      final team = await _teams.getById(id);
      final members = await _teams.listMembers(id);
      final mine = members.where((m) => m.userId == currentUserId).firstOrNull;
      emit(TeamDetailReady(
        team: team,
        members: members,
        myRole: mine?.role,
        message: message,
      ));
    } catch (e) {
      emit(TeamDetailFailure(e.toString()));
    }
  }

  Future<void> _onStarted(
    TeamDetailStarted e,
    Emitter<TeamDetailState> emit,
  ) async {
    _teamId = e.teamId;
    await _load(emit);
  }

  Future<void> _onRefreshed(
    TeamDetailRefreshed e,
    Emitter<TeamDetailState> emit,
  ) async {
    await _load(emit);
  }

  Future<void> _onUpdated(
    TeamDetailUpdated e,
    Emitter<TeamDetailState> emit,
  ) async {
    final id = _teamId;
    if (id == null) return;
    try {
      await _teams.update(id, name: e.name, description: e.description);
      await _load(emit, message: 'Đã cập nhật nhóm');
    } catch (err) {
      emit(TeamDetailFailure(err.toString()));
    }
  }

  Future<void> _onInvited(
    TeamDetailMemberInvited e,
    Emitter<TeamDetailState> emit,
  ) async {
    final id = _teamId;
    if (id == null) return;
    try {
      await _teams.invite(id, email: e.email, role: e.role);
      await _load(emit, message: 'Đã mời ${e.email}');
    } catch (err) {
      emit(TeamDetailFailure(err.toString()));
    }
  }

  Future<void> _onRoleChanged(
    TeamDetailMemberRoleChanged e,
    Emitter<TeamDetailState> emit,
  ) async {
    final id = _teamId;
    if (id == null) return;
    try {
      await _teams.updateMemberRole(id, e.userId, e.role);
      await _load(emit, message: 'Đã đổi vai trò');
    } catch (err) {
      emit(TeamDetailFailure(err.toString()));
    }
  }

  Future<void> _onRemoved(
    TeamDetailMemberRemoved e,
    Emitter<TeamDetailState> emit,
  ) async {
    final id = _teamId;
    if (id == null) return;
    try {
      await _teams.removeMember(id, e.userId);
      await _load(emit, message: 'Đã xóa thành viên');
    } catch (err) {
      emit(TeamDetailFailure(err.toString()));
    }
  }

  Future<void> _onDeleted(
    TeamDetailDeleted e,
    Emitter<TeamDetailState> emit,
  ) async {
    final id = _teamId;
    if (id == null) return;
    try {
      await _teams.delete(id);
      emit(const TeamDetailGone());
    } catch (err) {
      emit(TeamDetailFailure(err.toString()));
    }
  }
}
