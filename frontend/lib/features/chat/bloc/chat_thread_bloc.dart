import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_state.dart';
import 'package:manage_teams/features/home/data/chat_repository.dart';
import 'package:manage_teams/features/home/data/chat_socket_service.dart';

class ChatThreadBloc extends Bloc<ChatThreadEvent, ChatThreadState> {
  ChatThreadBloc(this._chat, this._socket) : super(const ChatThreadInitial()) {
    on<ChatThreadOpened>(_onOpened);
    on<ChatThreadClosed>(_onClosed);
    on<ChatThreadSendRequested>(_onSend);
    on<ChatThreadSocketMessage>(_onSocket);
  }

  final ChatRepository _chat;
  final ChatSocketService _socket;
  StreamSubscription<Map<String, dynamic>>? _socketSub;
  String? _conversationId;

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
    final prevId = _conversationId;
    if (prevId != null && prevId != event.conversationId) {
      await _socket.leave(prevId);
    }
    _conversationId = event.conversationId;
    emit(const ChatThreadLoading());
    try {
      await _socket.connect();
      await _socketSub?.cancel();
      _socketSub = _socket.messages.listen((raw) {
        add(ChatThreadSocketMessage(raw));
      });
      final msgs = await _chat.listMessages(event.conversationId);
      await _socket.join(event.conversationId);
      if (msgs.isNotEmpty) {
        unawaited(_chat.markRead(event.conversationId, msgs.last.seq));
      }
      emit(ChatThreadReady(
        conversationId: event.conversationId,
        messages: msgs,
      ));
    } catch (e) {
      emit(ChatThreadFailure(_msg(e)));
    }
  }

  Future<void> _onClosed(
    ChatThreadClosed event,
    Emitter<ChatThreadState> emit,
  ) async {
    final id = _conversationId;
    if (id != null) await _socket.leave(id);
    _conversationId = null;
    await _socketSub?.cancel();
    _socketSub = null;
    emit(const ChatThreadInitial());
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
      final sent = await _chat.sendMessage(prev.conversationId, body: text);
      final exists = prev.messages.any((m) => m.id == sent.id);
      final messages = exists ? prev.messages : [...prev.messages, sent];
      emit(prev.copyWith(messages: messages, busy: false));
    } catch (e) {
      emit(ChatThreadFailure(_msg(e), previous: prev));
      emit(prev.copyWith(busy: false));
    }
  }

  Future<void> _onSocket(
    ChatThreadSocketMessage event,
    Emitter<ChatThreadState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    final raw = event.raw;
    final socketEvent = raw['_event']?.toString();
    if (socketEvent == 'reaction' || socketEvent == 'mention') return;
    final convId = raw['conversationId']?.toString();
    if (convId != prev.conversationId) return;

    final msg = ChatMessage.fromJson({...raw, 'conversationId': convId});

    if (socketEvent == 'deleted') {
      emit(
        prev.copyWith(
          messages: prev.messages
              .map(
                (m) => m.id == msg.id
                    ? ChatMessage(
                        id: m.id,
                        seq: m.seq,
                        senderUserId: m.senderUserId,
                        body: '',
                        fileIds: m.fileIds,
                        mentions: m.mentions,
                        reactions: m.reactions,
                        createdAt: m.createdAt,
                        deleted: true,
                        clientMsgId: m.clientMsgId,
                        conversationId: m.conversationId,
                      )
                    : m,
              )
              .toList(),
        ),
      );
      return;
    }

    if (socketEvent == 'edited') {
      emit(
        prev.copyWith(
          messages: prev.messages.map((m) => m.id == msg.id ? msg : m).toList(),
        ),
      );
      return;
    }

    final exists = prev.messages.any(
      (m) =>
          m.id == msg.id ||
          (msg.clientMsgId != null && m.clientMsgId == msg.clientMsgId),
    );
    if (!exists) {
      emit(prev.copyWith(messages: [...prev.messages, msg]));
    }
  }

  String _msg(Object e) => e is ApiException ? e.message : e.toString();

  @override
  Future<void> close() async {
    await _socketSub?.cancel();
    final id = _conversationId;
    if (id != null) await _socket.leave(id);
    return super.close();
  }
}
