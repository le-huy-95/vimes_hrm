import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_state.dart';
import 'package:manage_teams/features/home/data/chat_repository.dart';
import 'package:manage_teams/features/home/data/chat_socket_service.dart';
import 'package:manage_teams/features/home/data/file_repository.dart';

class ChatThreadBloc extends Bloc<ChatThreadEvent, ChatThreadState> {
  ChatThreadBloc(
    this._chat,
    this._socket,
    this._files, {
    this.currentUserId,
  }) : super(const ChatThreadInitial()) {
    on<ChatThreadOpened>(_onOpened);
    on<ChatThreadClosed>(_onClosed);
    on<ChatThreadSendRequested>(_onSend);
    on<ChatThreadAttachRequested>(_onAttach);
    on<ChatThreadReactionToggled>(_onReaction);
    on<ChatThreadSocketMessage>(_onSocket);
  }

  final ChatRepository _chat;
  final ChatSocketService _socket;
  final FileRepository _files;
  final String? currentUserId;
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
    final fileIds = event.fileIds ?? const <String>[];
    if (prev == null) return;
    if (text.isEmpty && fileIds.isEmpty) return;
    emit(prev.copyWith(busy: true));
    try {
      final sent = await _chat.sendMessage(
        prev.conversationId,
        body: text,
        fileIds: fileIds.isEmpty ? null : fileIds,
      );
      final exists = prev.messages.any((m) => m.id == sent.id);
      final messages = exists ? prev.messages : [...prev.messages, sent];
      emit(prev.copyWith(messages: messages, busy: false));
    } catch (e) {
      emit(ChatThreadFailure(_msg(e), previous: prev));
      emit(prev.copyWith(busy: false));
    }
  }

  Future<void> _onAttach(
    ChatThreadAttachRequested event,
    Emitter<ChatThreadState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    emit(prev.copyWith(busy: true));
    try {
      final init = await _files.initUpload(
        conversationId: prev.conversationId,
        originalName: event.fileName,
        sizeBytes: event.bytes.length,
        contentType: event.contentType,
      );
      if (!init.deduped && init.putUrl != null) {
        await _files.putBytes(
          init.putUrl!,
          event.bytes,
          contentType: event.contentType,
        );
        await _files.complete(init.fileId);
      }
      final sent = await _chat.sendMessage(
        prev.conversationId,
        body: event.caption.trim(),
        fileIds: [init.fileId],
      );
      final exists = prev.messages.any((m) => m.id == sent.id);
      final messages = exists ? prev.messages : [...prev.messages, sent];
      emit(prev.copyWith(messages: messages, busy: false));
    } catch (e) {
      emit(ChatThreadFailure(_msg(e), previous: prev));
      emit(prev.copyWith(busy: false));
    }
  }

  Future<void> _onReaction(
    ChatThreadReactionToggled event,
    Emitter<ChatThreadState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    try {
      final result = await _chat.toggleReaction(
        prev.conversationId,
        event.messageId,
        event.emoji,
      );
      emit(
        prev.copyWith(
          messages: prev.messages
              .map(
                (m) => m.id == event.messageId
                    ? _applyReaction(
                        m,
                        emoji: result.emoji,
                        removed: result.removed,
                        fromMe: true,
                      )
                    : m,
              )
              .toList(),
        ),
      );
    } catch (e) {
      emit(ChatThreadFailure(_msg(e), previous: prev));
      emit(prev);
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
    final convId = raw['conversationId']?.toString();
    if (convId != null && convId != prev.conversationId) return;

    if (socketEvent == 'mention') return;

    if (socketEvent == 'reaction') {
      final messageId = raw['messageId']?.toString();
      final emoji = raw['emoji']?.toString();
      if (messageId == null || emoji == null) return;
      final removed = raw['removed'] as bool? ?? false;
      final fromUserId = raw['userId']?.toString();
      final fromMe =
          currentUserId != null && fromUserId == currentUserId;
      emit(
        prev.copyWith(
          messages: prev.messages
              .map(
                (m) => m.id == messageId
                    ? _applyReaction(
                        m,
                        emoji: emoji,
                        removed: removed,
                        fromMe: fromMe,
                      )
                    : m,
              )
              .toList(),
        ),
      );
      return;
    }

    final msg = ChatMessage.fromJson({
      ...raw,
      'conversationId': convId ?? prev.conversationId,
    });

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
                        fileIds: const [],
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

  ChatMessage _applyReaction(
    ChatMessage m, {
    required String emoji,
    required bool removed,
    required bool fromMe,
  }) {
    final list = [...m.reactions];
    final idx = list.indexWhere((r) => r.emoji == emoji);
    if (removed) {
      if (idx >= 0) {
        final cur = list[idx];
        final nextCount = cur.count - 1;
        if (nextCount <= 0) {
          list.removeAt(idx);
        } else {
          list[idx] = ReactionAgg(
            emoji: emoji,
            count: nextCount,
            me: fromMe ? false : cur.me,
          );
        }
      }
    } else {
      if (idx >= 0) {
        final cur = list[idx];
        list[idx] = ReactionAgg(
          emoji: emoji,
          count: fromMe && cur.me ? cur.count : cur.count + 1,
          me: fromMe ? true : cur.me,
        );
      } else {
        list.add(ReactionAgg(emoji: emoji, count: 1, me: fromMe));
      }
    }
    return ChatMessage(
      id: m.id,
      seq: m.seq,
      senderUserId: m.senderUserId,
      body: m.body,
      fileIds: m.fileIds,
      mentions: m.mentions,
      reactions: list,
      createdAt: m.createdAt,
      deleted: m.deleted,
      clientMsgId: m.clientMsgId,
      replyToId: m.replyToId,
      editedAt: m.editedAt,
      conversationId: m.conversationId,
      deduped: m.deduped,
    );
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
