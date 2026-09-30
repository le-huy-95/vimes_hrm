# In-app Google Sheets editor (native WebView)

**Date:** 2026-09-30  
**Status:** Approved (brainstorming)  
**Approach:** (1) Android/iOS/macOS WebView embeds the real Sheets `/edit` UI full-tab; Flutter web + Windows open Sheets externally  
**Scope:** Flutter Sheets tab editor UX + thin Drive share on ensure in `google-sync-service`. Reuses existing push/pull/ensure APIs.  
**Related:** `2026-09-29-header-account-workspace-sheets-design.md` (Sheets list/tab), Phase 4 sheets sync.

## 1. Goals

1. Let users **edit the real Google Spreadsheet** bound to a Vimes group **inside the app** (full Sheets editor: formulas, formatting, collab).
2. Keep existing **task ↔ sheet sync** (ensure / push / pull) on a thin toolbar next to the editor.
3. Ship a credible MVP on platforms where embed works (**Android / iOS / macOS WebView**), without pretending iframe edit works on Flutter web.

## 2. Non-goals

- Custom spreadsheet grid or Sheets API cell editor in Flutter.
- Publish-to-web / `/pubhtml` embed (view-oriented, not full editor).
- Promising in-iframe editable Sheets on **Flutter web** (Chrome) in MVP.
- Official in-app WebView on **Windows** in MVP (no endorsed `webview_flutter`; external open only).
- Drive-wide file picker, multi-sheet per group, unbound orphan sheets.
- Injecting Vimes OAuth tokens into the Sheets UI (unsupported for full editor).
- Changing matrix columns, debounce, or pull writable-column rules beyond what share UX needs to explain.

## 3. Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Experience | Embed **real** Google Sheets editor (not a custom grid) |
| Layout | **Full-tab editor**: list → editor with thin toolbar (not split, not modal) |
| Platform order | **Native WebView first** (Android / iOS / macOS); Flutter web + Windows = open externally in MVP |
| Web iframe | Out of MVP; optional later as best-effort only |
| Embed failure (native) | Keep frame + banner + **Mở Google Sheets** |
| Header group change while editing | **Pop back to Sheets list** |
| Approach | FE WebView + existing `googleSheetUrl`; BE only for Drive share on ensure |
| Drive access for members | **Share spreadsheet with group members’ linked Google emails** on ensure / LIVE create (member add/remove hooks = follow-up) |

## 4. Platform behavior

### 4.1 Native WebView targets (MVP)

**In-app embed platforms** (official `webview_flutter`): **Android, iOS, macOS**.

1. Sheets list (per header org / group binding — see header-Sheets spec).
2. Tap a **LIVE** sheet with real `spreadsheetId` → navigate to editor route.
3. `SheetEmbedView` loads  
   `https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit`  
   in `webview_flutter` as a **top-level** document (not a nested third-party iframe anti-pattern).
4. If the user has no Google session in the WebView, Google’s own login UI appears inside the WebView.
5. Toolbar always offers **Mở ngoài** via `url_launcher`.

**Windows:** no endorsed `webview_flutter` implementation in MVP — treat like web (external open). Third-party WebView2 is a follow-up, not required for MVP success.

### 4.2 Flutter web (Chrome)

1. Same list + sync actions.
2. “Open sheet” / row primary action → **`url_launcher`** to `googleSheetUrl` (new tab). Do **not** ship an iframe editor as the happy path.
3. Copy may note that in-app editing is available on Android / iOS / macOS builds.

### 4.3 Local / non-LIVE matrix

If `GroupSheetDto.isLocalMatrix` (or `GOOGLE_SHEETS_LIVE` effectively off): no editor route; show local badge and block open-in-app / open-external until a real spreadsheet exists.

## 5. UX

### 5.1 Sheets list

Unchanged intent from header-Sheets design: bound sheets for groups in selected org; create/ensure for header-selected group; Push/Pull/status on detail.

Primary affordance on a LIVE row: **Mở trong app** (native) / **Mở Google Sheets** (web).

### 5.2 Editor full-tab

Toolbar (top):

| Control | Behavior |
|---------|----------|
| ← Quay lại | Pop to Sheets list |
| Title | `sheetTitle` or group name |
| Đẩy lên Sheet | `SyncSheetPushRequested` (existing) |
| Kéo từ Sheet | `SyncSheetPullRequested` (existing) |
| Mở ngoài | `url_launcher` on `googleSheetUrl` |

Body: `SheetEmbedView` (native) filling remaining height.

