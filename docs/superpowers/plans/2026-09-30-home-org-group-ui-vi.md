# Home Org/Group Vietnamese UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Home tab to match the org/group screenshot layout, Vietnamese copy + role labels, and hide remove-member for the current user.

**Architecture:** Keep `HomeTabPage` as Bloc coordinator. Extract presentational widgets (`HomeOrgCard`, `HomeGroupCard`, `HomeMembersTable`) plus pure helpers (`roleLabelVi`, `canShowRemoveMember`). Wire leave-group through a new `HomeLeaveGroupRequested` event using existing `CoreRepository.leaveGroup`. No backend changes. Keep existing light `ColorSkin` / `AppSectionCard` look (match layout of screenshot, not dark theme).

**Tech Stack:** Flutter, flutter_bloc, equatable, existing `AuthBloc` / `WorkspaceBloc` / `HomeBloc`

**Spec:** `docs/superpowers/specs/2026-09-30-home-org-group-ui-vi-design.md`

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/lib/features/home/widgets/role_label.dart` | Create | `roleLabelVi(String?)` + optional pill widget |
| `frontend/test/features/home/role_label_test.dart` | Create | Unit tests for role map + delete visibility helper |
| `frontend/lib/features/home/widgets/home_member_actions.dart` | Create | `canShowRemoveMember(...)` pure helper |
| `frontend/lib/features/home/widgets/home_org_card.dart` | Create | Organization card UI |
| `frontend/lib/features/home/widgets/home_group_card.dart` | Create | Selected group card + leave + view-members |
| `frontend/lib/features/home/widgets/home_members_table.dart` | Create | Members table + copy email + conditional delete |
| `frontend/lib/features/home/bloc/home_event.dart` | Modify | Add `HomeLeaveGroupRequested` |
| `frontend/lib/features/home/bloc/home_bloc.dart` | Modify | Handle leave → refresh workspace |
| `frontend/lib/features/home/pages/home_tab_page.dart` | Modify | New layout, GlobalKeys for scroll, AuthBloc currentUserId |

---

### Task 1: Role label + delete visibility helpers (TDD)

**Files:**
- Create: `frontend/lib/features/home/widgets/role_label.dart`
- Create: `frontend/lib/features/home/widgets/home_member_actions.dart`
- Create: `frontend/test/features/home/role_label_test.dart`

- [ ] **Step 1: Write the failing tests**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams/features/home/widgets/home_member_actions.dart';
import 'package:manage_teams/features/home/widgets/role_label.dart';

void main() {
  group('roleLabelVi', () {
    test('maps known roles', () {
      expect(roleLabelVi('OWNER'), 'Chủ sở hữu');
      expect(roleLabelVi('ADMIN'), 'Quản trị');
      expect(roleLabelVi('MEMBER'), 'Thành viên');
    });

    test('falls back for null/unknown', () {
      expect(roleLabelVi(null), '—');
      expect(roleLabelVi(''), '—');
      expect(roleLabelVi('CUSTOM'), 'CUSTOM');
    });
  });

  group('canShowRemoveMember', () {
    test('false when viewer is not group admin', () {
      expect(
        canShowRemoveMember(
          groupAdmin: false,
          currentUserId: 'me',
          memberUserId: 'other',
        ),
        isFalse,
      );
    });

    test('false when row is self', () {
      expect(
        canShowRemoveMember(
          groupAdmin: true,
          currentUserId: 'me',
          memberUserId: 'me',
        ),
        isFalse,
      );
    });

    test('true when admin removing someone else', () {
      expect(
        canShowRemoveMember(
          groupAdmin: true,
          currentUserId: 'me',
          memberUserId: 'other',
        ),
        isTrue,
      );
    });

    test('false when currentUserId is null', () {
      expect(
        canShowRemoveMember(
          groupAdmin: true,
          currentUserId: null,
          memberUserId: 'other',
        ),
        isFalse,
      );
    });
  });
}
```

- [ ] **Step 2: Run tests — expect FAIL (libraries missing)**

