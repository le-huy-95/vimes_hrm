import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams_app/domain/repositories/auth_repository.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_event.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_state.dart';

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc({required AuthRepository authRepository})
      : _repo = authRepository,
        super(const AuthInitial()) {
    on<AuthStarted>(_onStarted);
    on<AuthLoginSubmitted>(_onLogin);
    on<AuthRegisterSubmitted>(_onRegister);
    on<AuthLogoutRequested>(_onLogout);
    on<AuthOAuthCompleted>(_onOAuth);
    on<AuthSessionExpired>(_onExpired);
  }

  final AuthRepository _repo;

  Future<void> _onStarted(AuthStarted e, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    await _repo.bootstrap();
    final user = await _repo.currentUser();
    emit(user == null
        ? const AuthUnauthenticated()
        : AuthAuthenticated(user));
  }

  Future<void> _onLogin(AuthLoginSubmitted e, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    try {
      final user = await _repo.login(email: e.email, password: e.password);
      emit(AuthAuthenticated(user));
    } catch (err) {
      emit(AuthUnauthenticated(message: err.toString()));
    }
  }

  Future<void> _onRegister(
    AuthRegisterSubmitted e,
    Emitter<AuthState> emit,
  ) async {
    emit(const AuthLoading());
    try {
      final user = await _repo.register(
        email: e.email,
        password: e.password,
        fullName: e.fullName,
        orgName: e.orgName,
      );
      emit(AuthAuthenticated(user));
    } catch (err) {
      emit(AuthUnauthenticated(message: err.toString()));
    }
  }

  Future<void> _onLogout(AuthLogoutRequested e, Emitter<AuthState> emit) async {
    await _repo.logout();
    emit(const AuthUnauthenticated());
  }

  Future<void> _onOAuth(AuthOAuthCompleted e, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    try {
      await _repo.completeOAuthCallback();
      final user = await _repo.currentUser();
      emit(user == null
          ? const AuthUnauthenticated(message: 'OAuth thất bại')
          : AuthAuthenticated(user));
    } catch (err) {
      emit(AuthUnauthenticated(message: err.toString()));
    }
  }

  Future<void> _onExpired(AuthSessionExpired e, Emitter<AuthState> emit) async {
    await _repo.logout();
    emit(const AuthUnauthenticated(message: 'Phiên đăng nhập hết hạn'));
  }
}
