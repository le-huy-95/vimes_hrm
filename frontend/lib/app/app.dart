import 'package:bot_toast/bot_toast.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/app/app_theme.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_event.dart';
import 'package:manage_teams/features/auth/data/auth_repository.dart';
import 'package:manage_teams/features/home/data/chat_repository.dart';
import 'package:manage_teams/features/home/data/chat_socket_service.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/home/data/device_repository.dart';
import 'package:manage_teams/features/home/data/file_repository.dart';
import 'package:manage_teams/features/home/data/sync_repository.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';

class ManageTeamsApp extends StatefulWidget {
  const ManageTeamsApp({super.key});

  @override
  State<ManageTeamsApp> createState() => _ManageTeamsAppState();
}

class _ManageTeamsAppState extends State<ManageTeamsApp> {
  late final ApiClient _api = ApiClient();
  late final AuthRepository _authRepo = AuthRepository(_api);
  late final AuthBloc _authBloc = AuthBloc(_authRepo)
    ..add(const AuthBootstrapRequested());
  late final GoRouter _router = createAppRouter(_authBloc);

  @override
  void dispose() {
    _authBloc.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: _api),
        RepositoryProvider.value(value: _authRepo),
        RepositoryProvider(create: (_) => CoreRepository(_api)),
        RepositoryProvider(create: (_) => ChatRepository(_api)),
        RepositoryProvider(create: (_) => FileRepository(_api)),
        RepositoryProvider(create: (_) => SyncRepository(_api)),
        RepositoryProvider(create: (_) => DeviceRepository(_api)),
        RepositoryProvider(
          create: (_) => ChatSocketService(_api.tokenStore),
        ),
      ],
      child: BlocProvider.value(
        value: _authBloc,
        child: MaterialApp.router(
          title: 'Manage Teams',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: ThemeMode.light,
          scaffoldMessengerKey: SimpleSnackbarService.scaffoldMessengerKey,
          builder: BotToastInit(),
          routerConfig: _router,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [
            Locale('vi', 'VN'),
            Locale('en', 'US'),
          ],
          locale: const Locale('vi', 'VN'),
        ),
      ),
    );
  }
}
