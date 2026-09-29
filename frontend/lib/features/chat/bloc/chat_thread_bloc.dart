import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_state.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/home/data/google_chat_repository.dart';

class ChatThreadBloc extends Bloc<ChatThreadEvent, ChatThreadState> {
  ChatThreadBloc(
    this._googleChat,
    this._core, {
    this.currentUserId,
  }) : super(const ChatThreadInitial()) {
    on<ChatThreadOpened>(_onOpened);
    on<ChatThreadClosed>(_onClosed);
    on<ChatThreadSendRequested>(_onSend);
    on<ChatThreadRefreshRequested>(_onRefresh);
    on<ChatThreadCreateTaskRequested>(_onCreateTask);
  }

  final GoogleChatRepository _googleChat;
  final CoreRepository _core;
  final String? currentUserId;
  Timer? _poll;
  String? _groupId;
  String? _spaceName;

  ChatThreadReady? get _ready {
    final s = state;
    if (s is ChatThreadReady) return s;
    if (s is ChatThreadFailure) return s.previous;
    return null;
  }

  Future<void> _onOpened(
    ChatThreadOpened event,
    Emitter<ChatThreadState> emit,
  ) async {
    _poll?.cancel();
    _groupId = event.groupId;
    _spaceName = event.spaceName;
    emit(const ChatThreadLoading());
    try {
      final page = await _googleChat.listMessages(
        groupId: event.groupId,
        spaceName: event.spaceName,
      );
      emit(ChatThreadReady(
        groupId: event.groupId,
        spaceName: event.spaceName,
        title: event.title,
        messages: page.messages.reversed.toList(),
      ));
      _poll = Timer.periodic(const Duration(seconds: 10), (_) {
        add(const ChatThreadRefreshRequested());
      });
    } catch (e) {
      emit(ChatThreadFailure(_msg(e)));
    }
  }

  Future<void> _onClosed(
    ChatThreadClosed event,
    Emitter<ChatThreadState> emit,
  ) async {
    _poll?.cancel();
    _poll = null;
    _groupId = null;
    _spaceName = null;
    emit(const ChatThreadInitial());
  }

  Future<void> _onRefresh(
    ChatThreadRefreshRequested event,
    Emitter<ChatThreadState> emit,
  ) async {
    final prev = _ready;
    final groupId = _groupId;
    final spaceName = _spaceName;
    if (prev == null || groupId == null || spaceName == null) return;
    try {
      final page = await _googleChat.listMessages(
        groupId: groupId,
        spaceName: spaceName,
      );
      emit(prev.copyWith(messages: page.messages.reversed.toList()));
    } catch (_) {
      // Keep previous messages on poll failure.
    }
  }

  Future<void> _onSend(
    ChatThreadSendRequested event,
    Emitter<ChatThreadState> emit,
  ) async {
    final prev = _ready;
    final text = event.body.trim();
    if (prev == null || text.isEmpty) return;
    emit(prev.copyWith(busy: true));
    try {
      await _googleChat.sendMessage(
        groupId: prev.groupId,
        spaceName: prev.spaceName,
        text: text,
      );
      final page = await _googleChat.listMessages(
        groupId: prev.groupId,
        spaceName: prev.spaceName,
      );
      emit(prev.copyWith(
        messages: page.messages.reversed.toList(),
        busy: false,
      ));
    } catch (e) {
      emit(ChatThreadFailure(_msg(e), previous: prev));
      emit(prev.copyWith(busy: false));
    }
  }

  Future<void> _onCreateTask(
    ChatThreadCreateTaskRequested event,
    Emitter<ChatThreadState> emit,
  ) async {
    final prev = _ready;
    final title = event.title.trim();
    if (prev == null || title.isEmpty) return;
    emit(prev.copyWith(busy: true, clearTaskWarning: true));
    try {
      final task = await _core.createTask(
        prev.groupId,
        title: title,
        assigneeIds: event.assigneeIds.isEmpty ? null : event.assigneeIds,
        dueDate: event.dueDate,
      );
      String? warning;
      try {
        final names = event.assigneeIds.isEmpty
            ? ''
            : ' → ${event.assigneeIds.length} người';
        await _googleChat.sendMessage(
          groupId: prev.groupId,
          spaceName: prev.spaceName,
          text: 'Đã tạo ${task.code}: ${task.title}$names',
        );
      } catch (_) {
        warning = 'Đã tạo ${task.code} nhưng không gửi được tin lên Google Chat';
      }
      final page = await _googleChat.listMessages(
        groupId: prev.groupId,
        spaceName: prev.spaceName,
      );
      emit(prev.copyWith(
        messages: page.messages.reversed.toList(),
        busy: false,
        taskWarning: warning,
      ));
    } catch (e) {
      emit(ChatThreadFailure(_msg(e), previous: prev));
      emit(prev.copyWith(busy: false));
    }
  }

  String _msg(Object e) => e is ApiException ? e.message : e.toString();

  @override
  Future<void> close() {
    _poll?.cancel();
    return super.close();
  }
}
