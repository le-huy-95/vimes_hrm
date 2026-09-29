import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams/features/tasks/board_task_display.dart';

void main() {
  group('formatBoardDueLabel', () {
    test('returns null when due is null or empty', () {
      expect(formatBoardDueLabel(null, now: DateTime(2026, 9, 29)), isNull);
      expect(formatBoardDueLabel('', now: DateTime(2026, 9, 29)), isNull);
    });

    test('returns Hôm nay when due is today', () {
      expect(
        formatBoardDueLabel('2026-09-29', now: DateTime(2026, 9, 29, 15)),
        'Hôm nay',
      );
    });

    test('returns short Vietnamese date otherwise', () {
      expect(
        formatBoardDueLabel('2026-10-12', now: DateTime(2026, 9, 29)),
        '12 thg 10',
      );
    });
  });

  group('assigneeInitials', () {
    test('uses first letters of up to two words', () {
      expect(assigneeInitials('Nguyễn Văn A'), 'NA');
      expect(assigneeInitials('Me'), 'M');
    });

    test('falls back for empty', () {
      expect(assigneeInitials(''), '?');
      expect(assigneeInitials('   '), '?');
    });
  });
}
