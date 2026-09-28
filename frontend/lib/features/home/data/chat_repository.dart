import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:uuid/uuid.dart';

class ChatRepository {
  ChatRepository(this._api);
  final ApiClient _api;
  final _uuid = const Uuid();

  Future<List<ConversationItem>> listConversations() async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>('/conversations');
      final list = res.data?['conversations'] as List<dynamic>? ?? [];
      return list
          .map((e) => ConversationItem.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<List<ChatMessage>> listMessages(
    String conversationId, {
    int afterSeq = 0,
  }) async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>(
        '/conversations/$conversationId/messages',
        queryParameters: {'after_seq': afterSeq},
      );
      final list = res.data?['messages'] as List<dynamic>? ?? [];
      return list
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<ChatMessage> sendMessage(
    String conversationId, {
    required String body,
    String? clientMsgId,
    List<String>? fileIds,
    String? replyToId,
  }) async {
    try {
      final id = clientMsgId ?? _uuid.v4();
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/conversations/$conversationId/messages',
        data: {
          'body': body,
          'clientMsgId': id,
          if (fileIds != null && fileIds.isNotEmpty) 'fileIds': fileIds,
          if (replyToId != null) 'replyToId': replyToId,
        },
      );
      final msg = res.data?['message'] as Map<String, dynamic>? ?? {};
      return ChatMessage.fromJson({
        ...msg,
        'conversationId': msg['conversationId'] ?? conversationId,
      });
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<int> markRead(String conversationId, int seq) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/conversations/$conversationId/read',
        data: {'seq': seq},
      );
      return (res.data?['lastReadSeq'] as num?)?.toInt() ?? seq;
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<({bool removed, String emoji})> toggleReaction(
    String conversationId,
    String messageId,
    String emoji,
  ) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/conversations/$conversationId/messages/$messageId/reactions',
        data: {'emoji': emoji},
      );
      return (
        removed: res.data?['removed'] as bool? ?? false,
        emoji: res.data?['emoji'] as String? ?? emoji,
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<List<ChatMessage>> searchMessages(
    String conversationId, {
    required String q,
    int limit = 30,
    String? groupId,
    String? taskId,
  }) async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>(
        '/conversations/$conversationId/search',
        queryParameters: {
          'q': q,
          'limit': limit,
          if (groupId != null) 'groupId': groupId,
          if (taskId != null) 'taskId': taskId,
        },
      );
      final list = res.data?['messages'] as List<dynamic>? ?? [];
      return list.map((e) {
        final m = Map<String, dynamic>.from(e as Map);
        return ChatMessage.fromJson({
          'id': m['id'],
          'seq': m['seq'] ?? 0,
          'senderUserId': m['senderUserId'] ?? '',
          'body': m['body'] ?? m['highlight'] ?? '',
          'fileIds': <dynamic>[],
          'mentions': <dynamic>[],
          'reactions': <dynamic>[],
          'createdAt': m['createdAt'] ?? DateTime.now().toUtc().toIso8601String(),
          'deleted': false,
          'conversationId': conversationId,
        });
      }).toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
