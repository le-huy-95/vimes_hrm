class AiUsage {
  const AiUsage({required this.promptTokens, required this.completionTokens});
  final int promptTokens;
  final int completionTokens;

  factory AiUsage.fromJson(Map<String, dynamic> j) => AiUsage(
        promptTokens: (j['promptTokens'] as num?)?.toInt() ?? 0,
        completionTokens: (j['completionTokens'] as num?)?.toInt() ?? 0,
      );
}

class AiLink {
  const AiLink({
    required this.type,
    required this.id,
    required this.href,
    required this.label,
  });
  final String type;
  final String id;
  final String href;
  final String label;

  factory AiLink.fromJson(Map<String, dynamic> j) => AiLink(
        type: j['type'] as String,
        id: j['id'] as String,
        href: j['href'] as String? ?? '',
        label: j['label'] as String? ?? '',
      );
}

class AiChatResult {
  const AiChatResult({
    required this.sessionId,
    required this.answer,
    required this.links,
    required this.toolsUsed,
    required this.mock,
    required this.provider,
    required this.usage,
  });

  final String sessionId;
  final String answer;
  final List<AiLink> links;
  final List<String> toolsUsed;
  final bool mock;
  final String provider;
  final AiUsage usage;

  factory AiChatResult.fromJson(Map<String, dynamic> j) => AiChatResult(
        sessionId: j['sessionId'] as String,
        answer: j['answer'] as String? ?? '',
        links: (j['links'] as List? ?? [])
            .whereType<Map>()
            .map((e) => AiLink.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        toolsUsed: (j['toolsUsed'] as List? ?? []).map((e) => '$e').toList(),
        mock: j['mock'] as bool? ?? true,
        provider: j['provider'] as String? ?? 'mock',
        usage: AiUsage.fromJson(
          Map<String, dynamic>.from(j['usage'] as Map? ?? const {}),
        ),
      );
}

class AiStreamEvent {
  const AiStreamEvent({required this.event, required this.data});
  final String event;
  final Map<String, dynamic> data;
}

enum AiMessageRole { user, assistant }

class AiChatMessage {
  const AiChatMessage({
    required this.role,
    required this.text,
    this.links = const [],
  });
  final AiMessageRole role;
  final String text;
  final List<AiLink> links;

  AiChatMessage copyWith({String? text, List<AiLink>? links}) => AiChatMessage(
        role: role,
        text: text ?? this.text,
        links: links ?? this.links,
      );
}
