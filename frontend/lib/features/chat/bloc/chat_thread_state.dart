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
    this.searchQuery = '',
    this.searchResults = const [],
    this.searching = false,
  });

  final String conversationId;
  final List<ChatMessage> messages;
  final bool busy;
  final String searchQuery;
  final List<ChatMessage> searchResults;
  final bool searching;

  bool get isSearching => searchQuery.trim().length >= 2;

  ChatThreadReady copyWith({
    List<ChatMessage>? messages,
    bool? busy,
    String? searchQuery,
    List<ChatMessage>? searchResults,
    bool? searching,
    bool clearSearch = false,
  }) {
    return ChatThreadReady(
      conversationId: conversationId,
      messages: messages ?? this.messages,
      busy: busy ?? this.busy,
      searchQuery: clearSearch ? '' : (searchQuery ?? this.searchQuery),
      searchResults:
          clearSearch ? const [] : (searchResults ?? this.searchResults),
      searching: clearSearch ? false : (searching ?? this.searching),
    );
  }

  @override
  List<Object?> get props =>
      [conversationId, messages, busy, searchQuery, searchResults, searching];
}

class ChatThreadFailure extends ChatThreadState {
  const ChatThreadFailure(this.message, {this.previous});
  final String message;
  final ChatThreadReady? previous;
  @override
  List<Object?> get props => [message, previous];
}
