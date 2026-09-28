import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_event.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';

class WorkspacePickerBar extends StatelessWidget {
  const WorkspacePickerBar({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<WorkspaceBloc, WorkspaceState>(
      builder: (context, state) {
        if (state is! WorkspaceReady) {
          return const SizedBox.shrink();
        }
        return Row(
          children: [
            Flexible(
              child: _PickerChip(
                label: state.selectedOrg?.name ?? 'Chọn org',
                onTap: () => _pickOrg(context, state),
              ),
            ),
            SizedBox(width: compact ? 6 : 8),
            Flexible(
              child: _PickerChip(
                label: state.selectedGroup?.name ?? 'Chọn nhóm',
                onTap: state.selectedOrgId == null
                    ? null
                    : () => _pickGroup(context, state),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _pickOrg(BuildContext context, WorkspaceReady state) async {
    final id = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => ListView(
        shrinkWrap: true,
        children: [
          const ListTile(
            title: Text(
              'Tổ chức',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          ...state.orgs.map(
            (o) => ListTile(
              title: Text(o.name),
              subtitle: Text(o.role),
              selected: o.id == state.selectedOrgId,
              onTap: () => Navigator.pop(ctx, o.id),
            ),
          ),
        ],
      ),
    );
    if (id != null && context.mounted) {
      context.read<WorkspaceBloc>().add(WorkspaceOrgSelected(id));
    }
  }

  Future<void> _pickGroup(BuildContext context, WorkspaceReady state) async {
    final id = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => ListView(
        shrinkWrap: true,
        children: [
          const ListTile(
            title: Text(
              'Nhóm',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          if (state.groups.isEmpty)
            const ListTile(title: Text('Chưa có nhóm — tạo ở tab Home')),
          ...state.groups.map(
            (g) => ListTile(
              title: Text(g.name),
              subtitle: Text(g.myRole ?? '—'),
              selected: g.id == state.selectedGroupId,
              onTap: () => Navigator.pop(ctx, g.id),
            ),
          ),
        ],
      ),
    );
    if (id != null && context.mounted) {
      context.read<WorkspaceBloc>().add(WorkspaceGroupSelected(id));
    }
  }
}

class _PickerChip extends StatelessWidget {
  const _PickerChip({required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: ColorSkin.tealLight,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: ColorSkin.primarySub,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
              const Icon(Icons.expand_more, size: 18, color: ColorSkin.primarySub),
            ],
          ),
        ),
      ),
    );
  }
}
