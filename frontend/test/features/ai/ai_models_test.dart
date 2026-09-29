import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams/features/ai/data/ai_models.dart';

void main() {
  test('AiChatResult.fromJson parses links and mock', () {
    final r = AiChatResult.fromJson({
      'sessionId': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      'answer': 'Hello',
      'links': [
        {
          'type': 'task',
          'id': 't1',
          'href': 'http://localhost:3000/groups/g1/tasks/T-1',
          'label': 'T-1: Open A',
        },
      ],
      'toolsUsed': ['list_my_tasks'],
      'mock': true,
      'provider': 'mock',
      'usage': {'promptTokens': 1, 'completionTokens': 2},
    });
    expect(r.sessionId, startsWith('aaaaaaaa'));
    expect(r.answer, 'Hello');
    expect(r.links.single.type, 'task');
    expect(r.links.single.id, 't1');
    expect(r.mock, isTrue);
    expect(r.usage.completionTokens, 2);
  });

  test('AiChatResult tolerates missing links/usage', () {
    final r = AiChatResult.fromJson({
      'sessionId': 's1',
      'answer': '',
    });
    expect(r.links, isEmpty);
    expect(r.mock, isTrue);
    expect(r.provider, 'mock');
  });
}
