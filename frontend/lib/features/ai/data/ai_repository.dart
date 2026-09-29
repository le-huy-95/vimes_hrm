import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:http/http.dart' as http;
import 'package:manage_teams/core/constants/env_config.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/ai/data/ai_models.dart';
import 'package:manage_teams/features/ai/data/ai_sse_parser.dart';

class AiRepository {
  AiRepository(this._api, {http.Client? httpClient})
      : _http = httpClient ?? http.Client();

  final ApiClient _api;
  final http.Client _http;

  Future<AiChatResult> chat({
    required String message,
    String? sessionId,
  }) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/ai/chat',
        data: {
          'message': message,
          if (sessionId != null) 'sessionId': sessionId,
        },
        options: Options(
          receiveTimeout: const Duration(seconds: 60),
          sendTimeout: const Duration(seconds: 15),
        ),
      );
      return AiChatResult.fromJson(res.data!);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Stream<AiStreamEvent> chatStream({
    required String message,
    String? sessionId,
  }) async* {
    final token = await _api.tokenStore.getAccessToken();
    final base = EnvConfig.baseUrl.replaceAll(RegExp(r'/$'), '');
    final req = http.Request('POST', Uri.parse('$base/ai/chat/stream'));
    req.headers.addAll({
      'content-type': 'application/json',
      'accept': 'text/event-stream',
      if (token != null && token.isNotEmpty) 'authorization': 'Bearer $token',
    });
    req.body = jsonEncode({
      'message': message,
      if (sessionId != null) 'sessionId': sessionId,
    });

    final res = await _http.send(req).timeout(const Duration(seconds: 60));
    if (res.statusCode >= 400) {
      final body = await res.stream.bytesToString();
      throw _parseHttpError(body, res.statusCode);
    }

    final parser = SseParserBuffer();
    await for (final chunk in res.stream.transform(utf8.decoder)) {
      for (final ev in parser.addChunk(chunk)) {
        yield ev;
      }
    }
  }

  ApiException _parseHttpError(String body, int status) {
    try {
      final data = jsonDecode(body);
      if (data is Map) {
        final message = data['message']?.toString();
        final code = data['error']?.toString();
        if (message != null && message.isNotEmpty) {
          return ApiException(message, code: code, statusCode: status);
        }
      }
    } catch (_) {}
    return ApiException('Lỗi AI ($status)', statusCode: status);
  }
}
