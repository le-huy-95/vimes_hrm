import 'package:manage_teams/core/network/api_client.dart';

class ChatReadiness {
  const ChatReadiness({required this.status, this.reason});

  final String status; // ready | needs_reconsent | chat_disabled | error
  final String? reason;

  factory ChatReadiness.fromJson(Map<String, dynamic> j) => ChatReadiness(
        status: j['status'] as String? ?? 'error',
        reason: j['reason'] as String?,
      );

  bool get isReady => status == 'ready';
}

class GoogleChatSpaceItem {
  const GoogleChatSpaceItem({
    required this.name,
    required this.displayName,
    required this.spaceType,
  });

  final String name;
  final String displayName;
  final String spaceType;

  factory GoogleChatSpaceItem.fromJson(Map<String, dynamic> j) =>
      GoogleChatSpaceItem(
        name: j['name'] as String? ?? '',
        displayName: j['displayName'] as String? ?? j['name'] as String? ?? '',
        spaceType: j['spaceType'] as String? ?? 'SPACE',
      );
}

class GoogleChatLink {
  const GoogleChatLink({
    required this.id,
    required this.spaceName,
    required this.groupId,
    this.displayName,
    this.spaceType,
  });

  final String id;
  final String spaceName;
  final String groupId;
  final String? displayName;
  final String? spaceType;

  factory GoogleChatLink.fromJson(Map<String, dynamic> j) => GoogleChatLink(
        id: j['id'] as String,
        spaceName: j['spaceName'] as String? ?? '',
        groupId: j['groupId'] as String? ?? '',
        displayName: j['displayName'] as String?,
        spaceType: j['spaceType'] as String?,
      );

  String get title =>
      (displayName != null && displayName!.isNotEmpty) ? displayName! : spaceName;
}

class GoogleChatMessage {
  const GoogleChatMessage({
    required this.name,
    required this.text,
    required this.sender,
    this.createTime,
  });

  final String name;
  final String text;
  final String sender;
  final DateTime? createTime;

  factory GoogleChatMessage.fromJson(Map<String, dynamic> j) {
    final raw = j['createTime'] as String?;
    return GoogleChatMessage(
      name: j['name'] as String? ?? '',
      text: j['text'] as String? ?? '',
      sender: j['sender'] as String? ?? '',
      createTime: raw != null ? DateTime.tryParse(raw)?.toUtc() : null,
    );
  }
}

class GoogleChatRepository {
  GoogleChatRepository(this._api);
  final ApiClient _api;

  Future<ChatReadiness> readiness() async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>('/sync/chat/readiness');
      return ChatReadiness.fromJson(res.data ?? {});
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<({ChatReadiness readiness, List<GoogleChatSpaceItem> spaces})>
      listSpaces() async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>('/sync/chat/spaces');
      final data = res.data ?? {};
      final readiness = ChatReadiness.fromJson(
        data['readiness'] is Map<String, dynamic>
            ? data['readiness'] as Map<String, dynamic>
            : data,
      );
      final list = data['spaces'] as List<dynamic>? ?? [];
      return (
        readiness: readiness,
        spaces: list
            .map((e) => GoogleChatSpaceItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<List<GoogleChatLink>> listLinks(String groupId) async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>(
        '/sync/chat/links',
        queryParameters: {'groupId': groupId},
      );
      final list = res.data?['links'] as List<dynamic>? ?? [];
      return list
          .map((e) => GoogleChatLink.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<GoogleChatLink> createLink({
    required String groupId,
    required String spaceName,
    String? displayName,
    String? spaceType,
  }) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/sync/chat/links',
        data: {
          'groupId': groupId,
          'spaceName': spaceName,
          if (displayName != null) 'displayName': displayName,
          if (spaceType != null) 'spaceType': spaceType,
        },
      );
      final link = res.data?['link'] as Map<String, dynamic>? ?? {};
      return GoogleChatLink.fromJson(link);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> deleteLink(String id) async {
    try {
      await _api.dio.delete('/sync/chat/links/$id');
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<({List<GoogleChatMessage> messages, String? nextPageToken})>
      listMessages({
    required String groupId,
    required String spaceName,
    String? pageToken,
  }) async {
    try {
      final encoded = Uri.encodeComponent(spaceName);
      final res = await _api.dio.get<Map<String, dynamic>>(
        '/sync/chat/spaces/$encoded/messages',
        queryParameters: {
          'groupId': groupId,
          if (pageToken != null) 'pageToken': pageToken,
        },
      );
      final data = res.data ?? {};
      final list = data['messages'] as List<dynamic>? ?? [];
      return (
        messages: list
            .map((e) => GoogleChatMessage.fromJson(e as Map<String, dynamic>))
            .toList(),
        nextPageToken: data['nextPageToken'] as String?,
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> sendMessage({
    required String groupId,
    required String spaceName,
    required String text,
  }) async {
    try {
      final encoded = Uri.encodeComponent(spaceName);
      await _api.dio.post(
        '/sync/chat/spaces/$encoded/messages',
        data: {'groupId': groupId, 'text': text},
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
