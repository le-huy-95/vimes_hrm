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

  Future<List<GoogleTasklistItem>> listGoogleTasklists() async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>('/sync/tasklists');
      final list = res.data?['tasklists'] as List<dynamic>? ?? const [];
      return list
          .map((e) => GoogleTasklistItem.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<({List<TasklistMapRow> groups, List<String> unmappedGroupIds})>
      listTasklistMaps() async {
    try {
      final res =
          await _api.dio.get<Map<String, dynamic>>('/sync/tasklist-maps');
      final data = res.data ?? {};
      final groups = (data['groups'] as List<dynamic>? ?? const [])
          .map((e) => TasklistMapRow.fromJson(e as Map<String, dynamic>))
          .toList();
      final unmapped = (data['unmappedGroupIds'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList();
      return (groups: groups, unmappedGroupIds: unmapped);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> putTasklistMap(
    String groupId, {
    required String googleTasklistId,
    String? googleTasklistTitle,
  }) async {
    try {
      await _api.dio.put(
        '/sync/tasklist-maps/$groupId',
        data: {
          'googleTasklistId': googleTasklistId,
          if (googleTasklistTitle != null)
            'googleTasklistTitle': googleTasklistTitle,
        },
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> deleteTasklistMap(String groupId) async {
    try {
      await _api.dio.delete('/sync/tasklist-maps/$groupId');
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
