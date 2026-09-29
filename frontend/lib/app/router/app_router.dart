import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/features/ai/pages/ai_page.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_state.dart';
import 'package:manage_teams/features/auth/pages/forgot_password_page.dart';
import 'package:manage_teams/features/auth/pages/link_google_page.dart';
import 'package:manage_teams/features/auth/pages/login_page.dart';
import 'package:manage_teams/features/auth/pages/register_page.dart';
import 'package:manage_teams/features/auth/pages/reset_password_page.dart';
import 'package:manage_teams/features/auth/pages/verify_otp_page.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_bloc.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_bloc.dart';
import 'package:manage_teams/features/chat/pages/chat_tab_page.dart';
import 'package:manage_teams/features/home/bloc/home_bloc.dart';
import 'package:manage_teams/features/home/bloc/home_event.dart';
import 'package:manage_teams/features/home/data/chat_repository.dart';
import 'package:manage_teams/features/home/data/chat_socket_service.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/home/data/file_repository.dart';
import 'package:manage_teams/features/home/data/sync_repository.dart';
import 'package:manage_teams/features/home/pages/home_tab_page.dart';
import 'package:manage_teams/features/shell/pages/app_shell.dart';
import 'package:manage_teams/features/splash/pages/splash_page.dart';
import 'package:manage_teams/features/sync/bloc/sync_bloc.dart';
import 'package:manage_teams/features/sync/bloc/sync_event.dart';
import 'package:manage_teams/features/sync/pages/sync_tab_page.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_bloc.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_event.dart';
import 'package:manage_teams/features/tasks/pages/tasks_tab_page.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_event.dart';

enum AppRoutes {
  splash('/'),
  login('/login'),
  register('/register'),
  verifyOtp('/verify-otp'),
  forgotPassword('/forgot-password'),
  resetPassword('/reset-password'),
  linkGoogle('/link-google'),
  home('/home'),
  tasks('/tasks'),
  chat('/chat'),
  sync('/sync'),
  ai('/ai');

  const AppRoutes(this.path);
  final String path;
}

Map<String, dynamic>? _extraMap(Object? extra) {
  if (extra is Map<String, dynamic>) return extra;
  if (extra is Map) {
    return extra.map((key, value) => MapEntry(key.toString(), value));
  }
  return null;
}

String? _extraString(Object? extra, String key) {
  final map = _extraMap(extra);
  final value = map?[key];
  return value is String ? value : null;
}

class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(AuthBloc bloc) {
    _sub = bloc.stream.listen((_) => notifyListeners());
  }

  late final StreamSubscription<AuthState> _sub;

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

GoRouter createAppRouter(AuthBloc authBloc) {
  return GoRouter(
    initialLocation: AppRoutes.splash.path,
    refreshListenable: GoRouterRefreshStream(authBloc),
    redirect: (context, state) {
      final auth = authBloc.state;
      final loc = state.matchedLocation;
      final isAuthRoute = loc == AppRoutes.login.path ||
          loc == AppRoutes.register.path ||
          loc == AppRoutes.verifyOtp.path ||
          loc == AppRoutes.forgotPassword.path ||
          loc == AppRoutes.resetPassword.path ||
          loc == AppRoutes.splash.path;

      final isAppRoute = loc == AppRoutes.home.path ||
          loc == AppRoutes.tasks.path ||
          loc == AppRoutes.chat.path ||
          loc == AppRoutes.sync.path ||
          loc == AppRoutes.ai.path;

      if (auth is AuthUnknown || auth is AuthLoading) {
        return loc == AppRoutes.splash.path ? null : AppRoutes.splash.path;
      }
      if (auth is AuthAuthenticated) {
        final needsLink = auth.needsGoogleLink;
        final onLinkPage = loc == AppRoutes.linkGoogle.path;
        if (needsLink) {
          return onLinkPage ? null : AppRoutes.linkGoogle.path;
        }
        if (onLinkPage || isAuthRoute) return AppRoutes.home.path;
        return null;
      }
      if (auth is AuthUnauthenticated || auth is AuthFailure) {
        if (isAppRoute ||
            loc == AppRoutes.splash.path ||
            loc == AppRoutes.linkGoogle.path) {
          return AppRoutes.login.path;
        }
        return null;
      }
      return null;
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash.path,
        builder: (context, state) => const SplashPage(),
      ),
      GoRoute(
        path: AppRoutes.login.path,
        builder: (context, state) {
          final message = _extraString(state.extra, 'message');
          return LoginPage(infoMessage: message);
        },
      ),
      GoRoute(
        path: AppRoutes.register.path,
        builder: (context, state) => const RegisterPage(),
      ),
      GoRoute(
        path: AppRoutes.verifyOtp.path,
        builder: (context, state) {
          return VerifyOtpPage(
            email: _extraString(state.extra, 'email'),
            phone: _extraString(state.extra, 'phone'),
          );
        },
      ),
      GoRoute(
        path: AppRoutes.forgotPassword.path,
        builder: (context, state) {
          return ForgotPasswordPage(
            initialEmail: _extraString(state.extra, 'email'),
          );
        },
      ),
      GoRoute(
        path: AppRoutes.resetPassword.path,
        builder: (context, state) {
          return ResetPasswordPage(
            email: _extraString(state.extra, 'email') ?? '',
            infoMessage: _extraString(state.extra, 'message'),
          );
        },
      ),
      GoRoute(
        path: AppRoutes.linkGoogle.path,
        builder: (context, state) => const LinkGooglePage(),
      ),
      GoRoute(
        path: AppRoutes.ai.path,
        builder: (context, state) => const AiPage(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return MultiBlocProvider(
            providers: [
              BlocProvider(
                create: (ctx) => WorkspaceBloc(ctx.read<CoreRepository>())
                  ..add(const WorkspaceStarted()),
              ),
              BlocProvider(
                create: (ctx) => HomeBloc(
                  ctx.read<CoreRepository>(),
                  ctx.read<WorkspaceBloc>(),
                )..add(const HomeStarted()),
              ),
              BlocProvider(
                create: (ctx) => TasksBloc(
                  ctx.read<CoreRepository>(),
                  ctx.read<WorkspaceBloc>(),
                )..add(const TasksStarted()),
              ),
              BlocProvider(
                create: (ctx) => ChatListBloc(
                  ctx.read<ChatRepository>(),
                  ctx.read<CoreRepository>(),
                  ctx.read<WorkspaceBloc>(),
                )..add(const ChatListStarted()),
              ),
              BlocProvider(
                create: (ctx) {
                  final auth = authBloc.state;
                  final userId = auth is AuthAuthenticated ? auth.user.id : null;
                  return ChatThreadBloc(
                    ctx.read<ChatRepository>(),
                    ctx.read<ChatSocketService>(),
                    ctx.read<FileRepository>(),
                    currentUserId: userId,
                  );
                },
              ),
              BlocProvider(
                create: (ctx) => SyncBloc(ctx.read<SyncRepository>())
                  ..add(const SyncStarted()),
              ),
            ],
            child: AppShell(navigationShell: navigationShell),
          );
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.home.path,
                builder: (context, state) => const HomeTabPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.tasks.path,
                builder: (context, state) => const TasksTabPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.chat.path,
                builder: (context, state) => const ChatTabPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.sync.path,
                builder: (context, state) => const SyncTabPage(),
              ),
            ],
          ),
        ],
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(child: Text('Không tìm thấy trang: ${state.uri}')),
    ),
  );
}
