# Board Task Card UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Flutter tasks Board view (underline tabs, column headers + empty drop zones, task cards) to match the approved reference layout while keeping `ColorSkin` colors.

**Architecture:** Extract tiny pure helpers (`formatBoardDueLabel`, `assigneeInitials`) for TDD; recreate underline tabs, column chrome, and `_TaskCard` layout in-place inside `tasks_tab_page.dart`. No API/backend changes. Keep existing `Draggable` / `DragTarget` / header “+ Tạo task”.

**Tech Stack:** Flutter, existing `ColorSkin`, `TaskListItem` / `TaskAssigneeBrief`.

**Spec:** `docs/superpowers/specs/2026-09-29-board-task-card-ui-design.md`

---

### File map

| File | Role |
|------|------|
| Create: `frontend/lib/features/tasks/board_task_display.dart` | Pure helpers: due label + initials |
| Create: `frontend/test/features/tasks/board_task_display_test.dart` | Unit tests for helpers |
| Modify: `frontend/lib/features/tasks/pages/tasks_tab_page.dart` | Underline tabs, column chrome, `_TaskCard` |

---

### Task 1: Due label + initials helpers (TDD)

**Files:**
- Create: `frontend/lib/features/tasks/board_task_display.dart`
- Create: `frontend/test/features/tasks/board_task_display_test.dart`

- [ ] **Step 1: Write failing tests**

```dart
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
```

- [ ] **Step 2: Run tests — expect FAIL (library missing)**

Run:

```bash
cd frontend && flutter test test/features/tasks/board_task_display_test.dart
```

Expected: FAIL — target URI does not exist / undefined functions.

- [ ] **Step 3: Implement helpers**

Create `frontend/lib/features/tasks/board_task_display.dart`:

```dart
/// Board card due text. Returns null when there is no due date to show.
String? formatBoardDueLabel(String? dueDate, {DateTime? now}) {
  if (dueDate == null || dueDate.trim().isEmpty) return null;
  final raw = dueDate.trim();
  DateTime? parsed;
  try {
    parsed = DateTime.parse(raw.length >= 10 ? raw.substring(0, 10) : raw);
  } catch (_) {
    return raw;
  }
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  final due = DateTime(parsed.year, parsed.month, parsed.day);
  if (due == today) return 'Hôm nay';
  return '${due.day} thg ${due.month}';
}

/// 1–2 letter initials from a display name or email local-part.
String assigneeInitials(String name) {
  final cleaned = name.trim();
  if (cleaned.isEmpty) return '?';
  final parts = cleaned
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.length == 1) {
    final p = parts.first;
    return p.characters.first.toUpperCase();
  }
  final a = parts.first.characters.first.toUpperCase();
  final b = parts.last.characters.first.toUpperCase();
  return '$a$b';
}
```

Note: prefer `characters` package if already in pubspec; otherwise use:

```dart
String _firstChar(String s) =>
    s.isEmpty ? '?' : String.fromCharCodes(s.runes.take(1)).toUpperCase();
```

and avoid `package:characters` if not depended on. Check `frontend/pubspec.yaml` — if `characters` is transitive via Flutter SDK it is fine; otherwise use runes.

Safer implementation without characters:

```dart
String assigneeInitials(String name) {
  final cleaned = name.trim();
  if (cleaned.isEmpty) return '?';
  final parts = cleaned
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  String first(String s) {
    final it = s.runes.iterator;
    if (!it.moveNext()) return '?';
    return String.fromCharCode(it.current).toUpperCase();
  }
  if (parts.length == 1) return first(parts.first);
  return '${first(parts.first)}${first(parts.last)}';
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && flutter test test/features/tasks/board_task_display_test.dart
```

Expected: All tests PASS.

- [ ] **Step 5: Commit** (only if user asked to commit)

```bash
git add frontend/lib/features/tasks/board_task_display.dart \
  frontend/test/features/tasks/board_task_display_test.dart
git commit -m "$(cat <<'EOF'
feat(tasks): add board due-label and initials helpers

EOF
)"
```

---

### Task 2: Underline tabs (Board / List / Lịch)

**Files:**
- Modify: `frontend/lib/features/tasks/pages/tasks_tab_page.dart`

- [ ] **Step 1: Replace `_chip` ChoiceChip row with underline tabs**

In `TasksTabPage.build`, replace the `Wrap` of `_chip(...)` (approx lines 71–98) with:

