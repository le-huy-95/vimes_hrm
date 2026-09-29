import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/auth/bloc/auth_event.dart';
import 'package:manage_teams/features/auth/bloc/auth_state.dart';
import 'package:manage_teams/features/auth/data/auth_repository.dart';

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc(this._repo) : super(const AuthUnknown()) {
    on<AuthBootstrapRequested>(_onBootstrap);
    on<AuthLoginRequested>(_onLogin);
    on<AuthGoogleLoginRequested>(_onGoogleLogin);
    on<AuthLogoutRequested>(_onLogout);
    on<AuthSessionRefreshRequested>(_onSessionRefresh);
    on<AuthGoogleLinked>(_onGoogleLinked);
  }

  final AuthRepository _repo;

  Future<void> _onBootstrap(
    AuthBootstrapRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(const AuthLoading());
    final user = await _repo.restoreSession();
    emit(user == null ? const AuthUnauthenticated() : AuthAuthenticated(user));
  }

  Future<void> _onLogin(
    AuthLoginRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(const AuthLoading());
    try {
      final user = await _repo.login(
        email: event.email,
        password: event.password,
      );
      emit(AuthAuthenticated(user));
    } catch (e) {
      emit(_mapError(e, email: event.email));
    }
  }

  Future<void> _onGoogleLogin(
    AuthGoogleLoginRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(const AuthLoading());
    try {
      final user = await _repo.loginWithGoogleIdToken(
        event.idToken,
        serverAuthCode: event.serverAuthCode,
        redirectUri: event.redirectUri,
      );
      emit(AuthAuthenticated(user));
    } catch (e) {
      emit(_mapError(e));
    }
  }

  Future<void> _onLogout(
    AuthLogoutRequested event,
    Emitter<AuthState> emit,
  ) async {
    await _repo.logout();
    emit(const AuthUnauthenticated());
  }

  Future<void> _onSessionRefresh(
    AuthSessionRefreshRequested event,
    Emitter<AuthState> emit,
  ) async {
    try {
      final user = await _repo.fetchMe();
      emit(AuthAuthenticated(user));
    } catch (e) {
      // Keep current session on soft refresh failure.
    }
  }

  void _onGoogleLinked(
    AuthGoogleLinked event,
    Emitter<AuthState> emit,
  ) {
    emit(AuthAuthenticated(event.user));
  }

  AuthFailure _mapError(Object error, {String? email}) {
    if (error is ApiException) {
      return AuthFailure(
        message: error.message,
        code: error.code,
        email: email,
      );
    }
    return AuthFailure(message: error.toString(), email: email);
  }
}
