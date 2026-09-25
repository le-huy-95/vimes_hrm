import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams_app/data/models/team_models.dart';
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
  const ShellLoaded(this.teams);
  final List<Team> teams;
  @override
  List<Object?> get props => [teams];
}

class ShellFailure extends ShellState {
  const ShellFailure(this.message);
  final String message;
  @override
  List<Object?> get props => [message];
}

class ShellCubit extends Cubit<ShellState> {
  ShellCubit({required TeamRepository teamRepository})
      : _teams = teamRepository,
        super(const ShellInitial());

  final TeamRepository _teams;

  Future<void> load() async {
    emit(const ShellLoading());
    try {
      final tree = await _teams.fetchTree();
      emit(ShellLoaded(tree));
    } catch (e) {
      emit(ShellFailure(e.toString()));
    }
  }

  Future<void> reload() => load();
}
