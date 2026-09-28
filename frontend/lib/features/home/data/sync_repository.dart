import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';

class SyncRepository {
  SyncRepository(this._api);
  final ApiClient _api;

  Future<Map<String, dynamic>> pull() async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>('/sync/tasks/pull');
      return res.data ?? {};
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<Map<String, dynamic>> fullSync() async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>('/sync/tasks/full');
      return res.data ?? {};
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<SyncStatus> status() async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>('/sync/status');
      return SyncStatus.fromJson(res.data ?? {});
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
