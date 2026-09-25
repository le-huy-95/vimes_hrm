import 'package:dio/dio.dart';
import 'package:manage_teams_app/core/error/app_failure.dart';
import 'package:manage_teams_app/core/network/dio_client.dart';
import 'package:manage_teams_app/data/datasources/api_endpoints.dart';
import 'package:manage_teams_app/data/models/team_models.dart';

class TeamApiService {
  TeamApiService({Dio? dio}) : _dio = dio ?? DioClient.instance;

  final Dio _dio;

  Future<T> _guard<T>(Future<Response<dynamic>> Function() run) async {
    try {
      final res = await run();
      return res.data as T;
    } on DioException catch (e) {
      throw AppFailure.fromBody(e.response?.data, e.response?.statusCode);
    }
  }

  Future<List<Team>> fetchTree() async {
    final data = await _guard<List<dynamic>>(
      () => _dio.get(ApiEndpoints.teams, queryParameters: {'as': 'tree'}),
    );
    return data
        .whereType<Map>()
        .map((e) => Team.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<Team> create(Map<String, dynamic> body) async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.post(ApiEndpoints.teams, data: body),
    );
    return Team.fromJson(data);
  }

  Future<Team> getById(String id) async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.get(ApiEndpoints.team(id)),
    );
    return Team.fromJson(data);
  }

  Future<Team> update(String id, Map<String, dynamic> body) async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.patch(ApiEndpoints.team(id), data: body),
    );
    return Team.fromJson(data);
  }

  Future<void> delete(String id) async {
    await _guard<dynamic>(() => _dio.delete(ApiEndpoints.team(id)));
  }

  Future<List<TeamMember>> listMembers(String teamId) async {
    final data = await _guard<List<dynamic>>(
      () => _dio.get(ApiEndpoints.teamMembers(teamId)),
    );
    return data
        .whereType<Map>()
        .map((e) => TeamMember.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<void> invite(String teamId, Map<String, dynamic> body) async {
    await _guard<dynamic>(
      () => _dio.post(ApiEndpoints.teamMembers(teamId), data: body),
    );
  }

  Future<void> updateMember(
    String teamId,
    String userId,
    Map<String, dynamic> body,
  ) async {
    await _guard<dynamic>(
      () => _dio.patch(ApiEndpoints.teamMember(teamId, userId), data: body),
    );
  }

  Future<void> removeMember(String teamId, String userId) async {
    await _guard<dynamic>(
      () => _dio.delete(ApiEndpoints.teamMember(teamId, userId)),
    );
  }
}