```bash
cd frontend && flutter test test/features/home/role_label_test.dart
```

Expected: FAIL — target URI does not exist / undefined functions.

- [ ] **Step 3: Implement helpers**

`frontend/lib/features/home/widgets/role_label.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';

String roleLabelVi(String? role) {
  if (role == null || role.isEmpty) return '—';
  return switch (role) {
    'OWNER' => 'Chủ sở hữu',
    'ADMIN' => 'Quản trị',
    'MEMBER' => 'Thành viên',
    _ => role,
  };
}

class RolePill extends StatelessWidget {
  const RolePill({super.key, required this.role});

  final String role;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: ColorSkin.tealLight,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        roleLabelVi(role),
        style: const TextStyle(fontSize: 11, color: ColorSkin.primarySub),
      ),
    );
  }
}
```

`frontend/lib/features/home/widgets/home_member_actions.dart`:

```dart
bool canShowRemoveMember({
  required bool groupAdmin,
  required String? currentUserId,
  required String memberUserId,
}) {
  if (!groupAdmin) return false;
  if (currentUserId == null || currentUserId.isEmpty) return false;
  return memberUserId != currentUserId;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && flutter test test/features/home/role_label_test.dart
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/features/home/widgets/role_label.dart \
  frontend/lib/features/home/widgets/home_member_actions.dart \
  frontend/test/features/home/role_label_test.dart
git commit -m "$(cat <<'EOF'
feat(home): add Vietnamese role labels and remove-self guard helper

EOF
)"
```

---

### Task 2: HomeLeaveGroupRequested in HomeBloc

**Files:**
- Modify: `frontend/lib/features/home/bloc/home_event.dart`
- Modify: `frontend/lib/features/home/bloc/home_bloc.dart`

- [ ] **Step 1: Add event**

Append to `home_event.dart`:

```dart
class HomeLeaveGroupRequested extends HomeEvent {
  const HomeLeaveGroupRequested();
}
```

- [ ] **Step 2: Register handler in HomeBloc constructor**

```dart
on<HomeLeaveGroupRequested>(_onLeaveGroup);
```

- [ ] **Step 3: Implement `_onLeaveGroup`**

After `_onAddMember`, add:

```dart
Future<void> _onLeaveGroup(
  HomeLeaveGroupRequested event,
  Emitter<HomeState> emit,
) async {
  if (_groupId == null) return;
  emit(HomeReady(members: _members, invitations: _invitations, busy: true));
  try {
    await _core.leaveGroup(_groupId!);
    _workspace.add(const WorkspaceRefreshRequested());
    emit(
      HomeActionSuccess(
        'Đã rời nhóm',
        members: const [],
        invitations: _invitations,
      ),
    );
    emit(HomeReady(members: const [], invitations: _invitations));
  } catch (e) {
    emit(
      HomeFailure(_msg(e), members: _members, invitations: _invitations),
    );
    emit(HomeReady(members: _members, invitations: _invitations));
  }
}
```

Notes:
- `CoreRepository.leaveGroup` already exists.
- `WorkspaceRefreshRequested` reloads orgs/groups and drops invalid `selectedGroupId` if the left group disappears from the list (existing refresh logic).

- [ ] **Step 4: Static analyze touched files**

```bash
cd frontend && dart analyze lib/features/home/bloc/home_event.dart lib/features/home/bloc/home_bloc.dart
```

Expected: No issues.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/features/home/bloc/home_event.dart \
  frontend/lib/features/home/bloc/home_bloc.dart
git commit -m "$(cat <<'EOF'
feat(home): wire leave-group through HomeBloc

EOF
)"
```

---

### Task 3: Presentational cards + members table

**Files:**
- Create: `frontend/lib/features/home/widgets/home_org_card.dart`
- Create: `frontend/lib/features/home/widgets/home_group_card.dart`
- Create: `frontend/lib/features/home/widgets/home_members_table.dart`

- [ ] **Step 1: Create `HomeOrgCard`**

```dart
import 'package:characters/characters.dart';
import 'package:flutter/material.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_section_card.dart';

