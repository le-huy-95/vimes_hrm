import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/home/bloc/home_event.dart';
import 'package:manage_teams/features/home/bloc/home_state.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_event.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';

class HomeBloc extends Bloc<HomeEvent, HomeState> {
  HomeBloc(this._core, this._workspace) : super(const HomeInitial()) {
    on<HomeStarted>(_onStarted);
    on<HomeGroupChanged>(_onGroupChanged);
    on<HomeCreateOrgRequested>(_onCreateOrg);
    on<HomeCreateGroupRequested>(_onCreateGroup);
    on<HomeInviteRequested>(_onInvite);
    on<HomeAcceptInviteRequested>(_onAcceptInvite);
    on<HomeRemoveMemberRequested>(_onRemoveMember);

    _wsSub = _workspace.stream.listen((ws) {
      if (ws is WorkspaceReady) {
        add(HomeGroupChanged(ws.selectedGroupId));
      }
    });
  }

  final CoreRepository _core;
  final WorkspaceBloc _workspace;
  late final StreamSubscription<WorkspaceState> _wsSub;
  String? _groupId;

  List<GroupMember> get _members {
    final s = state;
    if (s is HomeReady) return s.members;
    if (s is HomeFailure) return s.members;
    if (s is HomeActionSuccess) return s.members;
    return const [];
  }

  Future<void> _onStarted(HomeStarted event, Emitter<HomeState> emit) async {
    final ws = _workspace.state;
    final groupId = ws is WorkspaceReady ? ws.selectedGroupId : null;
    add(HomeGroupChanged(groupId));
  }

  Future<void> _onGroupChanged(
    HomeGroupChanged event,
    Emitter<HomeState> emit,
  ) async {
    _groupId = event.groupId;
    if (event.groupId == null) {
      emit(const HomeReady(members: []));
      return;
    }
    emit(const HomeLoading());
    try {
      final detail = await _core.getGroup(event.groupId!);
      emit(HomeReady(members: detail.members));
    } catch (e) {
      emit(HomeFailure(_msg(e), members: _members));
    }
  }

  Future<void> _onCreateOrg(
    HomeCreateOrgRequested event,
    Emitter<HomeState> emit,
  ) async {
    emit(HomeReady(members: _members, busy: true));
    try {
      final org = await _core.createOrganization(event.name.trim());
      _workspace.add(WorkspaceOrgCreated(org.id));
      emit(HomeActionSuccess('Đã tạo tổ chức', members: _members));
      emit(HomeReady(members: _members));
    } catch (e) {
      emit(HomeFailure(_msg(e), members: _members));
      emit(HomeReady(members: _members));
    }
  }

  Future<void> _onCreateGroup(
    HomeCreateGroupRequested event,
    Emitter<HomeState> emit,
  ) async {
    final ws = _workspace.state;
    if (ws is! WorkspaceReady || ws.selectedOrgId == null) {
      emit(HomeFailure('Chưa chọn tổ chức', members: _members));
      emit(HomeReady(members: _members));
      return;
    }
    emit(HomeReady(members: _members, busy: true));
    try {
      final g = await _core.createGroup(ws.selectedOrgId!, event.name.trim());
      _workspace.add(WorkspaceGroupCreated(g.id));
      final detail = await _core.getGroup(g.id);
      emit(HomeActionSuccess('Đã tạo nhóm', members: detail.members));
      emit(HomeReady(members: detail.members));
    } catch (e) {
      emit(HomeFailure(_msg(e), members: _members));
      emit(HomeReady(members: _members));
    }
  }

  Future<void> _onInvite(
    HomeInviteRequested event,
    Emitter<HomeState> emit,
  ) async {
    final ws = _workspace.state;
    if (ws is! WorkspaceReady || ws.selectedOrgId == null) {
      emit(HomeFailure('Chưa chọn tổ chức', members: _members));
      emit(HomeReady(members: _members));
      return;
    }
    emit(HomeReady(members: _members, busy: true));
    try {
      await _core.inviteToOrganization(
        ws.selectedOrgId!,
        email: event.email.trim(),
        role: event.role,
      );
      emit(HomeActionSuccess('Đã gửi lời mời', members: _members));
      emit(HomeReady(members: _members));
    } catch (e) {
      emit(HomeFailure(_msg(e), members: _members));
      emit(HomeReady(members: _members));
    }
  }

  Future<void> _onAcceptInvite(
    HomeAcceptInviteRequested event,
    Emitter<HomeState> emit,
  ) async {
    emit(HomeReady(members: _members, busy: true));
    try {
      await _core.acceptOrgInvitation(event.token.trim());
      _workspace.add(const WorkspaceRefreshRequested());
      emit(HomeActionSuccess('Đã tham gia tổ chức', members: _members));
      emit(HomeReady(members: _members));
    } catch (e) {
      emit(HomeFailure(_msg(e), members: _members));
      emit(HomeReady(members: _members));
    }
  }

  Future<void> _onRemoveMember(
    HomeRemoveMemberRequested event,
    Emitter<HomeState> emit,
  ) async {
    if (_groupId == null) return;
    emit(HomeReady(members: _members, busy: true));
    try {
      await _core.removeGroupMember(_groupId!, event.userId);
      final detail = await _core.getGroup(_groupId!);
      emit(HomeActionSuccess('Đã xóa thành viên', members: detail.members));
      emit(HomeReady(members: detail.members));
    } catch (e) {
      emit(HomeFailure(_msg(e), members: _members));
      emit(HomeReady(members: _members));
    }
  }

  String _msg(Object e) => e is ApiException ? e.message : e.toString();

  @override
  Future<void> close() {
    _wsSub.cancel();
    return super.close();
  }
}
