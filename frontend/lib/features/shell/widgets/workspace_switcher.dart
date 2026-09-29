import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_event.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';

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

  void _openAtOrgs() {
    setState(() => _step = 'orgs');
    _menu.open();
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
            // Reset to org step next open.
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
                      padding: EdgeInsets.all(12),
                      child: Text(
                        'Chưa có tổ chức — tạo ở tab Home',
                        style: TextStyle(color: ColorSkin.subtitle),
                      ),
                    )
                  else
                    for (final o in state.orgs)
                      MenuItemButton(
                        onPressed: () {
                          context
                              .read<WorkspaceBloc>()
                              .add(WorkspaceOrgSelected(o.id));
                          setState(() => _step = 'groups');
                        },
                        trailingIcon: const Icon(Icons.chevron_right, size: 18),
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
                  const Padding(
                    padding: EdgeInsets.fromLTRB(12, 4, 12, 8),
                    child: Text(
                      'Tạo tổ chức / nhóm ở tab Home',
                      style: TextStyle(fontSize: 11, color: ColorSkin.subtitle),
                    ),
                  ),
                ]
              : [
                  MenuItemButton(
                    onPressed: () => setState(() => _step = 'orgs'),
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
                      padding: EdgeInsets.all(12),
                      child: Text(
                        'Chưa có nhóm — tạo ở tab Home',
                        style: TextStyle(color: ColorSkin.subtitle),
                      ),
                    )
                  else
                    for (final g in state.groups)
                      MenuItemButton(
                        onPressed: () {
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
                ],
          builder: (context, controller, child) {
            return Material(
              color: ColorSkin.tealLight,
              borderRadius: BorderRadius.circular(10),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () {
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
