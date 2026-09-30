import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_state.dart';
import 'package:manage_teams/features/home/bloc/home_bloc.dart';
import 'package:manage_teams/features/home/bloc/home_event.dart';
import 'package:manage_teams/features/home/bloc/home_state.dart';
import 'package:manage_teams/features/home/widgets/home_group_card.dart';
import 'package:manage_teams/features/home/widgets/home_members_table.dart';
import 'package:manage_teams/features/home/widgets/home_org_card.dart';
import 'package:manage_teams/features/home/widgets/role_label.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_event.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_prompt_dialog.dart';
import 'package:manage_teams/shared/widgets/app_section_card.dart';

class HomeTabPage extends StatefulWidget {
  const HomeTabPage({super.key});

  @override
  State<HomeTabPage> createState() => _HomeTabPageState();
}

class _HomeTabPageState extends State<HomeTabPage> {
  final _membersKey = GlobalKey();

  void _scrollToMembers() {
    final ctx = _membersKey.currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(
      ctx,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<HomeBloc, HomeState>(
      listener: (context, state) {
        if (state is HomeFailure) {
          SimpleSnackbarService.showError(state.message);
        } else if (state is HomeActionSuccess) {
          SimpleSnackbarService.showSuccess(state.message);
        }
      },
      child: BlocBuilder<WorkspaceBloc, WorkspaceState>(
        builder: (context, ws) {
          if (ws is WorkspaceLoading || ws is WorkspaceInitial) {
            return const Center(child: CircularProgressIndicator());
          }
          if (ws is WorkspaceFailure) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(ws.message),
                  const SizedBox(height: 12),
                  AppButton(
                    label: 'Thử lại',
                    variant: AppButtonVariant.primary,
                    onPressed: () => context.read<WorkspaceBloc>().add(
                      const WorkspaceStarted(),
                    ),
                  ),
                ],
              ),
            );
          }
          if (ws is! WorkspaceReady) return const SizedBox.shrink();

          if (ws.orgs.isEmpty) {
            return _EmptyOrg(
              onCreate: () => _promptCreateOrg(context),
              onAccept: () => _promptAccept(context),
            );
          }

          return BlocBuilder<HomeBloc, HomeState>(
            builder: (context, home) {
              final members = switch (home) {
                HomeReady(:final members) => members,
                HomeFailure(:final members) => members,
                HomeActionSuccess(:final members) => members,
                _ => const <GroupMember>[],
              };
              final loading = home is HomeLoading;
              final busy = home is HomeReady && home.busy;
              final orgAdmin = ws.selectedOrg?.isAdmin ?? false;
              final groupAdmin = ws.selectedGroup?.isAdmin ?? false;
              final auth = context.read<AuthBloc>().state;
              final currentUserId =
                  auth is AuthAuthenticated ? auth.user.id : null;

              return RefreshIndicator(
                onRefresh: () async {
                  context.read<WorkspaceBloc>().add(
                    const WorkspaceRefreshRequested(),
                  );
                  context.read<HomeBloc>().add(const HomeStarted());
                },
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Tổ chức & Nhóm',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              color: ColorSkin.title,
                            ),
                          ),
                        ),
                        if (orgAdmin) ...[
                          AppButton(
                            label: 'Mời thành viên',
                            onPressed: busy
                                ? null
                                : () => _promptInvite(context),
                            height: 40,
                          ),
                          const SizedBox(width: 8),
                          AppButton(
                            label: '+ Nhóm mới',
                            variant: AppButtonVariant.primary,
                            onPressed: busy
                                ? null
                                : () => _promptCreateGroup(context),
                            height: 40,
                          ),
                        ],
                        if (groupAdmin) ...[
                          const SizedBox(width: 8),
                          AppButton(
                            label: '+ Thành viên',
                            onPressed: busy
                                ? null
                                : () => _promptAddMember(context),
                            height: 40,
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Vai trò của bạn: ${roleLabelVi(ws.selectedOrg?.role)}',
                      style: const TextStyle(
                        color: ColorSkin.subtitle,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 16),
                    LayoutBuilder(
                      builder: (context, c) {
                        final twoCol = c.maxWidth > 640;
                        final cards = [
                          HomeOrgCard(
                            orgName: ws.selectedOrg?.name ?? '',
                            orgId: ws.selectedOrg?.id ?? '',
                            onCreateOrg: () => _promptCreateOrg(context),
                            onAcceptInvite: () => _promptAccept(context),
                          ),
                          HomeGroupCard(
                            groupName:
                                ws.selectedGroup?.name ?? 'Chưa chọn nhóm',
                            myRole: ws.selectedGroup?.myRole,
                            memberCount: members.length,
                            hasGroup: ws.selectedGroup != null,
                            busy: busy,
                            onLeave: () => context.read<HomeBloc>().add(
                              const HomeLeaveGroupRequested(),
                            ),
                            onViewMembers: _scrollToMembers,
                          ),
                        ];
                        if (twoCol) {
                          return Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(child: cards[0]),
                              const SizedBox(width: 12),
                              Expanded(child: cards[1]),
                            ],
                          );
                        }
                        return Column(
                          children: [
                            cards[0],
                            const SizedBox(height: 12),
                            cards[1],
                          ],
                        );
                      },
                    ),
                    const SizedBox(height: 20),
                    KeyedSubtree(
                      key: _membersKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Thành viên nhóm',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 8),
                          if (loading)
                            const Padding(
                              padding: EdgeInsets.all(24),
                              child: Center(child: CircularProgressIndicator()),
                            )
                          else if (members.isEmpty)
                            const Text(
                              'Chưa có thành viên hoặc chưa chọn nhóm.',
                              style: TextStyle(color: ColorSkin.subtitle),
                            )
                          else
                            AppSectionCard(
                              title: 'Danh sách thành viên',
                              child: HomeMembersTable(
                                members: members,
                                groupAdmin: groupAdmin,
                                currentUserId: currentUserId,
                                onRemove: (userId) =>
                                    context.read<HomeBloc>().add(
                                      HomeRemoveMemberRequested(userId),
                                    ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _promptCreateOrg(BuildContext context) async {
    final name = await _prompt(
      context,
      title: 'Tạo tổ chức',
      hint: 'Tên tổ chức',
    );
    if (name == null || name.trim().isEmpty || !context.mounted) return;
    context.read<HomeBloc>().add(HomeCreateOrgRequested(name));
  }

  Future<void> _promptCreateGroup(BuildContext context) async {
    final name = await _prompt(context, title: 'Tạo nhóm', hint: 'Tên nhóm');
    if (name == null || name.trim().isEmpty || !context.mounted) return;
    context.read<HomeBloc>().add(HomeCreateGroupRequested(name));
  }

  Future<void> _promptInvite(BuildContext context) async {
    final email = await _prompt(
      context,
      title: 'Mời thành viên',
      hint: 'email@...',
    );
    if (email == null || email.trim().isEmpty || !context.mounted) return;
    context.read<HomeBloc>().add(HomeInviteRequested(email));
  }

  Future<void> _promptAccept(BuildContext context) async {
    final token = await _prompt(
      context,
      title: 'Chấp nhận lời mời',
      hint: 'Token từ email',
    );
    if (token == null || token.trim().length < 10 || !context.mounted) return;
    context.read<HomeBloc>().add(HomeAcceptInviteRequested(token));
  }

  Future<void> _promptAddMember(BuildContext context) async {
    final userId = await _prompt(
      context,
      title: 'Thêm thành viên nhóm',
      hint: 'ID người dùng (UUID)',
    );
    if (userId == null || userId.trim().isEmpty || !context.mounted) return;
    context.read<HomeBloc>().add(HomeAddMemberRequested(userId));
  }
}

class _EmptyOrg extends StatelessWidget {
  const _EmptyOrg({required this.onCreate, required this.onAccept});
  final VoidCallback onCreate;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: ColorSkin.tealLight,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(
                  Icons.apartment_rounded,
                  size: 36,
                  color: ColorSkin.primary,
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Chưa có tổ chức',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: ColorSkin.title,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Tạo tổ chức để bắt đầu công việc.',
                textAlign: TextAlign.center,
                style: TextStyle(color: ColorSkin.subtitle, height: 1.4),
              ),
              const SizedBox(height: 24),
              AppButton(
                label: 'Tạo tổ chức',
                variant: AppButtonVariant.primary,
                expand: true,
                onPressed: onCreate,
              ),
              const SizedBox(height: 12),
              AppButton(
                label: 'Chấp nhận lời mời',
                expand: true,
                onPressed: onAccept,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<String?> _prompt(
  BuildContext context, {
  required String title,
  required String hint,
}) {
  return showAppPromptDialog(context, title: title, hint: hint);
}
