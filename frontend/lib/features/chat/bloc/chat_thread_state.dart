import 'package:equatable/equatable.dart';
import 'package:manage_teams/features/home/data/google_chat_repository.dart';

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
    required this.groupId,
    required this.spaceName,
    required this.messages,
    this.title,
    this.busy = false,
    this.taskWarning,
  });

  final String groupId;
  final String spaceName;
  final String? title;
  final List<GoogleChatMessage> messages;
  final bool busy;
  final String? taskWarning;

  ChatThreadReady copyWith({
    List<GoogleChatMessage>? messages,
    bool? busy,
    String? title,
    String? taskWarning,
    bool clearTaskWarning = false,
  }) {
    return ChatThreadReady(
      groupId: groupId,
      spaceName: spaceName,
      title: title ?? this.title,
      messages: messages ?? this.messages,
      busy: busy ?? this.busy,
      taskWarning: clearTaskWarning ? null : (taskWarning ?? this.taskWarning),
    );
  }

  @override
  List<Object?> get props =>
      [groupId, spaceName, title, messages, busy, taskWarning];
}

class ChatThreadFailure extends ChatThreadState {
  const ChatThreadFailure(this.message, {this.previous});
  final String message;
  final ChatThreadReady? previous;
  @override
  List<Object?> get props => [message, previous];
}
