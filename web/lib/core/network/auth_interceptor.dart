import 'dart:async';

import 'package:dio/dio.dart';
import 'package:manage_teams_app/core/storage/token_store.dart';
import 'package:manage_teams_app/data/datasources/api_endpoints.dart';

typedef SessionExpiredCallback = void Function();

class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required TokenStore tokenStore,
    required Dio dio,
    this.onSessionExpired,
  })  : _tokenStore = tokenStore,
        _dio = dio;

  final TokenStore _tokenStore;
  final Dio _dio;
  SessionExpiredCallback? onSessionExpired;

  Completer<void>? _refreshLock;

  bool _isPublic(String path) {
    final p = path.split('?').first;
    return p == ApiEndpoints.authLogin ||
        p == ApiEndpoints.authRegister ||
        p == ApiEndpoints.authRefresh ||
        p == ApiEndpoints.authProviders ||
        p == ApiEndpoints.authGoogle;
  }

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!_isPublic(options.path)) {
      final token = await _tokenStore.getAccessToken();
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final status = err.response?.statusCode;
    final path = err.requestOptions.path;
    if (status != 401 || _isPublic(path)) {
      handler.next(err);
      return;
    }

    try {
      await _refreshSingleFlight();
      final token = await _tokenStore.getAccessToken();
      final req = err.requestOptions;
      req.headers['Authorization'] = 'Bearer $token';
      final clone = await _dio.fetch(req);
      handler.resolve(clone);
    } catch (_) {
      await _tokenStore.clear();
      onSessionExpired?.call();
      handler.next(err);
    }
  }

  Future<void> _refreshSingleFlight() async {
    final existing = _refreshLock;
    if (existing != null) return existing.future;

    final lock = Completer<void>();
    _refreshLock = lock;
    try {
      final res = await _dio.post(ApiEndpoints.authRefresh);
      final access = (res.data as Map)['accessToken'] as String?;
      if (access == null || access.isEmpty) {
        throw StateError('missing accessToken');
      }
      await _tokenStore.saveAccessToken(access);
      lock.complete();
    } catch (e, st) {
      lock.completeError(e, st);
      rethrow;
    } finally {
      _refreshLock = null;
    }
  }
}
