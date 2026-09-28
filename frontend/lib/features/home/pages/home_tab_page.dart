import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/bloc/home_bloc.dart';
import 'package:manage_teams/features/home/bloc/home_event.dart';
import 'package:manage_teams/features/home/bloc/home_state.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_event.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_section_card.dart';
import 'package:manage_teams/shared/widgets/app_text_field.dart';

class HomeTabPage extends StatelessWidget {
  const HomeTabPage({super.key});

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
                    onPressed: () => context
                        .read<WorkspaceBloc>()
                        .add(const WorkspaceStarted()),
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
                _ => const [],
              };
              final loading = home is HomeLoading;
              final busy = home is HomeReady && home.busy;
              final orgAdmin = ws.selectedOrg?.isAdmin ?? false;
              final groupAdmin = ws.selectedGroup?.isAdmin ?? false;

              return RefreshIndicator(
                onRefresh: () async {
                  context
                      .read<WorkspaceBloc>()
                      .add(const WorkspaceRefreshRequested());
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
                            label: 'Mời',
                            onPressed: busy ? null : () => _promptInvite(context),
                            height: 40,
                          ),
                          const SizedBox(width: 8),
                          AppButton(
                            label: '+ Nhóm',
                            variant: AppButtonVariant.primary,
                            onPressed:
                                busy ? null : () => _promptCreateGroup(context),
                            height: 40,
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Role của bạn: ${ws.selectedOrg?.role ?? '—'}',
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
                          AppSectionCard(
                            title: 'Tổ chức',
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  ws.selectedOrg?.name ?? '—',
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  children: [
                                    TextButton(
                                      onPressed: () => _promptCreateOrg(context),
                                      child: const Text('Tạo org mới'),
                                    ),
                                    TextButton(
                                      onPressed: () => _promptAccept(context),
                                      child: const Text('Chấp nhận lời mời'),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          AppSectionCard(
                            title: 'Nhóm đang chọn',
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  ws.selectedGroup?.name ?? 'Chưa chọn nhóm',
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'myRole: ${ws.selectedGroup?.myRole ?? '—'} · ${members.length} thành viên',
                                  style: const TextStyle(
                                    color: ColorSkin.subtitle,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
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
                    const Text(
                      'Thành viên nhóm',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
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
                        title: 'Danh sách',
                        child: Column(
                          children: [
                            for (var i = 0; i < members.length; i++) ...[
                              if (i > 0) const Divider(height: 1),
                              ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: CircleAvatar(
                                  backgroundColor: i.isEven
                                      ? ColorSkin.tealLight
                                      : ColorSkin.orangeLight,
                                  child: Text(
                                    (members[i].displayName ??
                                            members[i].email)
                                        .characters
                                        .first
                                        .toUpperCase(),
                                  ),
                                ),
                                title: Text(
                                  (members[i].displayName?.isNotEmpty ?? false)
                                      ? members[i].displayName!
                                      : members[i].email,
                                ),
                                subtitle: Text(members[i].email),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: ColorSkin.tealLight,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text(
                                        members[i].role,
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: ColorSkin.primarySub,
                                        ),
                                      ),
                                    ),
                                    if (groupAdmin)
                                      IconButton(
                                        icon: const Icon(
                                          Icons.delete_outline,
                                          color: ColorSkin.error,
                                        ),
                                        onPressed: () => context
                                            .read<HomeBloc>()
                                            .add(
                                              HomeRemoveMemberRequested(
                                                members[i].userId,
                                              ),
                                            ),
                                      ),
                                  ],
                                ),
                              ),
                            ],
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
    final name = await _prompt(context, title: 'Tạo tổ chức', hint: 'Tên org');
    if (name == null || name.trim().isEmpty || !context.mounted) return;
    context.read<HomeBloc>().add(HomeCreateOrgRequested(name));
  }

  Future<void> _promptCreateGroup(BuildContext context) async {
    final name = await _prompt(context, title: 'Tạo nhóm', hint: 'Tên nhóm');
    if (name == null || name.trim().isEmpty || !context.mounted) return;
    context.read<HomeBloc>().add(HomeCreateGroupRequested(name));
  }

  Future<void> _promptInvite(BuildContext context) async {
    final email =
        await _prompt(context, title: 'Mời thành viên', hint: 'email@...');
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
}

class _EmptyOrg extends StatelessWidget {
  const _EmptyOrg({required this.onCreate, required this.onAccept});
  final VoidCallback onCreate;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
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
              'Tạo tổ chức đầu tiên để bắt đầu quản lý nhóm và công việc.',
              textAlign: TextAlign.center,
              style: TextStyle(color: ColorSkin.subtitle),
            ),
            const SizedBox(height: 20),
            AppButton(
              label: 'Tạo tổ chức đầu tiên',
              variant: AppButtonVariant.primary,
              onPressed: onCreate,
            ),
            const SizedBox(height: 12),
            AppButton(label: 'Chấp nhận lời mời', onPressed: onAccept),
          ],
        ),
      ),
    );
  }
}

Future<String?> _prompt(
  BuildContext context, {
  required String title,
  required String hint,
}) async {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: AppTextField(
        label: hint,
        controller: controller,
        hintText: hint,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Hủy'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, controller.text),
          child: const Text('OK'),
        ),
      ],
    ),
  );
}
