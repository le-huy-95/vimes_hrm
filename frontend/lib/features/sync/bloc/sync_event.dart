import 'package:equatable/equatable.dart';

sealed class SyncEvent extends Equatable {
  const SyncEvent();
  @override
  List<Object?> get props => [];
}

class SyncStarted extends SyncEvent {
  const SyncStarted();
}

class SyncRefreshRequested extends SyncEvent {
  const SyncRefreshRequested();
}

class SyncPullRequested extends SyncEvent {
  const SyncPullRequested();
}

class SyncFullRequested extends SyncEvent {
  const SyncFullRequested();
}
