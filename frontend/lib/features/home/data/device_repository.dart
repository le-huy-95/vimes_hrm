import 'package:manage_teams/core/network/api_client.dart';

class DeviceRepository {
  DeviceRepository(this._api);
  final ApiClient _api;

  Future<void> registerPushToken({
    required String platform,
    required String token,
  }) async {
    try {
      await _api.dio.post(
        '/devices/push-token',
        data: {'platform': platform, 'token': token},
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> unregisterPushToken(String token) async {
    try {
      await _api.dio.delete(
        '/devices/push-token',
        data: {'token': token},
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<List<Map<String, dynamic>>> listPushTokens() async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>('/devices/push-token');
      final list = res.data?['tokens'] as List<dynamic>? ?? [];
      return list.cast<Map<String, dynamic>>();
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