```dart
Padding(
  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
  child: Row(
    children: [
      _ViewTab(
        label: 'Board',
        selected: ready?.view == TasksViewMode.board,
        onTap: () => context.read<TasksBloc>().add(
          const TasksViewChanged(TasksViewMode.board),
        ),
      ),
      const SizedBox(width: 20),
      _ViewTab(
        label: 'List',
        selected: ready?.view == TasksViewMode.list,
        onTap: () => context.read<TasksBloc>().add(
          const TasksViewChanged(TasksViewMode.list),
        ),
      ),
      const SizedBox(width: 20),
      _ViewTab(
        label: 'Lịch',
        selected: ready?.view == TasksViewMode.calendar,
        onTap: () => context.read<TasksBloc>().add(
          const TasksViewChanged(TasksViewMode.calendar),
        ),
      ),
    ],
  ),
),
```

Remove method `_chip` and add widget:

```dart
class _ViewTab extends StatelessWidget {
  const _ViewTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Container(
        padding: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: selected ? ColorSkin.primary : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            color: selected ? ColorSkin.primary : ColorSkin.subtitle,
          ),
        ),
      ),
    );
  }
}
```

Keep header “Công việc” + “+ Tạo task” unchanged.

- [ ] **Step 2: Hot reload / run Chrome and switch Board ↔ List ↔ Lịch**

Expected: underline follows selection; content still switches.

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add frontend/lib/features/tasks/pages/tasks_tab_page.dart
git commit -m "$(cat <<'EOF'
feat(tasks): use underline tabs for board views

EOF
)"
```

---

### Task 3: Column header + empty drop zone

**Files:**
- Modify: `frontend/lib/features/tasks/pages/tasks_tab_page.dart` (`_Column`)

- [ ] **Step 1: Update `_Column.build` header and empty hint**

Replace the plain header `Text('$_label · ${tasks.length}')` with:

```dart
Row(
  children: [
    Expanded(
      child: Text(
        '$_label · ${tasks.length}',
        style: const TextStyle(
          fontWeight: FontWeight.w700,
          color: ColorSkin.title,
        ),
      ),
    ),
    Icon(Icons.more_horiz, size: 18, color: ColorSkin.subtitle),
  ],
),
```

Inside the `ListView` children of `DragTarget`, **before** the task cards loop, when `tasks.isEmpty` insert:

```dart
if (tasks.isEmpty)
  Container(
    margin: const EdgeInsets.only(bottom: 8),
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 16),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(10),
      border: Border.all(
        color: ColorSkin.border1,
        width: 1.5,
        strokeAlign: BorderSide.strokeAlignInside,
      ),
    ),
    // dashed: use CustomPaint or dotted_border if available;
    // fallback solid ColorSkin.border1 is OK if no dashed helper —
    // prefer `_DashedBorder` below.
    child: Column(
      children: [
        Icon(
          status == 'DONE'
              ? Icons.check_circle_outline
              : Icons.south,
          size: 18,
          color: ColorSkin.subtitle,
        ),
        const SizedBox(height: 6),
        Text(
          _emptyHint,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 11,
            color: ColorSkin.subtitle,
          ),
        ),
      ],
    ),
  ),
```

Add getter on `_Column`:

```dart
String get _emptyHint {
  return switch (status) {
    'IN_PROGRESS' => 'Kéo thẻ vào đây để bắt đầu làm việc',
    'DONE' => 'Kéo thẻ vào đây khi công việc hoàn tất',
    _ => 'Kéo thẻ vào đây',
  };
}
```

**Dashed border:** implement a small private painter to match the mock:

```dart
class _DashedRRect extends StatelessWidget {
  const _DashedRRect({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedRRectPainter(
        color: ColorSkin.border1,
        radius: 10,
      ),
      child: child,
    );
  }
}

class _DashedRRectPainter extends CustomPainter {
  _DashedRRectPainter({required this.color, required this.radius});
  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final r = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(radius),
    );
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final path = Path()..addRRect(r);
    // Dash along path
    for (final metric in path.computeMetrics()) {
      var dist = 0.0;
      const dash = 5.0;
      const gap = 4.0;
      while (dist < metric.length) {
        final next = (dist + dash).clamp(0, metric.length);
        canvas.drawPath(metric.extractPath(dist, next.toDouble()), paint);
        dist += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedRRectPainter old) =>
      old.color != color || old.radius != radius;
}
```

Wrap the empty hint `Container` content with `_DashedRRect` (padding inside, no solid border on Container).

Keep existing drag highlight + `SizedBox(height: 120)` floor.

- [ ] **Step 2: Verify empty IN_PROGRESS / DONE columns show Vietnamese hints; Todo with cards does not show empty zone**

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add frontend/lib/features/tasks/pages/tasks_tab_page.dart
git commit -m "$(cat <<'EOF'
feat(tasks): polish board column headers and empty drop zones

EOF
)"
```

