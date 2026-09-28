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
  const ChatThreadSendRequested(this.body);
  final String body;
  @override
  List<Object?> get props => [body];
}

class ChatThreadSocketMessage extends ChatThreadEvent {
  const ChatThreadSocketMessage(this.raw);
  final Map<String, dynamic> raw;
  @override
  List<Object?> get props => [raw];
}
