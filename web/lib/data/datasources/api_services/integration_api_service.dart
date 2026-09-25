import 'package:dio/dio.dart';
import 'package:manage_teams_app/core/error/app_failure.dart';
import 'package:manage_teams_app/core/network/dio_client.dart';
import 'package:manage_teams_app/data/datasources/api_endpoints.dart';
import 'package:manage_teams_app/data/models/integration_models.dart';

class IntegrationApiService {
  IntegrationApiService({Dio? dio}) : _dio = dio ?? DioClient.instance;

  final Dio _dio;

  Future<T> _guard<T>(Future<Response<dynamic>> Function() run) async {
    try {
      final res = await run();
      return res.data as T;
    } on DioException catch (e) {
      throw AppFailure.fromBody(e.response?.data, e.response?.statusCode);
    }
  }

  Future<IntegrationStatus> getStatus(String teamId) async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.get(ApiEndpoints.teamIntegrations(teamId)),
    );
    return IntegrationStatus.fromJson(data);
  }

  Future<String> _urlFrom(Future<Response<dynamic>> Function() run) async {
    final data = await _guard<Map<String, dynamic>>(run);
    final url = data['url'] as String?;
    if (url == null || url.isEmpty) {
      throw AppFailure('Không nhận được URL kết nối');
    }
    return url;
  }

  Future<String> googleTasksConnectUrl(String teamId) => _urlFrom(
        () => _dio.get(ApiEndpoints.teamGoogleTasksConnect(teamId)),
      );

  Future<String> githubInstallUrl(String teamId) => _urlFrom(
        () => _dio.get(ApiEndpoints.teamGithubInstallUrl(teamId)),
      );

  Future<String> workspaceConnectUrl() => _urlFrom(
        () => _dio.get(ApiEndpoints.orgWorkspaceConnect),
      );
}
