import 'package:manage_teams_app/data/models/auth_models.dart';

abstract class AuthRepository {
  Future<void> bootstrap();
  Future<Me> login({required String email, required String password});
  Future<Me> register({
    required String email,
    required String password,
    required String fullName,
    required String orgName,
  });
  Future<Me?> currentUser();
  Future<void> logout();
  Future<void> completeOAuthCallback();
  String get googleLoginUrl;
  Future<bool> isGoogleLoginEnabled();
}
