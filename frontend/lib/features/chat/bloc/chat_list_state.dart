import 'package:equatable/equatable.dart';
import 'package:manage_teams/features/home/data/google_chat_repository.dart';

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
    required this.groupId,
    required this.readiness,
    required this.links,
    required this.myRole,
    required this.memberLabels,
    this.selected,
    this.busy = false,
  });

  final String groupId;
  final ChatReadiness readiness;
  final List<GoogleChatLink> links;
  final String? myRole;
  final Map<String, String> memberLabels;
  final GoogleChatLink? selected;
  final bool busy;

  bool get isAdmin => myRole == 'OWNER' || myRole == 'ADMIN';

  ChatListReady copyWith({
    ChatReadiness? readiness,
    List<GoogleChatLink>? links,
    String? myRole,
    Map<String, String>? memberLabels,
    GoogleChatLink? selected,
    bool clearSelected = false,
    bool? busy,
  }) {
    return ChatListReady(
      groupId: groupId,
      readiness: readiness ?? this.readiness,
      links: links ?? this.links,
      myRole: myRole ?? this.myRole,
      memberLabels: memberLabels ?? this.memberLabels,
      selected: clearSelected ? null : (selected ?? this.selected),
      busy: busy ?? this.busy,
    );
  }

  @override
  List<Object?> get props => [
        groupId,
        readiness.status,
        readiness.reason,
        links,
        myRole,
        memberLabels,
        selected?.id,
        busy,
      ];
}

class ChatListFailure extends ChatListState {
  const ChatListFailure(this.message);
  final String message;
  @override
  List<Object?> get props => [message];
}
