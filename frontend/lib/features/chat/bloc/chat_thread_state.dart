import 'package:equatable/equatable.dart';
import 'package:manage_teams/core/models/api_models.dart';

sealed class ChatThreadState extends Equatable {
  const ChatThreadState();
  @override
  List<Object?> get props => [];
}

class ChatThreadInitial extends ChatThreadState {
  const ChatThreadInitial();
}

class ChatThreadLoading extends ChatThreadState {
  const ChatThreadLoading();
}

class ChatThreadReady extends ChatThreadState {
  const ChatThreadReady({
    required this.conversationId,
    required this.messages,
    this.busy = false,
  });

  final String conversationId;
  final List<ChatMessage> messages;
  final bool busy;

  ChatThreadReady copyWith({
    List<ChatMessage>? messages,
    bool? busy,
  }) {
    return ChatThreadReady(
      conversationId: conversationId,
      messages: messages ?? this.messages,
      busy: busy ?? this.busy,
    );
  }

  @override
  List<Object?> get props => [conversationId, messages, busy];
}

class ChatThreadFailure extends ChatThreadState {
  const ChatThreadFailure(this.message, {this.previous});
  final String message;
  final ChatThreadReady? previous;
  @override
  List<Object?> get props => [message, previous];
}
