import 'package:equatable/equatable.dart';
import 'package:manage_teams/features/auth/data/auth_models.dart';

sealed class AuthState extends Equatable {
  const AuthState();

  @override
  List<Object?> get props => [];
}

class AuthUnknown extends AuthState {
  const AuthUnknown();
}

class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

class AuthAuthenticated extends AuthState {
  const AuthAuthenticated(this.user);

  final AuthUser user;

  bool get needsGoogleLink => !user.hasGoogleLinked;

  @override
  List<Object?> get props => [user.id, user.email, user.googleAccounts.length];
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

/// Lỗi đăng nhập / Google — router coi như chưa đăng nhập.
class AuthFailure extends AuthState {
  const AuthFailure({
    required this.message,
    this.code,
    this.email,
  });

  final String message;
  final String? code;
  final String? email;

  @override
  List<Object?> get props => [message, code, email];
}
