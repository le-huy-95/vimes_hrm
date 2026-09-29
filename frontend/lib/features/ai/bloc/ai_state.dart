import 'package:equatable/equatable.dart';
import 'package:manage_teams/features/ai/data/ai_models.dart';

sealed class AiState extends Equatable {
  const AiState();
  @override
  List<Object?> get props => [];
}

class AiInitial extends AiState {
  const AiInitial();
}

class AiReady extends AiState {
  const AiReady({
    this.sessionId,
    this.messages = const [],
    this.sending = false,
    this.mock,
    this.banner,
    this.lastError,
    this.lastFailedMessage,
    this.pendingLink,
  });

  final String? sessionId;
  final List<AiChatMessage> messages;
  final bool sending;
  final bool? mock;
  final String? banner;
  final String? lastError;
  final String? lastFailedMessage;
  final AiLink? pendingLink;

  AiReady copyWith({
    String? sessionId,
    bool clearSession = false,
    List<AiChatMessage>? messages,
    bool? sending,
    bool? mock,
    String? banner,
    bool clearBanner = false,
    String? lastError,
    bool clearError = false,
    String? lastFailedMessage,
    bool clearFailed = false,
    AiLink? pendingLink,
    bool clearPendingLink = false,
  }) {
    return AiReady(
      sessionId: clearSession ? null : (sessionId ?? this.sessionId),
      messages: messages ?? this.messages,
      sending: sending ?? this.sending,
      mock: mock ?? this.mock,
      banner: clearBanner ? null : (banner ?? this.banner),
      lastError: clearError ? null : (lastError ?? this.lastError),
      lastFailedMessage:
          clearFailed ? null : (lastFailedMessage ?? this.lastFailedMessage),
      pendingLink:
          clearPendingLink ? null : (pendingLink ?? this.pendingLink),
    );
  }

  @override
  List<Object?> get props => [
        sessionId,
        messages,
        sending,
        mock,
        banner,
        lastError,
        lastFailedMessage,
        pendingLink?.id,
      ];
}
