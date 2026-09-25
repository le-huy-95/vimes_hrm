import 'package:manage_teams_app/core/constants/env_config.dart';
import 'package:manage_teams_app/core/storage/token_store.dart';
import 'package:manage_teams_app/data/datasources/api_endpoints.dart';
import 'package:manage_teams_app/data/datasources/api_services/auth_api_service.dart';
import 'package:manage_teams_app/data/models/auth_models.dart';
import 'package:manage_teams_app/domain/repositories/auth_repository.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({
    required TokenStore tokenStore,
    AuthApiService? api,
  })  : _tokenStore = tokenStore,
        _api = api ?? AuthApiService();

  final TokenStore _tokenStore;
  final AuthApiService _api;
  Me? _cached;

  @override
  String get googleLoginUrl =>
      '${EnvConfig.apiBaseUrl}${ApiEndpoints.authGoogle}';

  @override
  Future<void> bootstrap() async {
    try {
      final session = await _api.refresh();
      await _tokenStore.saveAccessToken(session.accessToken);
      _cached = await _api.me();
    } catch (_) {
      await _tokenStore.clear();
      _cached = null;
    }
  }

  @override
  Future<Me> login({required String email, required String password}) async {
    final session = await _api.login({'email': email, 'password': password});
    await _tokenStore.saveAccessToken(session.accessToken);
    _cached = await _api.me();
    return _cached!;
  }

  @override
  Future<Me> register({
    required String email,
    required String password,
    required String fullName,
    required String orgName,
  }) async {
    final session = await _api.register({
      'email': email,
      'password': password,
      'fullName': fullName,
      'orgName': orgName,
    });
    await _tokenStore.saveAccessToken(session.accessToken);
    _cached = await _api.me();
    return _cached!;
  }

  @override
  Future<Me?> currentUser() async => _cached;

  @override
  Future<void> logout() async {
    try {
      await _api.logout();
    } finally {
      await _tokenStore.clear();
      _cached = null;
    }
  }

  @override
  Future<void> completeOAuthCallback() async {
    final session = await _api.refresh();
    await _tokenStore.saveAccessToken(session.accessToken);
    _cached = await _api.me();
  }

  @override
  Future<bool> isGoogleLoginEnabled() async {
    try {
      final p = await _api.providers();
      return p['google'] == true;
    } catch (_) {
      return false;
    }
  }
}
