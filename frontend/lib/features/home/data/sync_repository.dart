import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';

class SyncRepository {
  SyncRepository(this._api);
  final ApiClient _api;

  Future<Map<String, dynamic>> pull({
    String? preferredGroupId,
    bool force = false,
  }) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/sync/tasks/pull',
        data: <String, dynamic>{
          if (preferredGroupId != null) 'preferredGroupId': preferredGroupId,
          if (force) 'force': true,
        },
      );
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

  Future<SheetStatusResponse> getSheetStatus(String groupId) async {
    try {
      final res =
          await _api.dio.get<Map<String, dynamic>>('/sync/sheets/$groupId');
      return SheetStatusResponse.fromJson(res.data ?? {});
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<GroupSheetDto> ensureSheet(String groupId) async {
    try {
      final res = await _api.dio
          .post<Map<String, dynamic>>('/sync/sheets/$groupId/ensure');
      return GroupSheetDto.fromJson(res.data ?? {});
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<SheetsEnqueueResponse> pushSheet(String groupId) async {
    try {
      final res = await _api.dio
          .post<Map<String, dynamic>>('/sync/sheets/$groupId/push');
      return SheetsEnqueueResponse.fromJson(res.data ?? {});
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<SheetsEnqueueResponse> pullSheet(String groupId) async {
    try {
      final res = await _api.dio
          .post<Map<String, dynamic>>('/sync/sheets/$groupId/pull');
      return SheetsEnqueueResponse.fromJson(res.data ?? {});
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
