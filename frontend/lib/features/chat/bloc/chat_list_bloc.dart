import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_state.dart';
import 'package:manage_teams/features/home/data/chat_repository.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';

class ChatListBloc extends Bloc<ChatListEvent, ChatListState> {
  ChatListBloc(this._chat, this._core, this._workspace)
      : super(const ChatListInitial()) {
    on<ChatListStarted>(_onStarted);
    on<ChatListGroupChanged>(_onGroupChanged);
    on<ChatListRefreshRequested>(_onRefresh);
    on<ChatListSelectRequested>(_onSelect);
    on<ChatListClearSelection>(_onClear);
    on<ChatListOpenByIdRequested>(_onOpenById);

    _wsSub = _workspace.stream.listen((ws) {
      if (ws is WorkspaceReady) {
        add(ChatListGroupChanged(ws.selectedGroupId));
      }
    });
  }

  final ChatRepository _chat;
  final CoreRepository _core;
  final WorkspaceBloc _workspace;
  late final StreamSubscription<WorkspaceState> _wsSub;
  String? _groupId;

  ChatListReady? get _ready => state is ChatListReady ? state as ChatListReady : null;

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
      emit(const ChatListReady(
        groupConversations: [],
        taskConversations: [],
      ));
      return;
    }
    emit(const ChatListLoading());
    try {
      final all = await _chat.listConversations();
      final tasks = await _core.listTasks(event.groupId!);
      final taskIds = tasks.map((t) => t.id).toSet();
      final groupConvs = all
          .where((c) => c.type == 'GROUP' && c.groupId == event.groupId)
          .toList();
      final taskConvs = all.where((c) {
        if (c.type != 'TASK' && c.type != 'TASK_THREAD') return false;
        if (c.groupId == event.groupId) return true;
        return c.taskId != null && taskIds.contains(c.taskId);
      }).toList();
      emit(ChatListReady(
        groupConversations: groupConvs,
        taskConversations: taskConvs,
      ));
    } catch (e) {
      emit(ChatListFailure(_msg(e)));
    }
  }

  Future<void> _onRefresh(
    ChatListRefreshRequested event,
    Emitter<ChatListState> emit,
  ) async {
    add(ChatListGroupChanged(_groupId));
  }

  Future<void> _onSelect(
    ChatListSelectRequested event,
    Emitter<ChatListState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    emit(prev.copyWith(selected: event.conversation));
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
    ConversationItem? found;
    for (final c in [...prev.groupConversations, ...prev.taskConversations]) {
      if (c.id == event.conversationId) {
        found = c;
        break;
      }
    }
    if (found == null) {
      emit(const ChatListFailure('Không tìm thấy hội thoại'));
      emit(prev);
      return;
    }
    emit(prev.copyWith(selected: found));
  }

  String _msg(Object e) => e is ApiException ? e.message : e.toString();

  @override
  Future<void> close() {
    _wsSub.cancel();
    return super.close();
  }
}
