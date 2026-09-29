import 'dart:convert';

import 'package:manage_teams/features/ai/data/ai_models.dart';

class SseParserBuffer {
  String? _event;
  final StringBuffer _data = StringBuffer();
  String _carry = '';

  List<AiStreamEvent> addChunk(String chunk) {
    final out = <AiStreamEvent>[];
    final text = _carry + chunk;
    _carry = '';
    final lines = text.split('\n');
    if (!text.endsWith('\n')) {
      _carry = lines.removeLast();
    }
    for (final line in lines) {
      final trimmed =
          line.endsWith('\r') ? line.substring(0, line.length - 1) : line;
      if (trimmed.startsWith('event:')) {
        _event = trimmed.substring(6).trim();
      } else if (trimmed.startsWith('data:')) {
        _data.writeln(trimmed.substring(5).trim());
      } else if (trimmed.isEmpty && _event != null) {
        final raw = _data.toString().trim();
        _data.clear();
        final map = raw.isEmpty
            ? <String, dynamic>{}
            : jsonDecode(raw) as Map<String, dynamic>;
        out.add(AiStreamEvent(event: _event!, data: map));
        _event = null;
      }
    }
    return out;
  }
}
