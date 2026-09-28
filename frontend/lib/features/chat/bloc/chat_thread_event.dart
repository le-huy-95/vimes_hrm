import 'dart:typed_data';

import 'package:equatable/equatable.dart';

sealed class ChatThreadEvent extends Equatable {
  const ChatThreadEvent();
  @override
  List<Object?> get props => [];
}

class ChatThreadOpened extends ChatThreadEvent {
  const ChatThreadOpened(this.conversationId);
  final String conversationId;
  @override
  List<Object?> get props => [conversationId];
}

class ChatThreadClosed extends ChatThreadEvent {
  const ChatThreadClosed();
}

class ChatThreadSendRequested extends ChatThreadEvent {
  const ChatThreadSendRequested(this.body, {this.fileIds});
  final String body;
  final List<String>? fileIds;
  @override
  List<Object?> get props => [body, fileIds];
}

class ChatThreadAttachRequested extends ChatThreadEvent {
  const ChatThreadAttachRequested({
    required this.bytes,
    required this.fileName,
    this.contentType,
    this.caption = '',
  });

  final Uint8List bytes;
  final String fileName;
  final String? contentType;
  final String caption;

  @override
  List<Object?> get props => [fileName, bytes.length, contentType, caption];
}

class ChatThreadReactionToggled extends ChatThreadEvent {
  const ChatThreadReactionToggled({
    required this.messageId,
    required this.emoji,
  });
  final String messageId;
  final String emoji;
  @override
  List<Object?> get props => [messageId, emoji];
}

class ChatThreadSearchRequested extends ChatThreadEvent {
  const ChatThreadSearchRequested(this.query);
  final String query;
  @override
  List<Object?> get props => [query];
}

class ChatThreadClearSearch extends ChatThreadEvent {
  const ChatThreadClearSearch();
}

class ChatThreadSocketMessage extends ChatThreadEvent {
  const ChatThreadSocketMessage(this.raw);
  final Map<String, dynamic> raw;
  @override
  List<Object?> get props => [raw];
}
