import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_event.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_section_card.dart';
import 'package:manage_teams/shared/widgets/app_text_field.dart';

class HomeTabPage extends StatefulWidget {
  const HomeTabPage({super.key});

  @override
  State<HomeTabPage> createState() => _HomeTabPageState();
}

class _HomeTabPageState extends State<HomeTabPage> {
  List<Map<String, dynamic>> _members = [];
  bool _loadingDetail = false;

  CoreRepository get _core => context.read<CoreRepository>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadMembers());
  }

  Future<void> _loadMembers() async {
    final ws = context.read<WorkspaceBloc>().state;
    if (ws is! WorkspaceReady || ws.selectedGroupId == null) {
      setState(() => _members = []);
      return;
    }
    setState(() => _loadingDetail = true);
    try {
      final detail = await _core.getGroup(ws.selectedGroupId!);
      if (mounted) {
        setState(() {
          _members = detail.members
              .map(
                (m) => {
                  'userId': m.userId,
                  'role': m.role,
                  'email': m.email,
                  'displayName': m.displayName,
                },
              )
              .toList();
        });
      }
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    } finally {
      if (mounted) setState(() => _loadingDetail = false);
    }
  }

  Future<void> _createOrg() async {
    final name = await _prompt(context, title: 'Tạo tổ chức', hint: 'Tên org');
    if (name == null || name.trim().isEmpty) return;
    try {
      final org = await _core.createOrganization(name.trim());
      if (!mounted) return;
      context.read<WorkspaceBloc>().add(WorkspaceOrgCreated(org.id));
      SimpleSnackbarService.showSuccess('Đã tạo tổ chức');
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  Future<void> _createGroup() async {
    final ws = context.read<WorkspaceBloc>().state;
    if (ws is! WorkspaceReady || ws.selectedOrgId == null) return;
    final name = await _prompt(context, title: 'Tạo nhóm', hint: 'Tên nhóm');
    if (name == null || name.trim().isEmpty) return;
    try {
      final g = await _core.createGroup(ws.selectedOrgId!, name.trim());
      if (!mounted) return;
      context.read<WorkspaceBloc>().add(WorkspaceGroupCreated(g.id));
      SimpleSnackbarService.showSuccess('Đã tạo nhóm');
      await _loadMembers();
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  Future<void> _invite() async {
    final ws = context.read<WorkspaceBloc>().state;
    if (ws is! WorkspaceReady || ws.selectedOrgId == null) return;
    final email = await _prompt(context, title: 'Mời thành viên', hint: 'email@...');
    if (email == null || email.trim().isEmpty) return;
    try {
      await _core.inviteToOrganization(ws.selectedOrgId!, email: email.trim());
      SimpleSnackbarService.showSuccess('Đã gửi lời mời');
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  Future<void> _acceptInvite() async {
    final token = await _prompt(
      context,
      title: 'Chấp nhận lời mời',
      hint: 'Token từ email',
    );
    if (token == null || token.trim().length < 10) return;
    try {
      await _core.acceptOrgInvitation(token.trim());
      if (!mounted) return;
      context.read<WorkspaceBloc>().add(const WorkspaceRefreshRequested());
      SimpleSnackbarService.showSuccess('Đã tham gia tổ chức');
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  Future<void> _removeMember(String userId) async {
    final ws = context.read<WorkspaceBloc>().state;
    if (ws is! WorkspaceReady || ws.selectedGroupId == null) return;
    try {
      await _core.removeGroupMember(ws.selectedGroupId!, userId);
      await _loadMembers();
      SimpleSnackbarService.showSuccess('Đã xóa thành viên');
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<WorkspaceBloc, WorkspaceState>(
      listener: (context, state) {
        if (state is WorkspaceReady) _loadMembers();
        if (state is WorkspaceFailure) {
          SimpleSnackbarService.showError(state.message);
        }
      },
      builder: (context, state) {
        if (state is WorkspaceLoading || state is WorkspaceInitial) {
          return const Center(child: CircularProgressIndicator());
        }
        if (state is WorkspaceFailure) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(state.message),
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
        if (state is! WorkspaceReady) return const SizedBox.shrink();

        if (state.orgs.isEmpty) {
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
                    onPressed: _createOrg,
                  ),
                  const SizedBox(height: 12),
                  AppButton(
                    label: 'Chấp nhận lời mời',
                    onPressed: _acceptInvite,
                  ),
                ],
              ),
            ),
          );
        }

        final orgAdmin = state.selectedOrg?.isAdmin ?? false;
        final groupAdmin = state.selectedGroup?.isAdmin ?? false;

        return RefreshIndicator(
          onRefresh: () async {
            context
                .read<WorkspaceBloc>()
                .add(const WorkspaceRefreshRequested());
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
                      onPressed: _invite,
                      height: 40,
                    ),
                    const SizedBox(width: 8),
                    AppButton(
                      label: '+ Nhóm',
                      variant: AppButtonVariant.primary,
                      onPressed: _createGroup,
                      height: 40,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Role của bạn: ${state.selectedOrg?.role ?? '—'}',
                style: const TextStyle(color: ColorSkin.subtitle, fontSize: 13),
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
                            state.selectedOrg?.name ?? '—',
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
                                onPressed: _createOrg,
                                child: const Text('Tạo org mới'),
                              ),
                              TextButton(
                                onPressed: _acceptInvite,
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
                            state.selectedGroup?.name ?? 'Chưa chọn nhóm',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'myRole: ${state.selectedGroup?.myRole ?? '—'} · ${_members.length} thành viên',
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
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              if (_loadingDetail)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_members.isEmpty)
                const Text(
                  'Chưa có thành viên hoặc chưa chọn nhóm.',
                  style: TextStyle(color: ColorSkin.subtitle),
                )
              else
                AppSectionCard(
                  title: 'Danh sách',
                  child: Column(
                    children: [
                      for (var i = 0; i < _members.length; i++) ...[
                        if (i > 0) const Divider(height: 1),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: CircleAvatar(
                            backgroundColor: i.isEven
                                ? ColorSkin.tealLight
                                : ColorSkin.orangeLight,
                            child: Text(
                              (_members[i]['displayName'] as String? ??
                                      _members[i]['email'] as String? ??
                                      '?')
                                  .characters
                                  .first
                                  .toUpperCase(),
                            ),
                          ),
                          title: Text(
                            (_members[i]['displayName'] as String?)?.isNotEmpty ==
                                    true
                                ? _members[i]['displayName'] as String
                                : _members[i]['email'] as String? ?? '',
                          ),
                          subtitle: Text(_members[i]['email']?.toString() ?? ''),
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
                                  _members[i]['role']?.toString() ?? '',
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
                                  onPressed: () => _removeMember(
                                    _members[i]['userId'] as String,
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
