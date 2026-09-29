import 'package:equatable/equatable.dart';
import 'package:manage_teams/features/ai/data/ai_models.dart';

sealed class AiEvent extends Equatable {
  const AiEvent();
  @override
  List<Object?> get props => [];
}

class AiStarted extends AiEvent {
  const AiStarted();
}

class AiMessageSent extends AiEvent {
  const AiMessageSent(this.message);
  final String message;
  @override
  List<Object?> get props => [message];
}

class AiNewChatRequested extends AiEvent {
  const AiNewChatRequested();
}

class AiRetryRequested extends AiEvent {
  const AiRetryRequested();
}

class AiLinkTapped extends AiEvent {
  const AiLinkTapped(this.link);
  final AiLink link;
  @override
  List<Object?> get props => [link.type, link.id];
}

class AiPendingLinkCleared extends AiEvent {
  const AiPendingLinkCleared();
}
