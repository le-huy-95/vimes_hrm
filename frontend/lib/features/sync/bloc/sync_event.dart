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

/// Dispatched only while Sync tab is visible (performance: no background fetch).
class SyncGroupContextChanged extends SyncEvent {
  const SyncGroupContextChanged(this.groupId);
  final String? groupId;
  @override
  List<Object?> get props => [groupId];
}

class SyncSheetEnsureRequested extends SyncEvent {
  const SyncSheetEnsureRequested();
}

/// Fan-out sheet status for groups in the selected org (Sheets tab list).
class SyncOrgSheetsRefreshRequested extends SyncEvent {
  const SyncOrgSheetsRefreshRequested(this.groupIds);
  final List<String> groupIds;
  @override
  List<Object?> get props => [groupIds];
}

class SyncSheetPushRequested extends SyncEvent {
  const SyncSheetPushRequested();
}

class SyncSheetPullRequested extends SyncEvent {
  const SyncSheetPullRequested();
}
