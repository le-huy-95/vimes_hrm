import 'package:equatable/equatable.dart';
import 'package:manage_teams/core/models/api_models.dart';

sealed class SyncState extends Equatable {
  const SyncState();
  @override
  List<Object?> get props => [];
}

class SyncInitial extends SyncState {
  const SyncInitial();
}

class SyncLoading extends SyncState {
  const SyncLoading();
}

class SyncReady extends SyncState {
  const SyncReady({required this.status, this.busy = false});

  final SyncStatus status;
  final bool busy;

  SyncReady copyWith({SyncStatus? status, bool? busy}) {
    return SyncReady(
      status: status ?? this.status,
      busy: busy ?? this.busy,
    );
  }

  @override
  List<Object?> get props => [status, busy];
}

class SyncFailure extends SyncState {
  const SyncFailure(this.message, {this.previous});
  final String message;
  final SyncReady? previous;
  @override
  List<Object?> get props => [message, previous];
}

class SyncActionSuccess extends SyncState {
  const SyncActionSuccess(this.message, {required this.ready});
  final String message;
  final SyncReady ready;
  @override
  List<Object?> get props => [message, ready];
}
