import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_event.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

class WorkspaceBloc extends Bloc<WorkspaceEvent, WorkspaceState> {
  WorkspaceBloc(this._core) : super(const WorkspaceInitial()) {
    on<WorkspaceStarted>(_onStarted);
    on<WorkspaceRefreshRequested>(_onRefresh);
    on<WorkspaceOrgSelected>(_onOrgSelected);
    on<WorkspaceGroupSelected>(_onGroupSelected);
    on<WorkspaceOrgCreated>(_onOrgCreated);
    on<WorkspaceGroupCreated>(_onGroupCreated);
  }

  final CoreRepository _core;
  static const _orgKey = 'ws_org_id';
  static const _groupKey = 'ws_group_id';

  Future<void> _onStarted(
    WorkspaceStarted event,
    Emitter<WorkspaceState> emit,
  ) async {
    emit(const WorkspaceLoading());
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedOrg = prefs.getString(_orgKey);
      final savedGroup = prefs.getString(_groupKey);
      final orgs = await _core.listOrganizations();
      var orgId = savedOrg;
      if (orgId == null || !orgs.any((o) => o.id == orgId)) {
        orgId = orgs.isNotEmpty ? orgs.first.id : null;
      }
      List<GroupSummary> groups = const [];
      String? groupId;
      if (orgId != null) {
        groups = await _core.listGroups(orgId);
        groupId = savedGroup;
        if (groupId == null || !groups.any((g) => g.id == groupId)) {
          groupId = groups.isNotEmpty ? groups.first.id : null;
        }
      }
      await _persist(prefs, orgId, groupId);
      emit(
        WorkspaceReady(
          orgs: orgs,
          groups: groups,
          selectedOrgId: orgId,
          selectedGroupId: groupId,
        ),
      );
    } catch (e) {
      emit(WorkspaceFailure(_msg(e)));
    }
  }

  Future<void> _onRefresh(
    WorkspaceRefreshRequested event,
    Emitter<WorkspaceState> emit,
  ) async {
    final current = state;
    final orgId = current is WorkspaceReady ? current.selectedOrgId : null;
    final groupId = current is WorkspaceReady ? current.selectedGroupId : null;
    emit(const WorkspaceLoading());
    try {
      final prefs = await SharedPreferences.getInstance();
      final orgs = await _core.listOrganizations();
      var nextOrg = orgId;
      if (nextOrg == null || !orgs.any((o) => o.id == nextOrg)) {
        nextOrg = orgs.isNotEmpty ? orgs.first.id : null;
      }
      final groups =
          nextOrg == null ? <GroupSummary>[] : await _core.listGroups(nextOrg);
      var nextGroup = groupId;
      if (nextGroup == null || !groups.any((g) => g.id == nextGroup)) {
        nextGroup = groups.isNotEmpty ? groups.first.id : null;
      }
      await _persist(prefs, nextOrg, nextGroup);
      emit(
        WorkspaceReady(
          orgs: orgs,
          groups: groups,
          selectedOrgId: nextOrg,
          selectedGroupId: nextGroup,
        ),
      );
    } catch (e) {
      emit(WorkspaceFailure(_msg(e)));
    }
  }

  Future<void> _onOrgSelected(
    WorkspaceOrgSelected event,
    Emitter<WorkspaceState> emit,
  ) async {
    final current = state;
    if (current is! WorkspaceReady) return;
    try {
      final groups = await _core.listGroups(event.orgId);
      final groupId = groups.isNotEmpty ? groups.first.id : null;
      final prefs = await SharedPreferences.getInstance();
      await _persist(prefs, event.orgId, groupId);
      emit(
        WorkspaceReady(
          orgs: current.orgs,
          groups: groups,
          selectedOrgId: event.orgId,
          selectedGroupId: groupId,
        ),
      );
    } catch (e) {
      emit(WorkspaceFailure(_msg(e)));
    }
  }

  Future<void> _onGroupSelected(
    WorkspaceGroupSelected event,
    Emitter<WorkspaceState> emit,
  ) async {
    final current = state;
    if (current is! WorkspaceReady) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_groupKey, event.groupId);
    emit(current.copyWith(selectedGroupId: event.groupId));
  }

  Future<void> _onOrgCreated(
    WorkspaceOrgCreated event,
    Emitter<WorkspaceState> emit,
  ) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final orgs = await _core.listOrganizations();
      final groups = await _core.listGroups(event.orgId);
      final groupId = groups.isNotEmpty ? groups.first.id : null;
      await _persist(prefs, event.orgId, groupId);
      emit(
        WorkspaceReady(
          orgs: orgs,
          groups: groups,
          selectedOrgId: event.orgId,
          selectedGroupId: groupId,
        ),
      );
    } catch (e) {
      emit(WorkspaceFailure(_msg(e)));
    }
  }

  Future<void> _onGroupCreated(
    WorkspaceGroupCreated event,
    Emitter<WorkspaceState> emit,
  ) async {
    final current = state;
    final orgId = current is WorkspaceReady ? current.selectedOrgId : null;
    if (orgId == null) {
      add(const WorkspaceRefreshRequested());
      return;
    }
    try {
      final groups = await _core.listGroups(orgId);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_groupKey, event.groupId);
      if (current is WorkspaceReady) {
        emit(
          current.copyWith(
            groups: groups,
            selectedGroupId: event.groupId,
          ),
        );
      }
    } catch (e) {
      emit(WorkspaceFailure(_msg(e)));
    }
  }

  Future<void> _persist(
    SharedPreferences prefs,
    String? orgId,
    String? groupId,
  ) async {
    if (orgId != null) {
      await prefs.setString(_orgKey, orgId);
    } else {
      await prefs.remove(_orgKey);
    }
    if (groupId != null) {
      await prefs.setString(_groupKey, groupId);
    } else {
      await prefs.remove(_groupKey);
    }
  }

  String _msg(Object e) {
    if (e is ApiException) return e.message;
    return e.toString();
  }
}
