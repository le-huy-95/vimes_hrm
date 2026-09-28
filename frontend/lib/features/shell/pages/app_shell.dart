import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_event.dart';
import 'package:manage_teams/features/shell/widgets/workspace_picker_bar.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static const _tabs = [
    (label: 'Home', icon: Icons.home_outlined, selected: Icons.home),
    (label: 'Tasks', icon: Icons.view_kanban_outlined, selected: Icons.view_kanban),
    (label: 'Chat', icon: Icons.chat_bubble_outline, selected: Icons.chat_bubble),
    (label: 'Sync', icon: Icons.sync_outlined, selected: Icons.sync),
  ];

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final index = navigationShell.currentIndex;

    return Scaffold(
      backgroundColor: ColorSkin.white,
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            const Text(
              'Vimes',
              style: TextStyle(
                color: ColorSkin.primary,
                fontWeight: FontWeight.w800,
              ),
            ),
            if (wide) ...[
              const SizedBox(width: 24),
              for (var i = 0; i < _tabs.length; i++)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: TextButton(
                    onPressed: () => navigationShell.goBranch(i),
                    style: TextButton.styleFrom(
                      foregroundColor:
                          i == index ? ColorSkin.primary : ColorSkin.subtitle,
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
            const Flexible(child: WorkspacePickerBar(compact: true)),
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
      body: navigationShell,
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: index,
              onDestinationSelected: navigationShell.goBranch,
              destinations: [
                for (final t in _tabs)
                  NavigationDestination(
                    icon: Icon(t.icon),
                    selectedIcon: Icon(t.selected),
                    label: t.label,
                  ),
              ],
            ),
    );
  }
}
