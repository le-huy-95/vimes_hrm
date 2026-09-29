# Board task card UI redesign

**Date:** 2026-09-29  
**Status:** Approved (brainstorming)  
**Approach:** In-place UI update in `frontend/lib/features/tasks/pages/tasks_tab_page.dart` — restyle board tabs, column chrome, and `_TaskCard` to match reference layout; keep `ColorSkin` system colors.  
**Scope:** Flutter tasks **Board** view chrome + card layout only. No backend / API / schema changes.

## 1. Goals

1. Task cards on Board match the reference structure: ID badge + status icon · title · footer (assignee + due).
2. Columns show clearer headers and empty drop-zone copy when a column has zero tasks.
3. View switcher (Board / List / Lịch) uses underline tabs styled with `ColorSkin.primary`.
4. Colors stay on existing `ColorSkin` (no palette from the mock image).

## 2. Non-goals

- FAB create button (keep existing header “+ Tạo task”).
- Comment count on cards (no task-comment API/model).
- Backend comment wiring or avatar photo URLs.
- Redesigning List / Calendar item layouts (only shared tab control changes).
- Functional menus behind column “⋯” (decorative only in this pass).
- Reordering within a column; drag/status rules stay as today.

## 3. Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Scope | Full board chrome (card + columns + tabs); no FAB |
| Comments | Hide — no fake `0`, no backend in this work |
| Create affordance | Keep header “+ Tạo task” |
| Status icon | Mirror `task.status` |
| Avatar | Initials circle (no photo field in API) |
| Implementation | Edit `tasks_tab_page.dart` in place |
| Tabs | Underline style (replace ChoiceChip for Board/List/Lịch) |

## 4. Current → target

| Area | Today | Target |
|------|--------|--------|
| Tabs | `ChoiceChip` row | Underline tabs; selected = primary text + 2px underline |
| Column header | Plain `label · count` text | Same text + trailing decorative `⋯` |
| Empty column | Blank + tall spacer | Dashed drop hint when `tasks.isEmpty` |
| Card | Code, title, due text, assignee names stacked | Badge + status icon; title; footer row |
| Colors | ColorSkin columns already | Unchanged column backgrounds; card surface white |

## 5. Task card layout

```
┌─────────────────────────────────────┐
│ [CODE]                    (status)  │
│ Title                               │
│ (avatar) Name    📅 due             │
└─────────────────────────────────────┘
```

### Header

- **Badge:** `task.code` — compact pill, `ColorSkin.primary` on `ColorSkin.tealLight`.
- **Status icon** (top-right):
  - `TODO` — empty circle, `ColorSkin.subtitle` stroke
  - `IN_PROGRESS` — circle / ring using `ColorSkin.secondary1`
  - `DONE` — filled check using `ColorSkin.primary`

### Body

- **Title:** `task.title`, bold, `ColorSkin.title`, max 2 lines with ellipsis.

### Footer

- **Assignee:** first of `task.assignees`; display name or email; circle with 1–2 initials (`ColorSkin.primary` / `secondary1` background). If empty: grey placeholder avatar + “Chưa gán”.
- **Due:** calendar icon + label; omit entire due segment if `dueDate == null`. Label “Hôm nay” when due is today (local calendar day); else short date (e.g. `d thg M` or existing parse helpers).
- **Comments:** not shown.

### Interaction / chrome

- Keep `Draggable` / `DragTarget` behavior unchanged.
- Highlight border when `focusTaskId` matches (existing).
- Card: white surface, 12 radius, light shadow or subtle elevation consistent with Material `Card`.

## 6. Column chrome

- Backgrounds unchanged: Todo `#F5F7F7`, In progress `orangeLight`, Done `tealLight`.
- Header: `{label} · {count}` + `Icons.more_horiz` (no menu handler).
- Empty drop zone (only when `tasks.isEmpty`) — show for **all** empty columns:
  - `TODO`: “Kéo thẻ vào đây”
  - `IN_PROGRESS`: “Kéo thẻ vào đây để bắt đầu làm việc”
  - `DONE`: “Kéo thẻ vào đây khi công việc hoàn tất”
- On drag hover: existing primary alpha highlight.

## 7. Tabs

- Replace `_chip` ChoiceChips with a simple `Row` of `InkWell` / `GestureDetector` labels.
- Selected: `FontWeight.w700`, `ColorSkin.primary`, bottom border 2px primary.
- Unselected: `ColorSkin.subtitle`.
- Still dispatch `TasksViewChanged`.
- Header title “Công việc” + “+ Tạo task” unchanged on all views.

## 8. Testing / verification

- Manual: Board with mixed statuses, empty columns, tasks with/without assignee and due.
- Hot reload / Chrome web: cards readable, drag still works, tabs switch views.
- No new unit tests required unless extracting pure date-label helpers — optional small test for “Hôm nay” formatter if factored out.

## 9. Out of scope follow-ups

- Task comments + `commentCount` on list API.
- User avatar URLs.
- Column overflow menus (filter / sort).
- FAB create pattern.
