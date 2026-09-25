import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:manage_teams_app/core/constants/env_config.dart';

class DioClient {
  DioClient._();

  static Dio? _dio;

  static Dio get instance {
    final existing = _dio;
    if (existing != null) return existing;
    final dio = Dio(
      BaseOptions(
        baseUrl: EnvConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 30),
        headers: {'Content-Type': 'application/json'},
      ),
    );
    if (kIsWeb) {
      // Browser: include cookies for refresh (parity credentials: include)
      dio.options.extra['withCredentials'] = true;
    }
    _dio = dio;
    return dio;
  }

  static void resetForTest() => _dio = null;
}
