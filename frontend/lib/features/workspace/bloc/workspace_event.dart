import 'package:equatable/equatable.dart';

sealed class WorkspaceEvent extends Equatable {
  const WorkspaceEvent();
  @override
  List<Object?> get props => [];
}

class WorkspaceStarted extends WorkspaceEvent {
  const WorkspaceStarted();
}

class WorkspaceRefreshRequested extends WorkspaceEvent {
  const WorkspaceRefreshRequested();
}

class WorkspaceOrgSelected extends WorkspaceEvent {
  const WorkspaceOrgSelected(this.orgId);
  final String orgId;
  @override
  List<Object?> get props => [orgId];
}

class WorkspaceGroupSelected extends WorkspaceEvent {
  const WorkspaceGroupSelected(this.groupId);
  final String groupId;
  @override
  List<Object?> get props => [groupId];
}

class WorkspaceOrgCreated extends WorkspaceEvent {
  const WorkspaceOrgCreated(this.orgId);
  final String orgId;
  @override
  List<Object?> get props => [orgId];
}

class WorkspaceGroupCreated extends WorkspaceEvent {
  const WorkspaceGroupCreated(this.groupId);
  final String groupId;
  @override
  List<Object?> get props => [groupId];
}
