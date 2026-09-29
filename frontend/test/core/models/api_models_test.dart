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

  test('SheetStatusResponse parses null sheet', () {
    final r = SheetStatusResponse.fromJson({
      'sheet': null,
      'watches': <dynamic>[],
    });
    expect(r.sheet, isNull);
    expect(r.watches, isEmpty);
  });

  test('GroupSheetDto local matrix has no google url', () {
    final s = GroupSheetDto.fromJson({
      'id': 'sid',
      'groupId': 'gid',
      'spreadsheetId': 'local-sheet-gid',
      'sheetTitle': 'Tasks',
      'driveFileId': 'local-drive-gid',
      'status': 'PENDING',
      'lastPushAt': null,
      'lastPullAt': null,
      'contentHash': null,
      'rowHashes': <String, dynamic>{},
      'writableColumns': ['status', 'personal_note'],
      'ownerUserId': 'u1',
      'createdAt': '2026-09-28T07:00:00.000Z',
      'updatedAt': '2026-09-28T07:00:00.000Z',
    });
    expect(s.isLocalMatrix, isTrue);
    expect(s.googleSheetUrl, isNull);
    expect(s.writableColumns, ['status', 'personal_note']);
  });

  test('SheetsEnqueueResponse parses debounceMs', () {
    final e = SheetsEnqueueResponse.fromJson({
      'jobId': 'j1',
      'deduped': false,
      'debounceMs': 45000,
    });
    expect(e.jobId, 'j1');
    expect(e.deduped, isFalse);
    expect(e.debounceMs, 45000);
  });
}
