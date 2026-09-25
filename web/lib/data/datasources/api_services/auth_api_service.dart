import 'package:dio/dio.dart';
import 'package:manage_teams_app/core/error/app_failure.dart';
import 'package:manage_teams_app/core/network/dio_client.dart';
import 'package:manage_teams_app/data/datasources/api_endpoints.dart';
import 'package:manage_teams_app/data/models/auth_models.dart';

class AuthApiService {
  AuthApiService({Dio? dio}) : _dio = dio ?? DioClient.instance;

  final Dio _dio;

  Future<T> _guard<T>(Future<Response<dynamic>> Function() run) async {
    try {
      final res = await run();
      return res.data as T;
    } on DioException catch (e) {
      throw AppFailure.fromBody(e.response?.data, e.response?.statusCode);
    }
  }

  Future<Session> login(Map<String, dynamic> body) async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.post(ApiEndpoints.authLogin, data: body),
    );
    return Session.fromJson(data);
  }

  Future<Session> register(Map<String, dynamic> body) async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.post(ApiEndpoints.authRegister, data: body),
    );
    return Session.fromJson(data);
  }

  Future<Session> refresh() async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.post(ApiEndpoints.authRefresh),
    );
    return Session.fromJson(data);
  }

  Future<Me> me() async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.get(ApiEndpoints.authMe),
    );
    return Me.fromJson(data);
  }

  Future<void> logout() async {
    await _guard<dynamic>(() => _dio.post(ApiEndpoints.authLogout));
  }

  Future<Map<String, dynamic>> providers() async {
    return _guard<Map<String, dynamic>>(
      () => _dio.get(ApiEndpoints.authProviders),
    );
  }
}
