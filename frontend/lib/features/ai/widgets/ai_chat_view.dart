import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/ai/bloc/ai_bloc.dart';
import 'package:manage_teams/features/ai/bloc/ai_event.dart';
import 'package:manage_teams/features/ai/bloc/ai_state.dart';
import 'package:manage_teams/features/ai/data/ai_models.dart';
import 'package:manage_teams/features/ai/widgets/ai_link_chip.dart';

class AiChatView extends StatefulWidget {
  const AiChatView({super.key, this.compact = false});

  final bool compact;

  @override
  State<AiChatView> createState() => _AiChatViewState();
}

class _AiChatViewState extends State<AiChatView> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();

  static const _suggestions = [
    'Việc nào của tôi đang mở?',
    'Tóm tắt khối lượng việc',
    'Trạng thái đồng bộ Google?',
  ];

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send([String? preset]) {
    final text = (preset ?? _controller.text).trim();
    if (text.isEmpty) return;
    context.read<AiBloc>().add(AiMessageSent(text));
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AiBloc, AiState>(
      listenWhen: (p, n) =>
          n is AiReady &&
          (n.messages.length !=
                  (p is AiReady ? p.messages.length : 0) ||
              n.sending != (p is AiReady ? p.sending : false)),
      listener: (context, state) {
        if (state is! AiReady) return;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!_scroll.hasClients) return;
          _scroll.animateTo(
            _scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        });
      },
      builder: (context, state) {
        final ready = state is AiReady ? state : const AiReady();
        final sending = ready.sending;

        return Column(
          children: [
            if (ready.banner != null)
              MaterialBanner(
                content: Text(ready.banner!),
                backgroundColor: ColorSkin.tealLight,
                actions: [
                  TextButton(
                    onPressed: () => context
                        .read<AiBloc>()
                        .add(const AiNewChatRequested()),
                    child: const Text('OK'),
                  ),
                ],
              ),
            if (ready.lastError != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        ready.lastError!,
                        style: const TextStyle(color: ColorSkin.error),
                      ),
                    ),
                    TextButton(
                      onPressed: sending
                          ? null
                          : () => context
                              .read<AiBloc>()
                              .add(const AiRetryRequested()),
                      child: const Text('Thử lại'),
                    ),
                  ],
                ),
              ),
            Expanded(
              child: ready.messages.isEmpty
                  ? _EmptySuggestions(
                      suggestions: _suggestions,
                      onPick: sending ? null : _send,
                    )
                  : ListView.builder(
                      controller: _scroll,
                      padding: const EdgeInsets.all(12),
                      itemCount: ready.messages.length + (sending ? 1 : 0),
                      itemBuilder: (context, i) {
                        if (sending && i == ready.messages.length) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 8),
                            child: Text(
                              'Đang tra cứu…',
                              style: TextStyle(color: ColorSkin.subtitle),
                            ),
                          );
                        }
                        final m = ready.messages[i];
                        return _Bubble(
                          message: m,
                          onLink: (link) => context
                              .read<AiBloc>()
                              .add(AiLinkTapped(link)),
                        );
                      },
                    ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  12,
                  8,
                  12,
                  widget.compact ? 8 : 12,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        enabled: !sending,
                        minLines: 1,
                        maxLines: 4,
                        maxLength: 4000,
                        decoration: InputDecoration(
                          hintText: 'Hỏi trợ lý AI…',
                          counterText: '',
                          filled: true,
                          fillColor: const Color(0xFFF5F7F7),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                        ),
                        textInputAction: TextInputAction.send,
                        onSubmitted: sending ? null : (_) => _send(),
                        inputFormatters: [
                          LengthLimitingTextInputFormatter(4000),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: sending ? null : () => _send(),
                      style: IconButton.styleFrom(
                        backgroundColor: ColorSkin.primary,
                        foregroundColor: Colors.white,
                      ),
                      icon: const Icon(Icons.send_rounded),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _EmptySuggestions extends StatelessWidget {
  const _EmptySuggestions({
    required this.suggestions,
    required this.onPick,
  });
  final List<String> suggestions;
  final ValueChanged<String>? onPick;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.auto_awesome, color: ColorSkin.primary, size: 40),
            const SizedBox(height: 12),
            const Text(
              'Hỏi về việc đang mở, khối lượng, hoặc đồng bộ Google',
              textAlign: TextAlign.center,
              style: TextStyle(color: ColorSkin.subtitle),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                for (final s in suggestions)
                  ActionChip(
                    label: Text(s),
                    onPressed: onPick == null ? null : () => onPick!(s),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.onLink});
  final AiChatMessage message;
  final ValueChanged<AiLink> onLink;

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == AiMessageRole.user;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.85,
        ),
        child: Column(
          crossAxisAlignment:
              isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Container(
              margin: const EdgeInsets.symmetric(vertical: 4),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: isUser ? ColorSkin.primary : ColorSkin.tealLight,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(14),
                  topRight: const Radius.circular(14),
                  bottomLeft: Radius.circular(isUser ? 14 : 4),
                  bottomRight: Radius.circular(isUser ? 4 : 14),
                ),
              ),
              child: Text(
                message.text,
                style: TextStyle(
                  color: isUser ? Colors.white : ColorSkin.title,
                  height: 1.35,
                ),
              ),
            ),
            if (!isUser && message.links.isNotEmpty)
              Wrap(
                children: [
                  for (final link in message.links)
                    AiLinkChip(link: link, onTap: () => onLink(link)),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
