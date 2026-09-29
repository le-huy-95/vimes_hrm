import 'package:equatable/equatable.dart';
import 'package:manage_teams/core/models/api_models.dart';

sealed class ChatListEvent extends Equatable {
  const ChatListEvent();
  @override
  List<Object?> get props => [];
}

class ChatListStarted extends ChatListEvent {
  const ChatListStarted();
}

class ChatListGroupChanged extends ChatListEvent {
  const ChatListGroupChanged(this.groupId);
  final String? groupId;
  @override
  List<Object?> get props => [groupId];
}

class ChatListRefreshRequested extends ChatListEvent {
  const ChatListRefreshRequested();
}

class ChatListSelectRequested extends ChatListEvent {
  const ChatListSelectRequested(this.conversation);
  final ConversationItem conversation;
  @override
  List<Object?> get props => [conversation.id];
}

class ChatListClearSelection extends ChatListEvent {
  const ChatListClearSelection();
}

class ChatListOpenByIdRequested extends ChatListEvent {
  const ChatListOpenByIdRequested(this.conversationId);
  final String conversationId;
  @override
  List<Object?> get props => [conversationId];
}