class HomeOrgCard extends StatelessWidget {
  const HomeOrgCard({
    super.key,
    required this.org,
    required this.onCreateOrg,
    required this.onAcceptInvite,
  });

  final OrganizationItem? org;
  final VoidCallback onCreateOrg;
  final VoidCallback onAcceptInvite;

  String get _initial {
    final name = org?.name ?? '';
    if (name.isEmpty) return '?';
    return name.characters.first.toUpperCase();
  }

  String get _shortId {
    final id = org?.id ?? '';
    if (id.length <= 12) return id.isEmpty ? '—' : id;
    return '${id.substring(0, 8)}…${id.substring(id.length - 4)}';
  }

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      title: 'Tổ chức',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: ColorSkin.tealLight,
                child: Text(
                  _initial,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: ColorSkin.primary,
                    fontSize: 20,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      TextSpan(
                        style: const TextStyle(fontSize: 15, color: ColorSkin.title),
                        children: [
                          const TextSpan(text: 'Tên tổ chức: '),
                          TextSpan(
                            text: org?.name ?? '—',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'id: $_shortId',
                      style: const TextStyle(
                        color: ColorSkin.subtitle,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              AppButton(
                label: '+ Tạo tổ chức mới',
                height: 36,
                onPressed: onCreateOrg,
              ),
              AppButton(
                label: '+ Chấp nhận lời mời',
                height: 36,
                onPressed: onAcceptInvite,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Create `HomeGroupCard`**

```dart
import 'package:flutter/material.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/widgets/role_label.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_section_card.dart';

class HomeGroupCard extends StatelessWidget {
  const HomeGroupCard({
    super.key,
    required this.group,
    required this.memberCount,
    required this.busy,
    required this.onLeave,
    required this.onViewMembers,
  });

  final GroupSummary? group;
  final int memberCount;
  final bool busy;
  final VoidCallback onLeave;
  final VoidCallback onViewMembers;

  @override
  Widget build(BuildContext context) {
    final hasGroup = group != null;
    return AppSectionCard(
      title: 'Nhóm đang chọn',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    style: const TextStyle(fontSize: 15, color: ColorSkin.title),
                    children: [
                      const TextSpan(text: 'Tên nhóm: '),
                      TextSpan(
                        text: group?.name ?? 'Chưa chọn nhóm',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ),
              if (hasGroup)
                IconButton(
                  tooltip: 'Rời nhóm',
                  onPressed: busy ? null : onLeave,
                  icon: const Icon(Icons.logout, color: ColorSkin.subtitle),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Vai trò của tôi: ${roleLabelVi(group?.myRole)} · $memberCount thành viên',
            style: const TextStyle(color: ColorSkin.subtitle, fontSize: 13),
          ),
          const SizedBox(height: 14),
          AppButton(
            label: 'Xem thành viên',
            height: 36,
            onPressed: hasGroup ? onViewMembers : null,
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 3: Create `HomeMembersTable`**

```dart
import 'package:characters/characters.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/widgets/home_member_actions.dart';
import 'package:manage_teams/features/home/widgets/role_label.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_section_card.dart';

class HomeMembersTable extends StatelessWidget {
  const HomeMembersTable({
    super.key,
    required this.members,
    required this.groupAdmin,
    required this.currentUserId,
    required this.onRemove,
  });

  final List<GroupMember> members;
  final bool groupAdmin;
  final String? currentUserId;
  final ValueChanged<String> onRemove;

  static String _initial(GroupMember m) {
    final label =
        (m.displayName?.isNotEmpty ?? false) ? m.displayName! : m.email;
    if (label.isEmpty) return '?';
    return label.characters.first.toUpperCase();
  }

  Future<void> _copyEmail(String email) async {
    await Clipboard.setData(ClipboardData(text: email));
    SimpleSnackbarService.showSuccess('Đã sao chép email');
  }

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      title: 'Danh sách thành viên',
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                SizedBox(width: 48, child: Text('Avatar', style: _h)),
                Expanded(flex: 2, child: Text('Họ & Tên', style: _h)),
                Expanded(flex: 3, child: Text('Email', style: _h)),
                SizedBox(width: 110, child: Text('Vai trò', style: _h)),
                SizedBox(width: 56, child: Text('Hành động', style: _h)),
              ],
            ),
          ),
          const Divider(height: 1),
          for (var i = 0; i < members.length; i++) ...[
            if (i > 0) const Divider(height: 1),
            _MemberRow(
              member: members[i],
              index: i,
              showRemove: canShowRemoveMember(
                groupAdmin: groupAdmin,
                currentUserId: currentUserId,
                memberUserId: members[i].userId,
              ),
              onCopy: () => _copyEmail(members[i].email),
              onRemove: () => onRemove(members[i].userId),
              initial: _initial(members[i]),
            ),
          ],
        ],
      ),
    );
  }
}

