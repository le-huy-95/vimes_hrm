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

  group('formatBoardDateRangeLabel', () {
    final now = DateTime(2026, 9, 30);
    test('null when both empty', () {
      expect(formatBoardDateRangeLabel(null, null, now: now), isNull);
    });
    test('due only', () {
      expect(
        formatBoardDateRangeLabel(null, '2026-09-30', now: now),
        'Hôm nay',
      );
    });
    test('start only', () {
      expect(
        formatBoardDateRangeLabel('2026-10-12', null, now: now),
        '12 thg 10',
      );
    });
    test('both with arrow', () {
      expect(
        formatBoardDateRangeLabel('2026-09-28', '2026-10-05', now: now),
        '28 thg 9 → 5 thg 10',
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
