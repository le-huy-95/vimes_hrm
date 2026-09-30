# Home tab UI — Vietnamese + member delete guard

**Date:** 2026-09-30  
**Status:** Approved (brainstorming)  
**Approach:** **B** — Rebuild Home layout to match target screenshot; extract widgets; wire only existing APIs  
**Scope:** Flutter `frontend/lib/features/home` only. No backend / Prisma changes.

## 1. Goals

1. Restyle Home (Org & Group) so layout matches the provided screenshot: header CTAs, two cards, members table.
2. Replace remaining English UI strings with Vietnamese.
3. Show role labels in Vietnamese (`OWNER` → Chủ sở hữu, `ADMIN` → Quản trị, `MEMBER` → Thành viên).
4. Hide the remove-member (delete) control when the row is the **current user** (cannot remove yourself).

## 2. Non-goals

- Rename org/group, change member role, or show org `createdAt` (APIs / list payload do not expose these).
- Backend permission changes for delete-self (UI guard only; server may still reject independently).
- Pixel-perfect web DataTable chrome (sort/filter icons decorative only if not already implemented).
- New screens outside Home tab.

## 3. Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Scope | Match screenshot UI (rebuild), not minimal string polish only |
| Delete visibility | **A** — hide when `member.userId == currentUserId` |
| Role labels | **B** — Vietnamese only on UI |
| Action wiring | **B** — wire existing APIs; hide controls without API |
| Implementation | **B** — extract widgets; keep `HomeTabPage` as coordinator |

## 4. Layout

### 4.1 Header

- Title: **Tổ chức & Nhóm**
- Subtitle: **Vai trò của bạn:** + Vietnamese role of selected org
- Actions (right), gated by existing admin flags:
  - Org admin: **Mời thành viên**, **+ Nhóm mới**
  - Group admin: **+ Thành viên**

### 4.2 Organization card

- Title: **Tổ chức**
- Avatar: first letter of org name
- **Tên tổ chức:** name (no edit icon — no rename API)
- **id:** truncated org id
- Buttons: **+ Tạo tổ chức mới**, **+ Chấp nhận lời mời** (scroll/focus invitations section)

### 4.3 Selected group card

- Title: **Nhóm đang chọn**
- **Tên nhóm:** name + leave action (existing `POST /groups/:id/leave`)
- **Vai trò của tôi:** Vietnamese `myRole` · member count
- Button: **Xem thành viên** → scroll to members table

### 4.4 Members section

- Heading: **Thành viên nhóm**
- Card title: **Danh sách thành viên**
- Columns: Avatar | Họ & Tên | Email (+ copy) | Vai trò | Hành động
- Delete icon: only if `groupAdmin && member.userId != currentUserId`
- No edit / role-gear icons (no APIs)

### 4.5 Invitations

Keep existing `_InvitationsSection` below cards (or reachable from “Chấp nhận lời mời”). Empty / pending / accept / reject behavior unchanged.

## 5. Components & files

| File | Responsibility |
|------|----------------|
| `pages/home_tab_page.dart` | Bloc wiring, header, layout, prompts, invitations |
| `widgets/home_org_card.dart` | Organization card UI |
| `widgets/home_group_card.dart` | Selected group card + leave + scroll callback |
| `widgets/home_members_table.dart` | Members table + copy + conditional delete |
| `widgets/role_label.dart` | Map API role → Vietnamese label (+ optional pill) |

Reuse existing shared widgets (`AppSectionCard`, `AppButton`, `ColorSkin`) where they fit.

## 6. Data flow

- Workspace context: `WorkspaceBloc` → `WorkspaceReady` (selected org/group, admin flags).
- Members / invitations / busy: `HomeBloc`.
- Current user: `AuthBloc` → `AuthAuthenticated.user.id`.
- Leave group: add `HomeLeaveGroupRequested` (or equivalent) in HomeBloc calling `CoreRepository.leaveGroup`, then refresh workspace/home selection as appropriate (same pattern as other Home mutations).

## 7. Copy map (EN leftovers → VI)

| Current / screenshot EN | Vietnamese |
|-------------------------|------------|
| Role của bạn / Role | Vai trò của bạn |
| + Member | + Thành viên |
| myRole | Vai trò của tôi |
| Tạo org mới | + Tạo tổ chức mới |
| Danh sách | Danh sách thành viên |
| View Members | Xem thành viên |
| OWNER / ADMIN / MEMBER | Chủ sở hữu / Quản trị / Thành viên |
| Mời (short) | Mời thành viên |
| + Nhóm | + Nhóm mới |

## 8. Error handling

- Existing snackbars for `HomeFailure` / `HomeActionSuccess` remain.
- Leave group failures surface via same Home failure path.
- Copy email: silent success snackbar or short toast; ignore clipboard errors quietly or show brief error.

## 9. Testing (manual)

1. Org admin sees invite + create group; group admin sees add member.
2. Role strings appear in Vietnamese in header, group card, and member pills.
3. Current user’s row has **no** delete button; another member’s row does (when viewer is group admin).
4. Leave group works and updates selection.
5. “Xem thành viên” scrolls to the table.
6. Copy email works on web/desktop.
7. Empty org / empty members / invitations flows still work.
