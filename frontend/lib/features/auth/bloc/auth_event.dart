import 'package:equatable/equatable.dart';
import 'package:manage_teams/features/auth/data/auth_models.dart';

sealed class AuthEvent extends Equatable {
  const AuthEvent();

  @override
  List<Object?> get props => [];
}

class AuthBootstrapRequested extends AuthEvent {
  const AuthBootstrapRequested();
}

class AuthLoginRequested extends AuthEvent {
  const AuthLoginRequested({
    required this.email,
    required this.password,
  });

  final String email;
  final String password;

  @override
  List<Object?> get props => [email, password];
}

class AuthGoogleLoginRequested extends AuthEvent {
  const AuthGoogleLoginRequested({
    this.idToken = '',
    this.serverAuthCode,
    this.redirectUri,
  });

  final String idToken;
  final String? serverAuthCode;
  final String? redirectUri;

  @override
  List<Object?> get props => [idToken, serverAuthCode, redirectUri];
}

class AuthLogoutRequested extends AuthEvent {
  const AuthLogoutRequested();
}

class AuthSessionRefreshRequested extends AuthEvent {
  const AuthSessionRefreshRequested();
}

class AuthGoogleLinked extends AuthEvent {
  const AuthGoogleLinked(this.user);
  final AuthUser user;
  @override
  List<Object?> get props => [user.id, user.googleAccounts.length];
}
