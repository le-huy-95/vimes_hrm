import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:manage_teams/core/network/api_client.dart';

class FileRepository {
  FileRepository(this._api);
  final ApiClient _api;

  Future<({String fileId, bool deduped, String status, String? putUrl})>
      initUpload({
    required String conversationId,
    required String originalName,
    required int sizeBytes,
    String? contentType,
    String? sha256,
  }) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/files/init',
        data: {
          'conversationId': conversationId,
          'originalName': originalName,
          'sizeBytes': sizeBytes,
          if (contentType != null) 'contentType': contentType,
          if (sha256 != null) 'sha256': sha256,
        },
      );
      final data = res.data ?? {};
      return (
        fileId: data['fileId'] as String,
        deduped: data['deduped'] as bool? ?? false,
        status: data['status'] as String? ?? 'UPLOADING',
        putUrl: data['putUrl'] as String?,
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> putBytes(
    String putUrl,
    Uint8List bytes, {
    String? contentType,
  }) async {
    try {
      final dio = Dio();
      await dio.put<void>(
        putUrl,
        data: bytes,
        options: Options(
          headers: {
            Headers.contentLengthHeader: bytes.length,
            if (contentType != null) Headers.contentTypeHeader: contentType,
          },
        ),
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<Map<String, dynamic>> complete(String fileId, {String? sha256}) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/files/$fileId/complete',
        data: {if (sha256 != null) 'sha256': sha256},
      );
      return res.data ?? {};
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<String> downloadUrl(String fileId) async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>(
        '/files/$fileId/download',
      );
      return res.data?['url'] as String? ?? '';
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<List<Map<String, dynamic>>> listConversationFiles(
    String conversationId,
  ) async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>(
        '/conversations/$conversationId/files',
      );
      final list = res.data?['files'] as List<dynamic>? ?? [];
      return list.cast<Map<String, dynamic>>();
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
