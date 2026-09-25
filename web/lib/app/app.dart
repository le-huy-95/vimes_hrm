import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:manage_teams_app/app/app_theme.dart';
import 'package:manage_teams_app/app/router/app_router.dart';
import 'package:manage_teams_app/core/network/auth_interceptor.dart';
import 'package:manage_teams_app/core/network/dio_client.dart';
import 'package:manage_teams_app/core/storage/token_store.dart';
import 'package:manage_teams_app/data/repositories/auth_repository_impl.dart';
import 'package:manage_teams_app/data/repositories/org_repository_impl.dart';
import 'package:manage_teams_app/data/repositories/team_repository_impl.dart';
import 'package:manage_teams_app/domain/repositories/auth_repository.dart';
import 'package:manage_teams_app/domain/repositories/org_repository.dart';
import 'package:manage_teams_app/domain/repositories/team_repository.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_event.dart';
import 'package:manage_teams_app/features/shell/bloc/shell_cubit.dart';

class ManageTeamsApp extends StatefulWidget {
  const ManageTeamsApp({super.key});

  @override
  State<ManageTeamsApp> createState() => _ManageTeamsAppState();
}

class _ManageTeamsAppState extends State<ManageTeamsApp> {
  late final TokenStore _tokenStore;
  late final AuthRepository _authRepository;
  late final TeamRepository _teamRepository;
  late final OrgRepository _orgRepository;
  late final AuthBloc _authBloc;
  late final ShellCubit _shellCubit;
  late final AppRouter _appRouter;

  @override
  void initState() {
    super.initState();
    _tokenStore = SecureTokenStore();
    _authRepository = AuthRepositoryImpl(tokenStore: _tokenStore);
    _teamRepository = TeamRepositoryImpl();
    _orgRepository = OrgRepositoryImpl();
    _shellCubit = ShellCubit(teamRepository: _teamRepository);

    final dio = DioClient.instance;
    late final AuthBloc authBloc;
    authBloc = AuthBloc(authRepository: _authRepository);
    dio.interceptors.add(
      AuthInterceptor(
        tokenStore: _tokenStore,
        dio: dio,
        onSessionExpired: () {
          if (!authBloc.isClosed) {
            authBloc.add(const AuthSessionExpired());
          }
        },
      ),
    );
    _authBloc = authBloc;
    _appRouter = AppRouter(authBloc: _authBloc);
    _authBloc.add(const AuthStarted());
  }

  @override
  void dispose() {
    _authBloc.close();
    _shellCubit.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider<AuthRepository>.value(value: _authRepository),
        RepositoryProvider<TeamRepository>.value(value: _teamRepository),
        RepositoryProvider<OrgRepository>.value(value: _orgRepository),
        RepositoryProvider<TokenStore>.value(value: _tokenStore),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthBloc>.value(value: _authBloc),
          BlocProvider<ShellCubit>.value(value: _shellCubit),
        ],
        child: MaterialApp.router(
          title: 'Manage Teams',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.lightTheme,
          locale: const Locale('vi', 'VN'),
          supportedLocales: const [Locale('vi', 'VN'), Locale('en', 'US')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          routerConfig: _appRouter.router,
        ),
      ),
    );
  }
}
