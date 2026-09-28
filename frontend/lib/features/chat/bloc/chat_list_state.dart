import 'package:equatable/equatable.dart';
import 'package:manage_teams/core/models/api_models.dart';

sealed class ChatListState extends Equatable {
  const ChatListState();
  @override
  List<Object?> get props => [];
}

class ChatListInitial extends ChatListState {
  const ChatListInitial();
}

class ChatListLoading extends ChatListState {
  const ChatListLoading();
}

class ChatListReady extends ChatListState {
  const ChatListReady({
    required this.groupConversations,
    required this.taskConversations,
    this.selected,
  });

  final List<ConversationItem> groupConversations;
  final List<ConversationItem> taskConversations;
  final ConversationItem? selected;

  ChatListReady copyWith({
    List<ConversationItem>? groupConversations,
    List<ConversationItem>? taskConversations,
    ConversationItem? selected,
    bool clearSelected = false,
  }) {
    return ChatListReady(
      groupConversations: groupConversations ?? this.groupConversations,
      taskConversations: taskConversations ?? this.taskConversations,
      selected: clearSelected ? null : (selected ?? this.selected),
    );
  }

  @override
  List<Object?> get props =>
      [groupConversations, taskConversations, selected?.id];
}

class ChatListFailure extends ChatListState {
  const ChatListFailure(this.message);
  final String message;
  @override
  List<Object?> get props => [message];
}
