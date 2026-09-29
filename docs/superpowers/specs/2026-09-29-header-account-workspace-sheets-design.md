# Header account/workspace switcher + Sheets tab

**Date:** 2026-09-29  
**Status:** Approved (brainstorming)  
**Approach:** (1) Rebuild header widgets; reuse existing `AuthBloc` / `WorkspaceBloc` / sync APIs  
**Scope:** Flutter shell header + Sheets (ex-Sync) tab UX. Backend changes only if list-sheets-by-org needs a thin aggregate endpoint; prefer client fan-out of existing `GET /sync/sheets/:groupId` first.

## 1. Goals

1. Replace AppBar brand text **“Vimes”** with company logo (`AppLogo` / `vimes_logo.png`).
2. Replace chip-based org/group picker with **two header controls**:
   - **Account:** primary linked Google email (+ link / switch primary).
   - **Workspace:** org · group with **drill-down** (org → groups).
3. Move Google account management **out of Sync tab into header**.
4. Rename Sync tab UI label to **Sheets**.
5. Sheets tab lists spreadsheets **already bound to Vimes groups** (for groups in the selected org), and can **create** a sheet for the **currently selected group** via existing `ensure`.

## 2. Non-goals

- Browse / pick arbitrary Drive files (full Drive picker).
- Multi-sheet per group, or unbound “orphan” sheets.
- Switching Vimes login identity from the account menu (logout stays separate IconButton).
- New `HeaderBloc` that duplicates Auth/Workspace.
- Migrating Google data when switching primary (existing rebind rules on set-primary remain).

## 3. Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Header layout | **B** — two separate triggers (Account + Workspace) |
| “Chọn email khác” | **A** — set Google **primary** only; same Vimes session |
| Workspace menu | **2** — drill-down: orgs → groups |
| Sync Google card | **A** — remove; accounts only in header |
| Tab rename | Sync → **Sheets** |
| Sheets list | **B** — only sheets bound to Vimes groups |
| Create sheet | **A** — create/ensure for **header-selected group** |
| Implementation | **1** — new UI widgets on existing blocs/APIs |

Supersedes Sync-tab account UI described in `2026-09-28-multi-google-link-gate-design.md` §3.2 / §5 (accounts move to header; set-primary + link APIs unchanged).

## 4. Header layout

**Desktop (≥900px) left → right:**

1. `AppLogo` (compact height ~28–32)
2. Tab text buttons: Home, Tasks, Chat, **Sheets**
3. Spacer
4. `AccountSwitcher` trigger
5. `WorkspaceSwitcher` trigger
6. Logout `IconButton` (unchanged)

**Mobile:** same AppBar row (logo + two switchers + logout); tabs on bottom `NavigationBar` with label **Sheets**.

### 4.1 Account trigger

- Line 1: primary Google email (fallback: Vimes `user.email` if no Google yet)
- Line 2: short hint e.g. “Google primary” or CTA “Liên kết Google” when `googleAccounts` empty

### 4.2 Workspace trigger

- Line 1: `{orgName} · {groupName}` (placeholders “Chọn tổ chức” / “Chọn nhóm”)
- Line 2: “Tổ chức · Nhóm”

## 5. Account menu

Popup / anchored menu:

1. Header: “Google đang liên kết” + current primary email
2. List `user.googleAccounts` — mark `isPrimary`
3. Tap non-primary → confirm (reuse existing Primary rebind warning) → `POST /auth/google/accounts/:sub/primary` → refresh `AuthBloc` (`AuthGoogleLinked` / session refresh)
4. “+ Liên kết email khác” → existing Google link flow (same as former Sync card / `link-id-token`)
5. No logout in this menu

**Empty state:** only CTA to link Google (gate page `/link-google` still applies when zero accounts).

## 6. Workspace menu (drill-down)

Reuse `WorkspaceBloc` + create dialogs from current `WorkspacePickerBar`.

**Step 1 — Organizations**

- List orgs from `WorkspaceReady`
- Tap org → `WorkspaceOrgSelected` → advance to step 2
- “+ Tạo tổ chức” → existing create-org dialog

**Step 2 — Groups**

- Back control returns to step 1
- List groups for selected org (loaded by bloc)
- Tap group → `WorkspaceGroupSelected` → close menu
- “+ Tạo nhóm” → existing create-group dialog

Replace compact chips + bottom sheets in shell with this menu. Persist `ws_org_id` / `ws_group_id` as today.

## 7. Sheets tab

### 7.1 List

- Show rows for **groups in the currently selected organization** that the user can access.
- For each group: sheet title / spreadsheet id if bound; else “chưa có sheet”.
- Highlight row matching header-selected group.
- Data: prefer fan-out `getSheetStatus(groupId)` (or existing status APIs) per group in selected org; add a small backend list endpoint later only if N+1 is too slow.

### 7.2 Create

- “+ Tạo sheet” → `ensureSheet(selectedGroupId)` for **header-selected group**.
- If group already has a sheet: disable button or snackbar “Nhóm đã có sheet” (invariant: 1 sheet / group).
- Requires Google primary linked; otherwise nudge to Account menu / link gate.

### 7.3 Detail / actions

- Selecting a row (or defaulting to current group) keeps existing pull / push / open-in-Google / watch UI scoped to that group’s sheet.
- Remove `_GoogleAccountsCard` from `sync_tab_page.dart`.

### 7.4 Naming

- UI strings: **Sheets** (not Sync).
- Route path stays `/sync` in this iteration (label-only rename). Keep `SyncBloc` class names; full rename to Sheets is a follow-up.

## 8. Components / files

| Piece | Action |
|-------|--------|
| `features/shell/pages/app_shell.dart` | Logo, two switchers, Sheets label, logout |
| `features/shell/widgets/account_switcher.dart` | **New** — trigger + menu |
| `features/shell/widgets/workspace_switcher.dart` | **New** — drill-down menu |
| `features/shell/widgets/workspace_picker_bar.dart` | Remove from shell or delete if unused |
| `features/auth/widgets/app_logo.dart` | Reuse in AppBar |
| `features/sync/pages/sync_tab_page.dart` | Remove Google card; list + create; Sheets copy |
| `AuthBloc` / link + set-primary APIs | Reuse |
| `WorkspaceBloc` | Reuse |

## 9. Error & edge cases

| Case | Behavior |
|------|----------|
| No Google accounts | Account CTA → link; Sheets create blocked with clear message |
| Set-primary / link failure | SnackBar; menu stays usable |
| No org selected | Workspace shows “Chọn tổ chức”; Sheets list empty / prompt |
| Org with no groups | Empty groups step + create group |
| Ensure / status failure | SnackBar; keep prior list where possible |
| Narrow AppBar | Triggers Flexible/ellipsis; menus still open from trigger |

## 10. Testing (manual)

1. Logo visible; no “Vimes” text in shell AppBar.
2. Account menu lists linked emails; set primary + link additional works; Sync card gone.
3. Workspace drill-down: change org → groups refresh; select group persists after restart.
4. Sheets tab label everywhere (wide tabs + bottom nav).
5. Sheets list shows bound/unbound groups for selected org; create ensures for current group only; duplicate create blocked.
6. Pull/push still work for selected group sheet.

## 11. Out of scope follow-ups

- Drive-wide spreadsheet browser.
- Unlink Google from header menu.
- Renaming `SyncBloc` → `SheetsBloc` package-wide.
