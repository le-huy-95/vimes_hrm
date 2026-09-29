import 'package:equatable/equatable.dart';
import 'package:manage_teams/features/home/data/google_chat_repository.dart';

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

class ChatListSelectLinkRequested extends ChatListEvent {
  const ChatListSelectLinkRequested(this.link);
  final GoogleChatLink link;
  @override
  List<Object?> get props => [link.id];
}

class ChatListClearSelection extends ChatListEvent {
  const ChatListClearSelection();
}

class ChatListOpenByIdRequested extends ChatListEvent {
  const ChatListOpenByIdRequested(this.linkId);
  final String linkId;
  @override
  List<Object?> get props => [linkId];
}

class ChatListLinkSpacesRequested extends ChatListEvent {
  const ChatListLinkSpacesRequested(this.spaces);
  final List<GoogleChatSpaceItem> spaces;
  @override
  List<Object?> get props => [spaces.map((s) => s.name).toList()];
}

class ChatListUnlinkRequested extends ChatListEvent {
  const ChatListUnlinkRequested(this.linkId);
  final String linkId;
  @override
  List<Object?> get props => [linkId];
}
