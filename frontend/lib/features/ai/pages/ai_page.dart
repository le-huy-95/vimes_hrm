import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/ai/bloc/ai_bloc.dart';
import 'package:manage_teams/features/ai/bloc/ai_event.dart';
import 'package:manage_teams/features/ai/bloc/ai_state.dart';
import 'package:manage_teams/features/ai/widgets/ai_chat_view.dart';

class AiPage extends StatelessWidget {
  const AiPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocListener<AiBloc, AiState>(
      listenWhen: (prev, next) {
        if (next is! AiReady || next.pendingLink == null) return false;
        final prevId = prev is AiReady ? prev.pendingLink?.id : null;
        return next.pendingLink!.id != prevId;
      },
      listener: (context, state) {
        // Bring shell back so AppShell can resolve deep-link with Tasks/Chat blocs.
        if (!context.canPop()) {
          final link =
              state is AiReady ? state.pendingLink : null;
          final path = switch (link?.type) {
            'task' => AppRoutes.tasks.path,
            'conversation' => AppRoutes.chat.path,
            _ => AppRoutes.home.path,
          };
          context.go(path);
        }
      },
      child: Scaffold(
        backgroundColor: ColorSkin.white,
        appBar: AppBar(
          title: const Text('Trợ lý AI'),
          actions: [
            BlocBuilder<AiBloc, AiState>(
              builder: (context, state) {
                final mock = state is AiReady ? state.mock : null;
                if (mock != true) return const SizedBox.shrink();
                return const Padding(
                  padding: EdgeInsets.only(right: 8),
                  child: Center(
                    child: Chip(
                      label: Text('Mock', style: TextStyle(fontSize: 11)),
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                    ),
                  ),
                );
              },
            ),
            TextButton(
              onPressed: () =>
                  context.read<AiBloc>().add(const AiNewChatRequested()),
              child: const Text('Chat mới'),
            ),
          ],
        ),
        body: const AiChatView(),
      ),
    );
  }
}
