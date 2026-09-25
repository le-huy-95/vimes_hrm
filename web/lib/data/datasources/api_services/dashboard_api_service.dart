import 'package:dio/dio.dart';
import 'package:manage_teams_app/core/error/app_failure.dart';
import 'package:manage_teams_app/core/network/dio_client.dart';
import 'package:manage_teams_app/data/datasources/api_endpoints.dart';
import 'package:manage_teams_app/data/models/dashboard_models.dart';
import 'package:manage_teams_app/data/models/integration_models.dart';

class DashboardApiService {
  DashboardApiService({Dio? dio}) : _dio = dio ?? DioClient.instance;

  final Dio _dio;

  Future<T> _guard<T>(Future<Response<dynamic>> Function() run) async {
    try {
      final res = await run();
      return res.data as T;
    } on DioException catch (e) {
      throw AppFailure.fromBody(e.response?.data, e.response?.statusCode);
    }
  }

  Future<TeamDashboard> loadDashboard(String teamId) async {
    final results = await Future.wait([
      _guard<Map<String, dynamic>>(
        () => _dio.get(ApiEndpoints.teamDashboard(teamId)),
      ),
      _guard<Map<String, dynamic>>(
        () => _dio.get(ApiEndpoints.teamIntegrations(teamId)),
      ),
    ]);
    final dash = results[0];
    final integ = IntegrationStatus.fromJson(results[1]);
    final gt = dash['googleTasks'];
    final gh = dash['github'];
    final ghMap = gh is Map ? Map<String, dynamic>.from(gh) : null;
    return TeamDashboard(
      chart: TasksChartCounts.fromJson(
        gt is Map ? Map<String, dynamic>.from(gt) : null,
      ),
      githubConnected: ghMap?['connected'] == true,
      githubRepoCount: (ghMap?['repoCount'] as num?)?.toInt() ??
          integ.summary.repoCount,
      googleLinked: integ.summary.googleLinked,
      githubLinked: integ.summary.githubLinked,
    );
  }

  Future<GoogleTasksStatus> googleTasksStatus(String teamId) async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.get(ApiEndpoints.teamGoogleTasks(teamId)),
    );
    return GoogleTasksStatus.fromJson(data);
  }

  Future<List<TaskListOption>> googleTasksLists(String teamId) async {
    final data = await _guard<List<dynamic>>(
      () => _dio.get(ApiEndpoints.teamGoogleTasksLists(teamId)),
    );
    return data
        .whereType<Map>()
        .map((e) => TaskListOption.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<void> bindLists(String teamId, Map<String, dynamic> body) async {
    await _guard<dynamic>(
      () => _dio.patch(ApiEndpoints.teamGoogleTasks(teamId), data: body),
    );
  }

  Future<void> sync(String teamId) async {
    await _guard<dynamic>(
      () => _dio.post(ApiEndpoints.teamGoogleTasksSync(teamId)),
    );
  }

  Future<List<MemberIntegration>> memberIntegrations(
    String teamId,
    String service,
  ) async {
    final data = await _guard<List<dynamic>>(
      () => _dio.get(ApiEndpoints.teamMemberIntegrations(teamId, service)),
    );
    return data
        .whereType<Map>()
        .map((e) => MemberIntegration.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<GithubCommitPage> githubCommits(
    String teamId,
    String userId, {
    String? cursor,
  }) async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.get(
        ApiEndpoints.teamMemberGithubCommits(teamId, userId),
        queryParameters: cursor != null ? {'cursor': cursor} : null,
      ),
    );
    return GithubCommitPage.fromJson(data);
  }
}
