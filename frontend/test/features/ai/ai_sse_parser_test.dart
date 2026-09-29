import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams/features/ai/data/ai_models.dart';
import 'package:manage_teams/features/ai/data/ai_sse_parser.dart';

void main() {
  test('parseSseChunk yields meta then token then links then done', () {
    const raw = '''
event: meta
data: {"sessionId":"s1","mock":true,"provider":"mock"}

event: token
data: {"text":"Hi"}

event: links
data: {"links":[{"type":"task","id":"t1","href":"/x","label":"T-1"}]}

event: done
data: {}

''';
    final events = <AiStreamEvent>[];
    final buf = SseParserBuffer();
    events.addAll(buf.addChunk(raw));
    expect(events.map((e) => e.event), ['meta', 'token', 'links', 'done']);
    expect(events[1].data['text'], 'Hi');
    expect((events[2].data['links'] as List).length, 1);
  });
}
