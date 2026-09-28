import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:manage_teams/core/constants/env_config.dart';

class TokenStore {
  static const _accessKey = 'mt_access_token';
  static const _refreshKey = 'mt_refresh_token';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<String?> getAccessToken() => _storage.read(key: _accessKey);
  Future<String?> getRefreshToken() => _storage.read(key: _refreshKey);

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _accessKey, value: accessToken);
    await _storage.write(key: _refreshKey, value: refreshToken);
  }

  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}

class ApiClient {
  ApiClient({TokenStore? tokenStore}) : tokenStore = tokenStore ?? TokenStore() {
    dio = Dio(
      BaseOptions(
        baseUrl: EnvConfig.baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        headers: {'content-type': 'application/json'},
      ),
    );
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await this.tokenStore.getAccessToken();
          if (token != null && token.isNotEmpty) {
            options.headers['authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  late final Dio dio;
  final TokenStore tokenStore;
}

class ApiException implements Exception {
  ApiException(this.message, {this.code, this.statusCode});
  final String message;
  final String? code;
  final int? statusCode;

  @override
  String toString() => message;
}

ApiException mapDioError(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map) {
      final message = data['message']?.toString() ?? error.message ?? 'Lỗi mạng';
      final code = data['error']?.toString();
      return ApiException(message, code: code, statusCode: error.response?.statusCode);
    }
    return ApiException(error.message ?? 'Lỗi mạng', statusCode: error.response?.statusCode);
  }
  return ApiException(error.toString());
}
