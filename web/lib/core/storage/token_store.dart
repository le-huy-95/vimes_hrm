import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class TokenStore {
  Future<String?> getAccessToken();
  Future<void> saveAccessToken(String? token);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _kAccess = 'access_token';
  final FlutterSecureStorage _storage;

  @override
  Future<String?> getAccessToken() => _storage.read(key: _kAccess);

  @override
  Future<void> saveAccessToken(String? token) async {
    if (token == null || token.isEmpty) {
      await _storage.delete(key: _kAccess);
    } else {
      await _storage.write(key: _kAccess, value: token);
    }
  }

  @override
  Future<void> clear() => _storage.delete(key: _kAccess);
}
