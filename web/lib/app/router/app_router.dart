import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_event.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_state.dart';
import 'package:manage_teams_app/features/auth/pages/login_page.dart';
import 'package:manage_teams_app/features/auth/pages/oauth_callback_page.dart';
import 'package:manage_teams_app/features/auth/pages/register_page.dart';

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
        GoRoute(path: '/register', builder: (context, state) => const RegisterPage()),
        GoRoute(
          path: '/oauth/callback',
          builder: (context, state) => const OAuthCallbackPage(),
        ),
        GoRoute(
          path: '/',
          builder: (context, _) {
            final auth = context.watch<AuthBloc>().state;
            final name =
                auth is AuthAuthenticated ? auth.user.fullName : '…';
            return Scaffold(
              appBar: AppBar(
                title: const Text('Manage Teams'),
                actions: [
                  IconButton(
                    tooltip: 'Đăng xuất',
                    onPressed: () => context
                        .read<AuthBloc>()
                        .add(const AuthLogoutRequested()),
                    icon: const Icon(Icons.logout),
                  ),
                ],
              ),
              body: Center(
                child: Text(
                  'Xin chào $name\n(Shell/teams — Task 5)',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          },
        ),
        GoRoute(
          path: '/teams/new',
          builder: (context, state) => const Scaffold(
            body: Center(child: Text('Create team — Task 5')),
          ),
        ),
        GoRoute(
          path: '/teams/:teamId',
          builder: (context, state) => Scaffold(
            body: Center(
              child: Text('Team ${state.pathParameters['teamId']} — Task 6'),
            ),
          ),
        ),
      ],
    );
  }
}
