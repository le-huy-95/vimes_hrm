import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:manage_teams/core/constants/env_config.dart';

class TokenStore {
  static const _accessKey = 'mt_access_token';
  static const _refreshKey = 'mt_refresh_token';

  /// Legacy macOS keychain — avoids `keychain-access-groups` (needs Apple cert).
  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    mOptions: MacOsOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
      useDataProtectionKeyChain: false,
    ),
  );

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

typedef SessionExpiredCallback = void Function();

class ApiClient {
  ApiClient({
    TokenStore? tokenStore,
    this.onSessionExpired,
  }) : tokenStore = tokenStore ?? TokenStore() {
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
          if (!_isPublicAuthPath(options.path)) {
            final token = await this.tokenStore.getAccessToken();
            if (token != null && token.isNotEmpty) {
              options.headers['authorization'] = 'Bearer $token';
            }
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          if (!_shouldAttemptRefresh(error)) {
            handler.next(error);
            return;
          }
          try {
            await refreshSession();
            final opts = error.requestOptions;
            final token = await this.tokenStore.getAccessToken();
            if (token != null && token.isNotEmpty) {
              opts.headers['authorization'] = 'Bearer $token';
            }
            opts.extra['_retriedAfterRefresh'] = true;
            final response = await dio.fetch<dynamic>(opts);
            handler.resolve(response);
          } catch (_) {
            await this.tokenStore.clear();
            onSessionExpired?.call();
            handler.next(error);
          }
        },
      ),
    );
  }

  late final Dio dio;
  final TokenStore tokenStore;
  SessionExpiredCallback? onSessionExpired;

  Completer<void>? _refreshCompleter;

  static bool _isPublicAuthPath(String path) {
    const public = {
      '/auth/register',
      '/auth/login',
      '/auth/verify-email',
      '/auth/resend-otp',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/refresh',
      '/auth/google/authorize-url',
      '/auth/google/callback',
      '/auth/google/id-token',
    };
    final normalized = path.startsWith('http')
        ? Uri.parse(path).path
        : path.split('?').first;
    return public.contains(normalized);
  }

  static bool _shouldAttemptRefresh(DioException error) {
    if (error.response?.statusCode != 401) return false;
    if (error.requestOptions.extra['skipAuthRefresh'] == true) return false;
    if (error.requestOptions.extra['_retriedAfterRefresh'] == true) return false;
    return !_isPublicAuthPath(error.requestOptions.path);
  }

  /// Gọi `POST /auth/refresh` (không qua interceptor) để lấy cặp token mới.
  Future<void> refreshSession() async {
    final inFlight = _refreshCompleter;
    if (inFlight != null) {
      await inFlight.future;
      return;
    }

    final completer = Completer<void>();
    _refreshCompleter = completer;
    try {
      final refresh = await tokenStore.getRefreshToken();
      if (refresh == null || refresh.isEmpty) {
        throw ApiException('Thiếu refresh token', statusCode: 401);
      }

      final bare = Dio(
        BaseOptions(
          baseUrl: EnvConfig.baseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 30),
          headers: {'content-type': 'application/json'},
        ),
      );
      final res = await bare.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': refresh},
        options: Options(extra: {'skipAuthRefresh': true}),
      );
      final data = res.data ?? {};
      final accessToken = data['accessToken'] as String?;
      final refreshToken = data['refreshToken'] as String?;
      if (accessToken == null ||
          accessToken.isEmpty ||
          refreshToken == null ||
          refreshToken.isEmpty) {
        throw ApiException('Refresh token response không hợp lệ', statusCode: 401);
      }
      await tokenStore.saveTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
      );
      completer.complete();
    } catch (e) {
      completer.completeError(e);
      rethrow;
    } finally {
      _refreshCompleter = null;
    }
  }
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
    final status = error.response?.statusCode;
    final data = error.response?.data;
    if (data is Map) {
      final message = data['message']?.toString();
      final code = data['error']?.toString();
      if (message != null && message.isNotEmpty) {
        return ApiException(message, code: code, statusCode: status);
      }
    }
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.unknown) {
      return ApiException(
        'Không kết nối được máy chủ. Kiểm tra API đang chạy và CORS (Flutter web).',
        statusCode: status,
      );
    }
    if (status != null && status >= 500) {
      return ApiException(
        'Máy chủ đang lỗi. Vui lòng thử lại sau.',
        code: 'SERVER_ERROR',
        statusCode: status,
      );
    }
    if (status == 401) {
      return ApiException('Email hoặc mật khẩu không đúng.', statusCode: status);
    }
    return ApiException('Lỗi mạng ($status)', statusCode: status);
  }
  return ApiException(error.toString());
}
