import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_state.dart';
import 'package:manage_teams_app/features/auth/pages/login_page.dart';
import 'package:manage_teams_app/features/auth/pages/oauth_callback_page.dart';
import 'package:manage_teams_app/features/auth/pages/register_page.dart';
import 'package:manage_teams_app/features/shell/pages/app_shell_page.dart';
import 'package:manage_teams_app/features/teams/pages/create_team_page.dart';
import 'package:manage_teams_app/features/teams/pages/home_page.dart';
import 'package:manage_teams_app/features/teams/pages/team_detail_page.dart';

class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    _sub = stream.asBroadcastStream().listen((_) => notifyListeners());
  }

  late final StreamSubscription<dynamic> _sub;

  @override
  void dispose() {
    unawaited(_sub.cancel());
    super.dispose();
  }
}

class AppRouter {
  AppRouter({required AuthBloc authBloc}) : _authBloc = authBloc;

  final AuthBloc _authBloc;
  GoRouter? _router;

  GoRouter get router => _router ??= _build();

  GoRouter _build() {
    return GoRouter(
      initialLocation: '/',
      refreshListenable: GoRouterRefreshStream(_authBloc.stream),
      redirect: (context, state) {
        final auth = _authBloc.state;
        final loc = state.matchedLocation;
        final isPublic = loc == '/login' ||
            loc == '/register' ||
            loc == '/oauth/callback';

        if (auth is AuthInitial || auth is AuthLoading) {
          return null;
        }

        final loggedIn = auth is AuthAuthenticated;
        if (!loggedIn && !isPublic) return '/login';
        if (loggedIn && (loc == '/login' || loc == '/register')) return '/';
        return null;
      },
      routes: [
        GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
        GoRoute(
          path: '/register',
          builder: (context, state) => const RegisterPage(),
        ),
        GoRoute(
          path: '/oauth/callback',
          builder: (context, state) => const OAuthCallbackPage(),
        ),
        ShellRoute(
          builder: (context, state, child) => AppShellPage(child: child),
          routes: [
            GoRoute(
              path: '/',
              builder: (context, state) => const HomePage(),
            ),
            GoRoute(
              path: '/teams/new',
              builder: (context, state) => const CreateTeamPage(),
            ),
            GoRoute(
              path: '/teams/:teamId',
              builder: (context, state) => TeamDetailPage(
                teamId: state.pathParameters['teamId']!,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
