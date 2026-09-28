import 'package:equatable/equatable.dart';

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
    required this.idToken,
    this.serverAuthCode,
  });

  final String idToken;
  final String? serverAuthCode;

  @override
  List<Object?> get props => [idToken, serverAuthCode];
}

class AuthLogoutRequested extends AuthEvent {
  const AuthLogoutRequested();
}
