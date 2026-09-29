import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/ai/bloc/ai_event.dart';
import 'package:manage_teams/features/ai/bloc/ai_state.dart';
import 'package:manage_teams/features/ai/data/ai_models.dart';
import 'package:manage_teams/features/ai/data/ai_repository.dart';

class AiBloc extends Bloc<AiEvent, AiState> {
  AiBloc(this._repo) : super(const AiInitial()) {
    on<AiStarted>(_onStarted);
    on<AiMessageSent>(_onMessageSent);
    on<AiNewChatRequested>(_onNewChat);
    on<AiRetryRequested>(_onRetry);
    on<AiLinkTapped>(_onLinkTapped);
    on<AiPendingLinkCleared>(_onPendingCleared);
  }

  final AiRepository _repo;

  AiReady get _ready {
    final s = state;
    if (s is AiReady) return s;
    return const AiReady();
  }

  void _onStarted(AiStarted event, Emitter<AiState> emit) {
    if (state is! AiReady) emit(const AiReady());
  }

  Future<void> _onMessageSent(
    AiMessageSent event,
    Emitter<AiState> emit,
  ) async {
    final text = event.message.trim();
    if (text.isEmpty) return;
    await _send(text, emit);
  }

  Future<void> _onRetry(AiRetryRequested event, Emitter<AiState> emit) async {
    final failed = _ready.lastFailedMessage;
    if (failed == null || failed.isEmpty) return;
    await _send(failed, emit, isRetry: true);
  }

  void _onNewChat(AiNewChatRequested event, Emitter<AiState> emit) {
    emit(const AiReady());
  }

  void _onLinkTapped(AiLinkTapped event, Emitter<AiState> emit) {
    emit(_ready.copyWith(pendingLink: event.link));
  }

  void _onPendingCleared(AiPendingLinkCleared event, Emitter<AiState> emit) {
    emit(_ready.copyWith(clearPendingLink: true));
  }

  Future<void> _send(
    String text,
    Emitter<AiState> emit, {
    bool isRetry = false,
  }) async {
    var ready = _ready;
    final messages = [
      ...isRetry
          ? ready.messages
          : [
              ...ready.messages,
              AiChatMessage(role: AiMessageRole.user, text: text),
            ],
    ];
    ready = ready.copyWith(
      messages: messages,
      sending: true,
      clearError: true,
      clearBanner: true,
      clearFailed: true,
      lastFailedMessage: text,
    );
    emit(ready);

    var sessionId = ready.sessionId;
    var mock = ready.mock;
    var assistantText = '';
    var links = <AiLink>[];
    var gotAssistant = false;

    try {
      await for (final ev in _repo.chatStream(
        message: text,
        sessionId: sessionId,
      )) {
        switch (ev.event) {
          case 'meta':
            sessionId = ev.data['sessionId'] as String? ?? sessionId;
            mock = ev.data['mock'] as bool? ?? mock;
            emit(ready.copyWith(sessionId: sessionId, mock: mock));
            ready = _ready;
          case 'token':
            final chunk = ev.data['text'] as String? ?? '';
            assistantText = chunk.isEmpty ? assistantText : chunk;
            gotAssistant = true;
            ready = _upsertAssistant(ready, assistantText, links);
            emit(ready.copyWith(sending: true));
          case 'links':
            links = (ev.data['links'] as List? ?? [])
                .whereType<Map>()
                .map((e) => AiLink.fromJson(Map<String, dynamic>.from(e)))
                .toList();
            ready = _upsertAssistant(ready, assistantText, links);
            emit(ready.copyWith(sending: true));
          case 'done':
            ready = _upsertAssistant(ready, assistantText, links).copyWith(
              sending: false,
              clearFailed: true,
              sessionId: sessionId,
              mock: mock,
            );
            emit(ready);
          case 'error':
            final msg = ev.data['message']?.toString() ??
                'AI tạm không trả lời được';
            emit(ready.copyWith(
              sending: false,
              lastError: msg,
              lastFailedMessage: text,
            ));
        }
      }
      if (_ready.sending) {
        emit(_ready.copyWith(sending: false, clearFailed: true));
      }
    } catch (e) {
      if (!gotAssistant) {
        try {
          final result = await _repo.chat(
            message: text,
            sessionId: sessionId,
          );
          final withResult = _upsertAssistant(
            _ready.copyWith(
              sessionId: result.sessionId,
              mock: result.mock,
            ),
            result.answer,
            result.links,
          ).copyWith(sending: false, clearFailed: true, clearError: true);
          emit(withResult);
          return;
        } catch (e2) {
          emit(_errorState(_ready, e2, text));
          return;
        }
      }
      emit(_errorState(_ready, e, text));
    }
  }

  AiReady _upsertAssistant(
    AiReady ready,
    String text,
    List<AiLink> links,
  ) {
    final msgs = [...ready.messages];
    if (msgs.isNotEmpty && msgs.last.role == AiMessageRole.assistant) {
      msgs[msgs.length - 1] =
          msgs.last.copyWith(text: text, links: links);
    } else {
      msgs.add(
        AiChatMessage(
          role: AiMessageRole.assistant,
          text: text,
          links: links,
        ),
      );
    }
    return ready.copyWith(messages: msgs);
  }

  AiReady _errorState(AiReady ready, Object e, String text) {
    final code = e is ApiException ? e.code : null;
    if (code == 'NOT_FOUND') {
      return const AiReady(
        banner: 'Đã mở chat mới',
        lastError: null,
      );
    }
    return ready.copyWith(
      sending: false,
      lastError: _userMessage(e),
      lastFailedMessage: text,
    );
  }

  String _userMessage(Object e) {
    if (e is ApiException) {
      switch (e.code) {
        case 'RATE_LIMIT':
          return e.message.isNotEmpty
              ? e.message
              : 'Quá nhiều yêu cầu AI. Thử lại sau ~1 phút.';
        case 'AI_BUDGET':
          return e.message.isNotEmpty
              ? e.message
              : 'Hết hạn mức AI hôm nay.';
        case 'AI_TIMEOUT':
        case 'AI_PROVIDER':
        case 'BAD_GATEWAY':
          return 'AI tạm không trả lời được';
        case 'VALIDATION':
          return e.message;
        case 'UNAUTHORIZED':
          return e.message.isNotEmpty ? e.message : 'Phiên đăng nhập hết hạn.';
        default:
          return e.message;
      }
    }
    return e.toString();
  }
}
