import 'package:equatable/equatable.dart';

sealed class ChatThreadEvent extends Equatable {
  const ChatThreadEvent();
  @override
  List<Object?> get props => [];
}

class ChatThreadOpened extends ChatThreadEvent {
  const ChatThreadOpened({
    required this.groupId,
    required this.spaceName,
    this.title,
  });
  final String groupId;
  final String spaceName;
  final String? title;
  @override
  List<Object?> get props => [groupId, spaceName, title];
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

class ChatThreadRefreshRequested extends ChatThreadEvent {
  const ChatThreadRefreshRequested();
}

class ChatThreadCreateTaskRequested extends ChatThreadEvent {
  const ChatThreadCreateTaskRequested({
    required this.title,
    this.assigneeIds = const [],
    this.dueDate,
  });
  final String title;
  final List<String> assigneeIds;
  final String? dueDate;
  @override
  List<Object?> get props => [title, assigneeIds, dueDate];
}
