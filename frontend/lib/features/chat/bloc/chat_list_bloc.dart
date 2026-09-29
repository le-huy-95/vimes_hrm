import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_state.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/home/data/google_chat_repository.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';

class ChatListBloc extends Bloc<ChatListEvent, ChatListState> {
  ChatListBloc(
    this._googleChat,
    this._core,
    this._workspace, {
    this.currentUserId,
  }) : super(const ChatListInitial()) {
    on<ChatListStarted>(_onStarted);
    on<ChatListGroupChanged>(_onGroupChanged);
    on<ChatListRefreshRequested>(_onRefresh);
    on<ChatListSelectLinkRequested>(_onSelect);
    on<ChatListClearSelection>(_onClear);
    on<ChatListOpenByIdRequested>(_onOpenById);
    on<ChatListLinkSpacesRequested>(_onLinkSpaces);
    on<ChatListUnlinkRequested>(_onUnlink);

    _wsSub = _workspace.stream.listen((ws) {
      if (ws is WorkspaceReady) {
        add(ChatListGroupChanged(ws.selectedGroupId));
      }
    });
  }

  final GoogleChatRepository _googleChat;
  final CoreRepository _core;
  final WorkspaceBloc _workspace;
  final String? currentUserId;
  late final StreamSubscription<WorkspaceState> _wsSub;
  String? _groupId;

  ChatListReady? get _ready =>
      state is ChatListReady ? state as ChatListReady : null;

  Future<void> _onStarted(
    ChatListStarted event,
    Emitter<ChatListState> emit,
  ) async {
    final ws = _workspace.state;
    add(ChatListGroupChanged(ws is WorkspaceReady ? ws.selectedGroupId : null));
  }

  Future<void> _onGroupChanged(
    ChatListGroupChanged event,
    Emitter<ChatListState> emit,
  ) async {
    _groupId = event.groupId;
    if (event.groupId == null) {
      emit(const ChatListInitial());
      return;
    }
    emit(const ChatListLoading());
    try {
      emit(await _loadReady(event.groupId!));
    } catch (e) {
      emit(ChatListFailure(_msg(e)));
    }
  }

  Future<ChatListReady> _loadReady(
    String groupId, {
    GoogleChatLink? preferSelected,
    bool busy = false,
  }) async {
    final detail = await _core.getGroup(groupId);
    final memberLabels = {
      for (final m in detail.members)
        m.userId: (m.displayName?.trim().isNotEmpty == true)
            ? m.displayName!.trim()
            : (m.email.isNotEmpty ? m.email : m.userId),
    };
    final myRole = currentUserId == null
        ? null
        : detail.members
            .where((m) => m.userId == currentUserId)
            .map((m) => m.role)
            .firstOrNull;

    final readiness = await _googleChat.readiness();
    final links = readiness.isReady
        ? await _googleChat.listLinks(groupId)
        : <GoogleChatLink>[];

    GoogleChatLink? selected = preferSelected;
    if (selected != null) {
      selected = links.where((l) => l.id == selected!.id).firstOrNull ?? selected;
    }

    return ChatListReady(
      groupId: groupId,
      readiness: readiness,
      links: links,
      myRole: myRole,
      memberLabels: memberLabels,
      selected: selected,
      busy: busy,
    );
  }

  Future<void> _onRefresh(
    ChatListRefreshRequested event,
    Emitter<ChatListState> emit,
  ) async {
    add(ChatListGroupChanged(_groupId));
  }

  Future<void> _onSelect(
    ChatListSelectLinkRequested event,
    Emitter<ChatListState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    emit(prev.copyWith(selected: event.link));
  }

  Future<void> _onClear(
    ChatListClearSelection event,
    Emitter<ChatListState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    emit(prev.copyWith(clearSelected: true));
  }

  Future<void> _onOpenById(
    ChatListOpenByIdRequested event,
    Emitter<ChatListState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) {
      emit(const ChatListFailure('Chưa tải danh sách chat'));
      return;
    }
    final found = prev.links.where((l) => l.id == event.linkId).firstOrNull;
    if (found == null) {
      emit(const ChatListFailure('Không tìm thấy liên kết Google Chat'));
      emit(prev);
      return;
    }
    emit(prev.copyWith(selected: found));
  }

  Future<void> _onLinkSpaces(
    ChatListLinkSpacesRequested event,
    Emitter<ChatListState> emit,
  ) async {
    final groupId = _groupId;
    final prev = _ready;
    if (groupId == null || prev == null) return;
    if (!prev.isAdmin) {
      emit(const ChatListFailure('Chỉ admin/owner được liên kết Chat'));
      emit(prev);
      return;
    }
    emit(prev.copyWith(busy: true));
    try {
      GoogleChatLink? last;
      for (final space in event.spaces) {
        last = await _googleChat.createLink(
          groupId: groupId,
          spaceName: space.name,
          displayName: space.displayName,
          spaceType: space.spaceType,
        );
      }
      final ready = await _loadReady(groupId, preferSelected: last);
      emit(ready.copyWith(busy: false));
    } catch (e) {
      emit(ChatListFailure(_msg(e)));
      emit(prev.copyWith(busy: false));
    }
  }

  Future<void> _onUnlink(
    ChatListUnlinkRequested event,
    Emitter<ChatListState> emit,
  ) async {
    final groupId = _groupId;
    final prev = _ready;
    if (groupId == null || prev == null) return;
    emit(prev.copyWith(busy: true));
    try {
      await _googleChat.deleteLink(event.linkId);
      final clear = prev.selected?.id == event.linkId;
      final ready = await _loadReady(groupId);
      emit(ready.copyWith(busy: false, clearSelected: clear));
    } catch (e) {
      emit(ChatListFailure(_msg(e)));
      emit(prev.copyWith(busy: false));
    }
  }

  String _msg(Object e) => e is ApiException ? e.message : e.toString();

  @override
  Future<void> close() {
    _wsSub.cancel();
    return super.close();
  }
}
