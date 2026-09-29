import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/ai/ai_navigation.dart';
import 'package:manage_teams/features/ai/bloc/ai_bloc.dart';
import 'package:manage_teams/features/ai/bloc/ai_event.dart';
import 'package:manage_teams/features/ai/bloc/ai_state.dart';
import 'package:manage_teams/features/ai/pages/ai_page.dart';
import 'package:manage_teams/features/ai/widgets/ai_chat_view.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_event.dart';
import 'package:manage_teams/features/auth/widgets/app_logo.dart';
import 'package:manage_teams/features/shell/widgets/account_switcher.dart';
import 'package:manage_teams/features/shell/widgets/workspace_switcher.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  bool _aiPanelOpen = false;

  static const _tabs = [
    (label: 'Home', icon: Icons.home_outlined, selected: Icons.home),
    (label: 'Tasks', icon: Icons.view_kanban_outlined, selected: Icons.view_kanban),
    (label: 'Chat', icon: Icons.chat_bubble_outline, selected: Icons.chat_bubble),
    (label: 'Sheets', icon: Icons.table_chart_outlined, selected: Icons.table_chart),
  ];

  void _openAi(bool wide) {
    if (wide) {
      setState(() => _aiPanelOpen = !_aiPanelOpen);
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BlocProvider.value(
          value: context.read<AiBloc>(),
          child: const AiPage(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final index = widget.navigationShell.currentIndex;

    return BlocListener<AiBloc, AiState>(
      listenWhen: (prev, next) {
        if (next is! AiReady) return false;
        final prevLink = prev is AiReady ? prev.pendingLink?.id : null;
        return next.pendingLink != null && next.pendingLink!.id != prevLink;
      },
      listener: (context, state) {
        if (state is! AiReady || state.pendingLink == null) return;
        final link = state.pendingLink!;
        context.read<AiBloc>().add(const AiPendingLinkCleared());
        if (_aiPanelOpen) setState(() => _aiPanelOpen = false);
        if (Navigator.of(context).canPop()) {
          Navigator.of(context).popUntil((r) => r.isFirst);
        }
        try {
          navigateAiLink(context, link);
        } catch (e) {
          SimpleSnackbarService.showError(e.toString());
        }
      },
      child: Scaffold(
        backgroundColor: ColorSkin.white,
        appBar: AppBar(
          titleSpacing: 16,
          title: Row(
            children: [
              const AppLogo(width: 36, height: 36),
              if (wide) ...[
                const SizedBox(width: 24),
                for (var i = 0; i < _tabs.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: TextButton(
                      onPressed: () => widget.navigationShell.goBranch(i),
                      style: TextButton.styleFrom(
                        foregroundColor: i == index
                            ? ColorSkin.primary
                            : ColorSkin.subtitle,
                        textStyle: TextStyle(
                          fontWeight:
                              i == index ? FontWeight.w700 : FontWeight.w500,
                        ),
                      ),
                      child: Text(_tabs[i].label),
                    ),
                  ),
              ],
              const Spacer(),
              const Flexible(child: AccountSwitcher()),
              const SizedBox(width: 8),
              const Flexible(child: WorkspaceSwitcher()),
              IconButton(
                tooltip: 'Đăng xuất',
                icon: const Icon(Icons.logout),
                onPressed: () {
                  context.read<AuthBloc>().add(const AuthLogoutRequested());
                  context.go(AppRoutes.login.path);
                },
              ),
            ],
          ),
        ),
        body: Row(
          children: [
            Expanded(child: widget.navigationShell),
            if (wide && _aiPanelOpen)
              Material(
                elevation: 8,
                color: ColorSkin.white,
                child: SizedBox(
                  width: 400,
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
                        child: Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'Trợ lý AI',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                            BlocBuilder<AiBloc, AiState>(
                              builder: (context, state) {
                                final mock =
                                    state is AiReady ? state.mock : null;
                                if (mock != true) {
                                  return const SizedBox.shrink();
                                }
                                return const Padding(
                                  padding: EdgeInsets.only(right: 4),
                                  child: Chip(
                                    label: Text(
                                      'Mock',
                                      style: TextStyle(fontSize: 11),
                                    ),
                                    visualDensity: VisualDensity.compact,
                                    padding: EdgeInsets.zero,
                                  ),
                                );
                              },
                            ),
                            TextButton(
                              onPressed: () => context
                                  .read<AiBloc>()
                                  .add(const AiNewChatRequested()),
                              child: const Text('Chat mới'),
                            ),
                            IconButton(
                              tooltip: 'Đóng',
                              onPressed: () =>
                                  setState(() => _aiPanelOpen = false),
                              icon: const Icon(Icons.close),
                            ),
                          ],
                        ),
                      ),
                      const Divider(height: 1),
                      const Expanded(child: AiChatView(compact: true)),
                    ],
                  ),
                ),
              ),
          ],
        ),
        floatingActionButton: FloatingActionButton(
          tooltip: 'Trợ lý AI',
          backgroundColor: ColorSkin.primary,
          foregroundColor: Colors.white,
          onPressed: () => _openAi(wide),
          child: Icon(
            _aiPanelOpen ? Icons.close : Icons.auto_awesome,
          ),
        ),
        bottomNavigationBar: wide
            ? null
            : NavigationBar(
                selectedIndex: index,
                onDestinationSelected: widget.navigationShell.goBranch,
                destinations: [
                  for (final t in _tabs)
                    NavigationDestination(
                      icon: Icon(t.icon),
                      selectedIcon: Icon(t.selected),
                      label: t.label,
                    ),
                ],
              ),
      ),
    );
  }
}