---

### Task 4: Redesign `_TaskCard`

**Files:**
- Modify: `frontend/lib/features/tasks/pages/tasks_tab_page.dart` (`_TaskCard`)
- Import: `package:manage_teams/features/tasks/board_task_display.dart`

- [ ] **Step 1: Replace `_TaskCard.build` body**

```dart
@override
Widget build(BuildContext context) {
  final assignee = task.assignees.isEmpty ? null : task.assignees.first;
  final assigneeName = assignee == null
      ? 'Chưa gán'
      : (assignee.displayName?.trim().isNotEmpty == true
          ? assignee.displayName!.trim()
          : assignee.email);
  final dueLabel = formatBoardDueLabel(task.dueDate);

  return Card(
    margin: const EdgeInsets.only(bottom: 8),
    color: ColorSkin.white,
    elevation: 1,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
      side: highlighted
          ? const BorderSide(color: ColorSkin.primary, width: 2)
          : BorderSide.none,
    ),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: ColorSkin.tealLight,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  task.code,
                  style: const TextStyle(
                    color: ColorSkin.primary,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                  ),
                ),
              ),
              const Spacer(),
              _StatusGlyph(status: task.status),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            task.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 14,
              color: ColorSkin.title,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              CircleAvatar(
                radius: 10,
                backgroundColor: assignee == null
                    ? ColorSkin.grey3
                    : ColorSkin.primary,
                child: Text(
                  assigneeInitials(assigneeName),
                  style: const TextStyle(
                    fontSize: 8,
                    fontWeight: FontWeight.w700,
                    color: ColorSkin.white,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  assigneeName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11,
                    color: ColorSkin.subtitle,
                  ),
                ),
              ),
              if (dueLabel != null) ...[
                const SizedBox(width: 8),
                const Icon(
                  Icons.calendar_today_outlined,
                  size: 12,
                  color: ColorSkin.subtitle,
                ),
                const SizedBox(width: 3),
                Text(
                  dueLabel,
                  style: const TextStyle(
                    fontSize: 11,
                    color: ColorSkin.subtitle,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    ),
  );
}
```

Add `_StatusGlyph`:

```dart
class _StatusGlyph extends StatelessWidget {
  const _StatusGlyph({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    return switch (status) {
      'DONE' => const Icon(
          Icons.check_circle,
          size: 18,
          color: ColorSkin.primary,
        ),
      'IN_PROGRESS' => Container(
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: ColorSkin.secondary1, width: 2),
          ),
        ),
      _ => Container(
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: ColorSkin.subtitle, width: 2),
          ),
        ),
    };
  }
}
```

Do **not** add comment count UI.

- [ ] **Step 2: Hot reload Board — cards show badge, glyph, title, avatar+name, due; drag still works**

- [ ] **Step 3: Re-run helper tests**

```bash
cd frontend && flutter test test/features/tasks/board_task_display_test.dart
```

Expected: PASS.

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add frontend/lib/features/tasks/pages/tasks_tab_page.dart
git commit -m "$(cat <<'EOF'
feat(tasks): redesign board task cards layout

EOF
)"
```

---

### Task 5: Manual verification checklist

- [ ] **Step 1:** Board tab underline selected; List/Lịch switch correctly.
- [ ] **Step 2:** Cards: code badge, status icon per column, title, initials+name, due “Hôm nay” / `d thg M`, no comment icon.
- [ ] **Step 3:** Empty columns show dashed hint + correct copy; drag into empty column still works.
- [ ] **Step 4:** Header “+ Tạo task” still creates tasks; no FAB.
- [ ] **Step 5:** Colors only from `ColorSkin` (primary, tealLight, orangeLight, subtitle, etc.).

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Card badge + status icon + title + footer | Task 4 |
| Hide comments | Task 4 (explicit omission) |
| Initials avatar | Tasks 1 + 4 |
| Due “Hôm nay” / short date | Tasks 1 + 4 |
| Column header + ⋯ | Task 3 |
| Empty drop zone copy | Task 3 |
| Underline tabs | Task 2 |
| Keep header create, no FAB | Task 2 (unchanged header) |
| ColorSkin only | Tasks 2–4 |
| No backend | (no backend tasks) |

## Placeholder / consistency check

- Helpers named `formatBoardDueLabel` / `assigneeInitials` consistently across Task 1 and Task 4.
- Status values `TODO` / `IN_PROGRESS` / `DONE` match existing board columns.
- Commit steps gated on user request (repo rule).
