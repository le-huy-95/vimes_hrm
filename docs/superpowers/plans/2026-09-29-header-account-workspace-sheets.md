# Header Account/Workspace Switcher + Sheets Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shell header shows logo + AccountSwitcher + WorkspaceSwitcher; Sync tab becomes Sheets with group-bound sheet list and ensure-for-selected-group create.

**Architecture:** New shell widgets reuse `AuthBloc` (Google link / set-primary) and `WorkspaceBloc` (org/group). Sheets tab removes `_GoogleAccountsCard`, lists sheet status per group in selected org via fan-out `getSheetStatus`, create via existing `SyncSheetEnsureRequested`.

**Tech Stack:** Flutter, flutter_bloc, existing SyncRepository / AuthRepository APIs.

**Spec:** `docs/superpowers/specs/2026-09-29-header-account-workspace-sheets-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `frontend/lib/features/shell/widgets/account_switcher.dart` | Account trigger + Google primary/link menu |
| `frontend/lib/features/shell/widgets/workspace_switcher.dart` | Org→group drill-down menu |
| `frontend/lib/features/shell/pages/app_shell.dart` | Compose logo, switchers, Sheets label |
| `frontend/lib/features/shell/widgets/workspace_picker_bar.dart` | Stop using from shell (keep file if Home still references; else unused) |
| `frontend/lib/features/sync/pages/sync_tab_page.dart` | Remove Google accounts card; Sheets list/create UI |
| `frontend/lib/features/sync/bloc/sync_*.dart` | Optional: org sheet statuses map for list |
| `frontend/test/features/shell/header_labels_test.dart` | Assert Sheets label in AppShell tabs constant / widget |

---

### Task 1: AccountSwitcher

**Files:**
- Create: `frontend/lib/features/shell/widgets/account_switcher.dart`
- Modify: move link/set-primary helpers from `sync_tab_page.dart` (share via private methods in switcher using AuthRepository + GoogleSignInHelper)

- [ ] **Step 1:** Create `AccountSwitcher` as `StatefulWidget` with:
  - `BlocBuilder<AuthBloc>` for trigger text (primary email or user.email)
  - `PopupMenuButton` or `MenuAnchor` listing accounts + “Liên kết email khác”
  - On non-primary tap: same confirm dialog copy as Sync `_setPrimary`
  - On link: same Google Sign-In + `linkGoogleWithIdToken` + `AuthGoogleLinked`
  - Show SnackBar on errors; busy flag disables actions

- [ ] **Step 2:** `dart analyze` on the new file — no errors

- [ ] **Step 3:** Commit `feat(shell): add AccountSwitcher for Google primary/link`

---

### Task 2: WorkspaceSwitcher

**Files:**
- Create: `frontend/lib/features/shell/widgets/workspace_switcher.dart`

- [ ] **Step 1:** Create `WorkspaceSwitcher`:
  - Trigger: `{org} · {group}` / placeholders
  - Open menu via `showMenu` / custom `Overlay` / `PopupMenuButton` with two-step local state (`_step`: orgs | groups)
  - Step orgs: list → `WorkspaceOrgSelected` → set step groups
  - Step groups: back + list → `WorkspaceGroupSelected` → close
  - Empty groups: text “Chưa có nhóm — tạo ở tab Home” (create stays on Home; no new create API in header this iteration unless Home dialogs are trivially reusable)

- [ ] **Step 2:** Analyze clean

- [ ] **Step 3:** Commit `feat(shell): add WorkspaceSwitcher drill-down org/group`

---

### Task 3: Wire AppShell

**Files:**
- Modify: `frontend/lib/features/shell/pages/app_shell.dart`

- [ ] **Step 1:** Replace `Text('Vimes')` with `AppLogo(width: 32, height: 32)` (or slightly wider if aspect needs)
- [ ] **Step 2:** Change tab label `'Sync'` → `'Sheets'` (keep Sync icons or use `Icons.table_chart_outlined` / `Icons.grid_on`)
- [ ] **Step 3:** Replace `WorkspacePickerBar` with `AccountSwitcher` + `WorkspaceSwitcher` in a `Flexible`/`Row`
- [ ] **Step 4:** Keep logout IconButton
- [ ] **Step 5:** Analyze + commit `feat(shell): logo, account/workspace switchers, Sheets tab label`

---

### Task 4: Sheets tab — remove Google card + list/create

**Files:**
- Modify: `frontend/lib/features/sync/pages/sync_tab_page.dart`
- Modify: `frontend/lib/features/sync/bloc/sync_state.dart`, `sync_event.dart`, `sync_bloc.dart` as needed

- [ ] **Step 1:** Remove `_GoogleAccountsCard` usage and class; keep `_linkGoogle` only if still needed for reauth card (or point reauth to AccountSwitcher messaging). Prefer keep `_linkGoogle` / `_GoogleReauthCard` for authRequired backlog.
- [ ] **Step 2:** Rename visible titles Sync → Sheets / “Sheet nhóm” section into org group list:
  - Watch `WorkspaceBloc` for `groups` in selected org
  - For each group, show row: name + sheet title or “chưa có sheet”; highlight `selectedGroupId`
  - Tap row: `WorkspaceGroupSelected` + refresh sheet status for that group
  - Header button “+ Tạo sheet”: `SyncSheetEnsureRequested` when selected group has no sheet; else SnackBar “Nhóm đã có sheet”
- [ ] **Step 3:** Load statuses: on org/groups ready, `Future.wait` of `getSheetStatus` into local state map `groupId → GroupSheetDto?` **or** add `SyncOrgSheetsRefreshRequested` to bloc storing `Map<String, GroupSheetDto?> orgSheetByGroupId`. Prefer bloc map for consistency with SyncReady.
- [ ] **Step 4:** Keep pull/push/detail for selected group sheet below the list
- [ ] **Step 5:** Analyze + commit `feat(sheets): list group sheets and ensure for selected group`

---

### Task 5: Verification

- [ ] **Step 1:** `cd frontend && dart analyze lib/features/shell lib/features/sync`
- [ ] **Step 2:** Manual checklist from spec §10 (note in commit/PR body)
- [ ] **Step 3:** Optional small test: AppShell `_tabs` contains Sheets — if hard to widget-test without full DI, skip and rely on analyze

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Logo | 3 |
| Account menu primary/link | 1 |
| Workspace drill-down | 2 |
| Sheets label | 3 |
| Remove Google card | 4 |
| List bound sheets by org groups | 4 |
| Create = ensure selected group | 4 |
| Logout IconButton | 3 |
| Route stays `/sync` | no change |

**Note on “+ Tạo tổ chức/nhóm” in header:** deferred to Home (existing UX) to avoid duplicating create dialogs; list empty state points users to Home. If product insists, follow-up task wires Home create dialogs.
