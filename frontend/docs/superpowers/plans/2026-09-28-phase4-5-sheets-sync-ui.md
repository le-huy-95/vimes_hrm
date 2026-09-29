# Phase 4–5 Sheets Sync UI — Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** Ghép API Sheets sync (Phase 4) + quan sát sync (Phase 5) vào tab Sync Flutter, không poll.

**Architecture:** Mở rộng `SyncRepository` / `SyncBloc` / `SyncTabPage`. Sheet status chỉ load khi đứng tab Sync (có group). Refresh tay.

**Tech Stack:** Flutter, flutter_bloc, Dio, url_launcher, Equatable.

**Spec:** `frontend/docs/superpowers/specs/2026-09-28-phase4-5-sheets-sync-ui-design.md`

---

### Task 1: Models + tests
- Modify: `lib/core/models/api_models.dart`
- Test: `test/core/models/api_models_test.dart`
- [x] Thêm `GroupSheetDto`, `DriveWatchDto`, `SheetStatusResponse`, `SheetsEnqueueResponse`
- [x] Test parse sheet null, local matrix, enqueue debounceMs

### Task 2: Repository
- Modify: `lib/features/home/data/sync_repository.dart`
- [x] `getSheetStatus` / `ensureSheet` / `pushSheet` / `pullSheet`

### Task 3: SyncBloc
- Modify: `sync_event.dart`, `sync_state.dart`, `sync_bloc.dart`
- [x] Events group/ensure/push/pull; state sheet fields; no poll

### Task 4: SyncTabPage UI
- Modify: `lib/features/sync/pages/sync_tab_page.dart`
- [x] Section Sheet; wire WorkspaceBloc chỉ khi tab mở; url_launcher LIVE

### Task 5: Verify
- [x] `flutter test` models; analyze sync files
