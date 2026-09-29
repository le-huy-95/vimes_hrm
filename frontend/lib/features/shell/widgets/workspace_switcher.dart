import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_event.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_prompt_dialog.dart';

/// Header control: org · group with drill-down menu (orgs → groups).
class WorkspaceSwitcher extends StatefulWidget {
  const WorkspaceSwitcher({super.key});

  @override
  State<WorkspaceSwitcher> createState() => _WorkspaceSwitcherState();
}

class _WorkspaceSwitcherState extends State<WorkspaceSwitcher> {
  final MenuController _menu = MenuController();

  /// `orgs` | `groups`
  String _step = 'orgs';
  bool _busy = false;

  void _openAtOrgs() {
    setState(() => _step = 'orgs');
    _menu.open();
  }

  Future<void> _createOrg() async {
    if (_busy) return;
    _menu.close();
    final name = await showAppPromptDialog(
      context,
      title: 'Tạo tổ chức',
      hint: 'Tên org',
      confirmLabel: 'Tạo',
    );
    if (name == null || name.trim().isEmpty || !mounted) return;
    setState(() => _busy = true);
    try {
      final org = await context.read<CoreRepository>().createOrganization(
            name.trim(),
          );
      if (!mounted) return;
      context.read<WorkspaceBloc>().add(WorkspaceOrgCreated(org.id));
      SimpleSnackbarService.showSuccess('Đã tạo tổ chức');
      setState(() => _step = 'groups');
      _menu.open();
    } catch (e) {
      final message = e is ApiException ? e.message : e.toString();
      SimpleSnackbarService.showError(message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _leaveGroup(WorkspaceReady state) async {
    final groupId = state.selectedGroupId;
    if (groupId == null || _busy) return;
    _menu.close();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rời nhóm'),
        content: const Text(
          'Bạn sẽ rời nhóm trong app và cố gắng rời các Google Chat space đã liên kết.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Huỷ'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Rời nhóm'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await context.read<CoreRepository>().leaveGroup(groupId);
      if (!mounted) return;
      context.read<WorkspaceBloc>().add(const WorkspaceRefreshRequested());
      SimpleSnackbarService.showSuccess('Đã rời nhóm');
      final failed = result.chatResults.where((r) => r['ok'] != true).toList();
      if (failed.isNotEmpty) {
        SimpleSnackbarService.showWarning(
          'Một số Google Chat space chưa rời được — kiểm tra trên Google Chat.',
        );
      }
    } catch (e) {
      final message = e is ApiException ? e.message : e.toString();
      SimpleSnackbarService.showError(message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createGroup(WorkspaceReady state) async {
    if (_busy) return;
    final orgId = state.selectedOrgId;
    if (orgId == null) {
      SimpleSnackbarService.showError('Chọn tổ chức trước.');
      return;
    }
    _menu.close();
    final name = await showAppPromptDialog(
      context,
      title: 'Tạo nhóm',
      hint: 'Tên nhóm',
      confirmLabel: 'Tạo',
    );
    if (name == null || name.trim().isEmpty || !mounted) return;
    setState(() => _busy = true);
    try {
      final group = await context.read<CoreRepository>().createGroup(
            orgId,
            name.trim(),
          );
      if (!mounted) return;
      context.read<WorkspaceBloc>().add(WorkspaceGroupCreated(group.id));
      SimpleSnackbarService.showSuccess('Đã tạo nhóm');
    } catch (e) {
      final message = e is ApiException ? e.message : e.toString();
      SimpleSnackbarService.showError(message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<WorkspaceBloc, WorkspaceState>(
      builder: (context, state) {
        if (state is! WorkspaceReady) {
          return const SizedBox.shrink();
        }

        final orgName = state.selectedOrg?.name ?? 'Chọn tổ chức';
        final groupName = state.selectedGroup?.name ?? 'Chọn nhóm';
        final line1 = state.selectedOrgId == null
            ? orgName
            : '$orgName · $groupName';

        return MenuAnchor(
          controller: _menu,
          alignmentOffset: const Offset(0, 4),
          onClose: () {
            if (_step != 'orgs') {
              setState(() => _step = 'orgs');
            }
          },
          style: MenuStyle(
            backgroundColor: const WidgetStatePropertyAll(ColorSkin.white),
            elevation: const WidgetStatePropertyAll(8),
            shape: WidgetStatePropertyAll(
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            padding:
                const WidgetStatePropertyAll(EdgeInsets.symmetric(vertical: 6)),
            maximumSize: const WidgetStatePropertyAll(Size(320, 420)),
          ),
          menuChildren: _step == 'orgs'
              ? [
                  const Padding(
                    padding: EdgeInsets.fromLTRB(12, 8, 12, 4),
                    child: Text(
                      'Chọn tổ chức',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: ColorSkin.subtitle,
                      ),
                    ),
                  ),
                  if (state.orgs.isEmpty)
                    const Padding(
                      padding: EdgeInsets.fromLTRB(12, 4, 12, 4),
                      child: Text(
                        'Chưa có tổ chức',
                        style: TextStyle(color: ColorSkin.subtitle),
                      ),
                    )
                  else
                    for (final o in state.orgs)
                      MenuItemButton(
                        onPressed: _busy
                            ? null
                            : () {
                                context
                                    .read<WorkspaceBloc>()
                                    .add(WorkspaceOrgSelected(o.id));
                                setState(() => _step = 'groups');
                              },
                        trailingIcon:
                            const Icon(Icons.chevron_right, size: 18),
                        child: Text(
                          o.name,
                          style: TextStyle(
                            fontWeight: o.id == state.selectedOrgId
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: ColorSkin.title,
                          ),
                        ),
                      ),
                  MenuItemButton(
                    onPressed: _busy ? null : _createOrg,
                    child: Text(
                      _busy ? 'Đang tạo…' : '+ Tạo tổ chức',
                      style: const TextStyle(
                        color: ColorSkin.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ]
              : [
                  MenuItemButton(
                    onPressed:
                        _busy ? null : () => setState(() => _step = 'orgs'),
                    leadingIcon: const Icon(Icons.arrow_back, size: 18),
                    child: Text(
                      state.selectedOrg?.name ?? 'Tổ chức',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        color: ColorSkin.primary,
                      ),
                    ),
                  ),
                  const Divider(height: 1),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(12, 8, 12, 4),
                    child: Text(
                      'Chọn nhóm',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: ColorSkin.subtitle,
                      ),
                    ),
                  ),
                  if (state.groups.isEmpty)
                    const Padding(
                      padding: EdgeInsets.fromLTRB(12, 4, 12, 4),
                      child: Text(
                        'Chưa có nhóm',
                        style: TextStyle(color: ColorSkin.subtitle),
                      ),
                    )
                  else
                    for (final g in state.groups)
                      MenuItemButton(
                        onPressed: _busy
                            ? null
                            : () {
                                context
                                    .read<WorkspaceBloc>()
                                    .add(WorkspaceGroupSelected(g.id));
                                _menu.close();
                              },
                        trailingIcon: g.id == state.selectedGroupId
                            ? const Icon(
                                Icons.check,
                                size: 18,
                                color: ColorSkin.primary,
                              )
                            : null,
                        child: Text(
                          g.name,
                          style: TextStyle(
                            fontWeight: g.id == state.selectedGroupId
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: ColorSkin.title,
                          ),
                        ),
                      ),
                  MenuItemButton(
                    onPressed: _busy ? null : () => _createGroup(state),
                    child: Text(
                      _busy ? 'Đang tạo…' : '+ Tạo nhóm',
                      style: const TextStyle(
                        color: ColorSkin.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (state.selectedGroupId != null) ...[
                    const Divider(height: 1),
                    MenuItemButton(
                      onPressed: _busy ? null : () => _leaveGroup(state),
                      child: const Text(
                        'Rời nhóm',
                        style: TextStyle(
                          color: ColorSkin.error,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
          builder: (context, controller, child) {
            return Material(
              color: ColorSkin.tealLight,
              borderRadius: BorderRadius.circular(10),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: _busy
                    ? null
                    : () {
                        if (controller.isOpen) {
                          controller.close();
                        } else {
                          _openAtOrgs();
                        }
                      },
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              line1,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: ColorSkin.primarySub,
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                              ),
                            ),
                            const Text(
                              'Tổ chức · Nhóm',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: ColorSkin.primarySub,
                                fontSize: 10,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 4),
                      if (_busy)
                        const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      else
                        const Icon(
                          Icons.expand_more,
                          size: 18,
                          color: ColorSkin.primarySub,
                        ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}