const _h = TextStyle(
  fontSize: 12,
  fontWeight: FontWeight.w600,
  color: ColorSkin.subtitle,
);

class _MemberRow extends StatelessWidget {
  const _MemberRow({
    required this.member,
    required this.index,
    required this.showRemove,
    required this.onCopy,
    required this.onRemove,
    required this.initial,
  });

  final GroupMember member;
  final int index;
  final bool showRemove;
  final VoidCallback onCopy;
  final VoidCallback onRemove;
  final String initial;

  @override
  Widget build(BuildContext context) {
    final name = (member.displayName?.isNotEmpty ?? false)
        ? member.displayName!
        : member.email;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          SizedBox(
            width: 48,
            child: CircleAvatar(
              backgroundColor:
                  index.isEven ? ColorSkin.tealLight : ColorSkin.orangeLight,
              child: Text(initial),
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
          Expanded(
            flex: 3,
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    member.email,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: ColorSkin.subtitle),
                  ),
                ),
                IconButton(
                  tooltip: 'Sao chép email',
                  iconSize: 18,
                  onPressed: onCopy,
                  icon: const Icon(Icons.copy_outlined, size: 18),
                ),
              ],
            ),
          ),
          SizedBox(width: 110, child: RolePill(role: member.role)),
          SizedBox(
            width: 56,
            child: showRemove
                ? IconButton(
                    tooltip: 'Xóa thành viên',
                    onPressed: onRemove,
                    icon: const Icon(
                      Icons.delete_outline,
                      color: ColorSkin.error,
                    ),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}
```

On narrow widths the table row may overflow — wrap the card child in `SingleChildScrollView(scrollDirection: Axis.horizontal, child: ConstrainedBox(constraints: BoxConstraints(minWidth: 640), child: ...))` if needed during implementation.

- [ ] **Step 4: Analyze new widgets**

```bash
cd frontend && dart analyze lib/features/home/widgets/
```

Expected: No issues (or only info).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/features/home/widgets/
git commit -m "$(cat <<'EOF'
feat(home): add org, group, and members table widgets

EOF
)"
```

---

### Task 4: Rewire `HomeTabPage` layout

**Files:**
- Modify: `frontend/lib/features/home/pages/home_tab_page.dart`

- [ ] **Step 1: Convert page to support scroll targets**

Change `HomeTabPage` from `StatelessWidget` to a thin `StatelessWidget` that builds `_HomeTabBody`, **or** keep Stateless and use `GlobalKey`s owned by a small Stateful child `_HomeScrollBody` that holds:

```dart
final _invitationsKey = GlobalKey();
final _membersKey = GlobalKey();

void _scrollTo(GlobalKey key) {
  final ctx = key.currentContext;
  if (ctx == null) return;
  Scrollable.ensureVisible(
    ctx,
    duration: const Duration(milliseconds: 300),
    curve: Curves.easeOut,
  );
}
```

- [ ] **Step 2: Resolve `currentUserId`**

Inside the ready branch:

```dart
final auth = context.read<AuthBloc>().state;
final currentUserId = auth is AuthAuthenticated ? auth.user.id : null;
```

Import:
- `package:manage_teams/features/auth/bloc/auth_bloc.dart`
- `package:manage_teams/features/auth/bloc/auth_state.dart`
- widget files from Task 3
- `role_label.dart`

- [ ] **Step 3: Replace header + cards + members list**

Header row labels:
- `'Mời thành viên'` (was `'Mời'`)
- `'+ Nhóm mới'` (was `'+ Nhóm'`)
- `'+ Thành viên'` (was `'+ Member'`)

Subtitle:

```dart
Text(
  'Vai trò của bạn: ${roleLabelVi(ws.selectedOrg?.role)}',
  style: const TextStyle(color: ColorSkin.subtitle, fontSize: 13),
)
```

Two-column `LayoutBuilder` (keep breakpoint `> 640`):

```dart
HomeOrgCard(
  org: ws.selectedOrg,
  onCreateOrg: () => _promptCreateOrg(context),
  onAcceptInvite: () => _scrollTo(_invitationsKey),
),
HomeGroupCard(
  group: ws.selectedGroup,
  memberCount: members.length,
  busy: busy,
  onLeave: () => context.read<HomeBloc>().add(const HomeLeaveGroupRequested()),
  onViewMembers: () => _scrollTo(_membersKey),
),
```

Wrap invitations section:

```dart
KeyedSubtree(
  key: _invitationsKey,
  child: _InvitationsSection(...),
)
```

Members heading + table:

```dart
KeyedSubtree(
  key: _membersKey,
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text(
        'Thành viên nhóm',
        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: 8),
      if (loading) ...
      else if (members.isEmpty) ...
      else
        HomeMembersTable(
          members: members,
          groupAdmin: groupAdmin,
          currentUserId: currentUserId,
          onRemove: (userId) => context.read<HomeBloc>().add(
            HomeRemoveMemberRequested(userId),
          ),
        ),
    ],
  ),
)
```

- [ ] **Step 4: Vietnamese prompt hints**

- Create org hint: `'Tên tổ chức'` (not `'Tên org'`)
- Add member hint: `'ID người dùng (UUID)'` (not `'userId (UUID)'`)

- [ ] **Step 5: Remove dead private helpers superseded by widgets**

Delete `_memberInitial` from the page if unused. Keep `_InvitationsSection`, `_InvitationTile`, `_EmptyOrg`, prompt helpers.

Invitation role line can use `roleLabelVi(invitation.role)` for consistency.

- [ ] **Step 6: Analyze + unit tests**

```bash
cd frontend && dart analyze lib/features/home/ && flutter test test/features/home/role_label_test.dart
```

Expected: No analyzer errors; unit tests PASS.

- [ ] **Step 7: Manual smoke (Chrome already running)**

Hot restart `./tool/run_chrome.sh` app and verify checklist from spec §9:
1. Header CTAs Vietnamese + correct admin gating
2. Role labels Vietnamese
3. No delete on own row; delete on other members when group admin
4. Leave group works
5. “Xem thành viên” / “Chấp nhận lời mời” scroll
6. Copy email snackbar
7. Empty org path unchanged

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/features/home/pages/home_tab_page.dart
git commit -m "$(cat <<'EOF'
feat(home): rebuild org/group tab UI with Vietnamese copy

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Screenshot-like header + 2 cards + members table | 3, 4 |
| Vietnamese copy map | 4 |
| Role labels VI | 1, 3, 4 |
| Hide delete for self | 1, 3, 4 |
| Leave group wired | 2, 4 |
| Scroll to members / invitations | 4 |
| No rename / createdAt / role-edit | omitted (non-goals) |
| Keep invitations section | 4 |

## Self-review notes

- No placeholders / TBD left in steps.
- `canShowRemoveMember` / `roleLabelVi` signatures consistent across tasks.
- Leave uses existing repository method; refresh via existing workspace event.
- Theme stays light to match rest of app (spec: layout parity, not dark-mode port).