### 5.3 Embed failure (native)

On WebView load error / access denied page detected when feasible:

- Overlay or banner: short explanation + **Mở Google Sheets**.
- Do not auto-redirect without user action.

### 5.4 Account mismatch

Optional one-line hint: editing uses the Google account signed into the WebView/browser, which may differ from Vimes Google primary. No automatic account switch in MVP.

## 6. Architecture (FE)

| Piece | Role |
|-------|------|
| `SyncTabPage` / Sheets list | Entry; navigate to editor when LIVE |
| `SheetEditorPage` (new) | Full-tab scaffold + toolbar + embed/fallback |
| `SheetEmbedView` (new) | Native: `webview_flutter`. Web: stub that shows CTA to open external (or unused if navigation never builds embed on web) |
| `SyncBloc` | Unchanged ensure/push/pull/status; editor reads sheet DTO from ready state or route args |
| Router | Child under sync, e.g. `/sync/sheet/:groupId` (path stays `/sync`; UI label Sheets) |

**URL helper:** Prefer  
`https://docs.google.com/spreadsheets/d/{id}/edit`  
(update `GroupSheetDto.googleSheetUrl` to include `/edit` for consistency).

**Dependencies:** `webview_flutter` already in `pubspec.yaml` (unused today). No new BE client methods for embed itself.

## 7. Backend — Drive share for members

Today `ensureLiveSpreadsheet` creates a file owned by the enqueue user’s OAuth identity and does **not** grant group members Drive access. In-app edit for non-owners fails without share.

### 7.1 Behavior

When a LIVE spreadsheet is created or ensure runs successfully:

1. Resolve **ACTIVE group members**.
2. For each member with a linked Google account, take a usable email (primary linked Google email preferred).
3. Call Drive `permissions.create` on the spreadsheet with `role: writer` for each member email. File **owner** stays the creating Google user (no transfer).
4. Idempotent: ignore “already exists” permission errors.
5. Skip members without a linked Google email (they keep Vimes sync via API only; UI can say they need to link Google to edit in Sheets).

### 7.2 Member add/remove (MVP scope)

- **MVP:** re-share on each successful **ensure** and on **LIVE create** (first real spreadsheet id).
- **Follow-up:** hook group member add/remove to grant/revoke Drive permission. Do not block editor MVP on that hook.

### 7.3 Scopes

Existing `drive.file` is sufficient for files the app created. No scope expansion required for share-on-own-file.

## 8. Data flow

1. List/status: existing `GET /sync/sheets/:groupId` (and org fan-out as in header-Sheets spec).
2. Open editor: only `groupId` + sheet DTO fields (`spreadsheetId`, title, url) — **no new read API**.
3. Push/Pull/Ensure: existing POSTs; toolbar → `SyncBloc`.
4. Share: inside ensure/LIVE create path in `google-sync-service` (see §7).

## 9. Error handling

| Situation | Handling |
|-----------|----------|
| Local matrix | No embed; explain LIVE required |
| Native WebView error | Banner + Mở ngoài |
| Flutter web | Always external open for edit |
| Not Google-linked | Existing link-gate / Account nudge |
| Member lacks Drive access | After share job, retry open; else snackbar “Chưa có quyền Drive — nhờ owner Ensure lại / link Google” |
| Header group changes on editor | Pop to list |
| Protected columns A–B | Unchanged server protect; user may see Sheets protect UI — document in help copy later, no FE special case in MVP |

## 10. Testing

- Widget: toolbar invokes push/pull; back pops; local sheet blocks embed.
- Native manual: load real spreadsheet, edit cell, pull sync observes writable columns.
- Web manual: row open launches external tab; no iframe editor asserted.
- BE unit/integration: ensure grants permission for member emails; idempotent re-ensure.
- No CI E2E Google login.

## 11. Rollout

1. FE editor route + native WebView + web external open.  
2. BE Drive share on ensure/create.  
3. Ship Android / iOS / macOS builds for real in-app editing; Chrome (and Windows) continue as sync + external Sheets.  
4. Optional later: Windows WebView2 and/or best-effort web iframe (non-blocking if frames fail).

## 12. Success criteria

- On Android, iOS, or macOS, owner (and shared member with Google linked) can open the group sheet and edit in-app without leaving Vimes chrome.  
- Push/Pull remain available from the editor toolbar.  
- Flutter web (and Windows MVP) users can always reach the real sheet via external open; app does not claim broken iframe edit as success.
