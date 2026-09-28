import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams/core/models/api_models.dart';

void main() {
  test('TaskListItem parses createdAt', () {
    final t = TaskListItem.fromJson({
      'id': 'a',
      'code': 'ENG-1',
      'title': 'T',
      'status': 'TODO',
      'completionMode': 'ANY',
      'allowClaim': true,
      'maxAssignees': null,
      'createdAt': '2026-09-28T08:00:00.000Z',
      'assignees': <dynamic>[],
    });
    expect(t.code, 'ENG-1');
    expect(t.createdAt.toUtc().year, 2026);
  });

  test('OrganizationItem parses role', () {
    final o = OrganizationItem.fromJson({
      'id': '1',
      'name': 'Acme',
      'role': 'OWNER',
    });
    expect(o.role, 'OWNER');
  });

  test('ChatMessage parses reactions and deleted body', () {
    final m = ChatMessage.fromJson({
      'id': 'm1',
      'seq': 1,
      'senderUserId': 'u1',
      'body': null,
      'fileIds': <dynamic>[],
      'mentions': <dynamic>[],
      'reactions': [
        {'emoji': '👍', 'count': 2, 'me': true},
      ],
      'createdAt': '2026-09-28T08:00:00.000Z',
      'deleted': true,
    });
    expect(m.body, '');
    expect(m.deleted, isTrue);
    expect(m.reactions.single.emoji, '👍');
  });
}
