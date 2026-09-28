import 'package:equatable/equatable.dart';
import 'package:manage_teams/core/models/api_models.dart';

sealed class WorkspaceState extends Equatable {
  const WorkspaceState();
  @override
  List<Object?> get props => [];
}

class WorkspaceInitial extends WorkspaceState {
  const WorkspaceInitial();
}

class WorkspaceLoading extends WorkspaceState {
  const WorkspaceLoading();
}

class WorkspaceReady extends WorkspaceState {
  const WorkspaceReady({
    required this.orgs,
    required this.groups,
    this.selectedOrgId,
    this.selectedGroupId,
  });

  final List<OrganizationItem> orgs;
  final List<GroupSummary> groups;
  final String? selectedOrgId;
  final String? selectedGroupId;

  OrganizationItem? get selectedOrg {
    if (selectedOrgId == null) return null;
    for (final o in orgs) {
      if (o.id == selectedOrgId) return o;
    }
    return null;
  }

  GroupSummary? get selectedGroup {
    if (selectedGroupId == null) return null;
    for (final g in groups) {
      if (g.id == selectedGroupId) return g;
    }
    return null;
  }

  WorkspaceReady copyWith({
    List<OrganizationItem>? orgs,
    List<GroupSummary>? groups,
    String? selectedOrgId,
    String? selectedGroupId,
    bool clearGroup = false,
  }) {
    return WorkspaceReady(
      orgs: orgs ?? this.orgs,
      groups: groups ?? this.groups,
      selectedOrgId: selectedOrgId ?? this.selectedOrgId,
      selectedGroupId:
          clearGroup ? null : (selectedGroupId ?? this.selectedGroupId),
    );
  }

  @override
  List<Object?> get props => [orgs, groups, selectedOrgId, selectedGroupId];
}

class WorkspaceFailure extends WorkspaceState {
  const WorkspaceFailure(this.message);
  final String message;
  @override
  List<Object?> get props => [message];
}
