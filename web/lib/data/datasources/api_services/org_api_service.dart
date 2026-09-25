import 'package:dio/dio.dart';
import 'package:manage_teams_app/core/error/app_failure.dart';
import 'package:manage_teams_app/core/network/dio_client.dart';
import 'package:manage_teams_app/data/datasources/api_endpoints.dart';

class OrgApiService {
  OrgApiService({Dio? dio}) : _dio = dio ?? DioClient.instance;

  final Dio _dio;

  Future<void> createUser({
    required String email,
    required String fullName,
  }) async {
    try {
      await _dio.post(
        ApiEndpoints.orgUsers,
        data: {'email': email, 'fullName': fullName},
      );
    } on DioException catch (e) {
      throw AppFailure.fromBody(e.response?.data, e.response?.statusCode);
    }
  }
}
