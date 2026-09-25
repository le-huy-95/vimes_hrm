import 'package:equatable/equatable.dart';

sealed class AuthEvent extends Equatable {
  const AuthEvent();
  @override
  List<Object?> get props => [];
}

class AuthStarted extends AuthEvent {
  const AuthStarted();
}

class AuthLoginSubmitted extends AuthEvent {
  const AuthLoginSubmitted({required this.email, required this.password});
  final String email;
  final String password;
  @override
  List<Object?> get props => [email, password];
}

class AuthRegisterSubmitted extends AuthEvent {
  const AuthRegisterSubmitted({
    required this.email,
    required this.password,
    required this.fullName,
    required this.orgName,
  });
  final String email;
  final String password;
  final String fullName;
  final String orgName;
  @override
  List<Object?> get props => [email, password, fullName, orgName];
}

class AuthLogoutRequested extends AuthEvent {
  const AuthLogoutRequested();
}

class AuthOAuthCompleted extends AuthEvent {
  const AuthOAuthCompleted();
}

class AuthSessionExpired extends AuthEvent {
  const AuthSessionExpired();
}
