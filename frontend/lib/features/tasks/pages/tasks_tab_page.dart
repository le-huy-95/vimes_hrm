import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/sync/bloc/sync_bloc.dart';
import 'package:manage_teams/features/sync/bloc/sync_state.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_bloc.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_event.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_state.dart';
import 'package:manage_teams/features/tasks/board_task_display.dart';
import 'package:manage_teams/features/tasks/task_tree.dart';
import 'package:manage_teams/features/tasks/widgets/task_detail_dialog.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_text_field.dart';
import 'package:table_calendar/table_calendar.dart';

class TasksTabPage extends StatelessWidget {
  const TasksTabPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<TasksBloc, TasksState>(
      listener: (context, state) {
        if (state is TasksFailure) {
          SimpleSnackbarService.showError(state.message);
        } else if (state is TasksActionSuccess) {
          SimpleSnackbarService.showSuccess(state.message);
        } else if (state is TasksReady && state.focusTaskId != null) {
          Future<void>.delayed(const Duration(seconds: 2), () {
            if (!context.mounted) return;
            final current = context.read<TasksBloc>().state;
            if (current is TasksReady &&
                current.focusTaskId == state.focusTaskId) {
              context.read<TasksBloc>().add(const TasksFocusCleared());
            }
          });
        }
      },
      builder: (context, state) {
        final ready = switch (state) {
          TasksReady() => state,
          TasksFailure(:final previous) => previous,
          TasksActionSuccess(:final ready) => ready,
          _ => null,
        };
        final loading = state is TasksLoading || state is TasksInitial;

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Công việc',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  AppButton(
                    label: '+ Tạo task',
                    variant: AppButtonVariant.primary,
                    height: 40,
                    onPressed: () => _create(context),
                  ),
                ],
              ),
            ),
            BlocBuilder<WorkspaceBloc, WorkspaceState>(
              buildWhen: (p, n) {
                final pg = p is WorkspaceReady ? p.selectedGroupId : null;
                final ng = n is WorkspaceReady ? n.selectedGroupId : null;
                return pg != ng;
              },
              builder: (context, ws) {
                final groupId =
                    ws is WorkspaceReady ? ws.selectedGroupId : null;
                if (groupId == null) return const SizedBox.shrink();
                return BlocBuilder<SyncBloc, SyncState>(
                  buildWhen: (p, n) {
                    final pr = switch (p) {
                      SyncReady() => p,
                      SyncFailure(:final previous) => previous,
                      SyncActionSuccess(:final ready) => ready,
                      _ => null,
                    };
                    final nr = switch (n) {
                      SyncReady() => n,
                      SyncFailure(:final previous) => previous,
                      SyncActionSuccess(:final ready) => ready,
                      _ => null,
                    };
                    return pr?.status.unmappedGroupIds !=
                            nr?.status.unmappedGroupIds ||
                        pr?.status.googleLinked != nr?.status.googleLinked;
                  },
                  builder: (context, syncState) {
                    final syncReady = switch (syncState) {
                      SyncReady() => syncState,
                      SyncFailure(:final previous) => previous,
                      SyncActionSuccess(:final ready) => ready,
                      _ => null,
                    };
                    if (syncReady == null || !syncReady.status.googleLinked) {
                      return const SizedBox.shrink();
                    }
                    if (!syncReady.status.unmappedGroupIds.contains(groupId)) {
                      return const SizedBox.shrink();
                    }
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                      child: Material(
                        color: const Color(0xFFFFF3CD),
                        borderRadius: BorderRadius.circular(8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          child: Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Chưa gắn Google Task list cho nhóm này. Sync sẽ không chạy.',
                                  style: TextStyle(fontSize: 13),
                                ),
                              ),
                              TextButton(
                                onPressed: () =>
                                    context.go(AppRoutes.sync.path),
                                child: const Text('Gắn ngay'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: [
                  _ViewTab(
                    label: 'Board',
                    selected: ready?.view == TasksViewMode.board,
                    onTap: () => context.read<TasksBloc>().add(
                      const TasksViewChanged(TasksViewMode.board),
                    ),
                  ),
                  const SizedBox(width: 20),
                  _ViewTab(
                    label: 'List',
                    selected: ready?.view == TasksViewMode.list,
                    onTap: () => context.read<TasksBloc>().add(
                      const TasksViewChanged(TasksViewMode.list),
                    ),
                  ),
                  const SizedBox(width: 20),
                  _ViewTab(
                    label: 'Lịch',
                    selected: ready?.view == TasksViewMode.calendar,
                    onTap: () => context.read<TasksBloc>().add(
                      const TasksViewChanged(TasksViewMode.calendar),
                    ),
                  ),
                ],
              ),
            ),
            if (loading)
              const Expanded(child: Center(child: CircularProgressIndicator()))
            else if (ready == null)
              const Expanded(child: Center(child: Text('Không có dữ liệu')))
            else
              Expanded(
                child: switch (ready.view) {
                  TasksViewMode.board => _BoardView(
                    tasks: ready.tasks,
                    focusTaskId: ready.focusTaskId,
                    onDrop: (task, to) => context.read<TasksBloc>().add(
                      TasksDragRequested(task: task, toStatus: to),
                    ),
                  ),
                  TasksViewMode.list => _ListView(
                    tasks: ready.filtered,
                    filter: ready.filter,
                    focusTaskId: ready.focusTaskId,
                    onFilter: (f) =>
                        context.read<TasksBloc>().add(TasksFilterChanged(f)),
                    onClaim: (t) => context.read<TasksBloc>().add(
                      TasksDragRequested(task: t, toStatus: 'IN_PROGRESS'),
                    ),
                    onComplete: (t) => context.read<TasksBloc>().add(
                      TasksDragRequested(task: t, toStatus: 'DONE'),
                    ),
                  ),
                  TasksViewMode.calendar => _CalendarView(
                    tasks: ready.tasks,
                    focusedDay: ready.focusedDay,
                    mode: ready.calendarMode,
                    onFocused: (d) => context.read<TasksBloc>().add(
                      TasksFocusedDayChanged(d),
                    ),
                    onMode: (m) => context.read<TasksBloc>().add(
                      TasksCalendarModeChanged(m),
                    ),
                  ),
                },
              ),
          ],
        );
      },
    );
  }

  Future<void> _create(BuildContext context) async {
    final result = await showDialog<({String title, String description})>(
      context: context,
      builder: (ctx) => const _CreateTaskDialog(),
    );
    if (result == null || result.title.trim().isEmpty || !context.mounted) {
      return;
    }
    context.read<TasksBloc>().add(
      TasksCreateRequested(
        result.title,
        description: result.description.trim().isEmpty
            ? null
            : result.description.trim(),
      ),
    );
  }
}

class _CreateTaskDialog extends StatefulWidget {
  const _CreateTaskDialog();

  @override
  State<_CreateTaskDialog> createState() => _CreateTaskDialogState();
}

class _CreateTaskDialogState extends State<_CreateTaskDialog> {
  late final TextEditingController _title;
  late final TextEditingController _details;

  @override
  void initState() {
    super.initState();
    _title = TextEditingController();
    _details = TextEditingController();
  }

  @override
  void dispose() {
    _title.dispose();
    _details.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: ColorSkin.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Tạo task',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              AppTextField(
                label: 'Tiêu đề',
                controller: _title,
                hintText: 'Tiêu đề task',
                required: true,
              ),
              const SizedBox(height: 12),
              AppTextField(
                label: 'Chi tiết',
                controller: _details,
                hintText: 'Mô tả / ghi chú (hiện trên Google Tasks)',
                maxLines: 4,
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  AppButton(
                    label: 'Hủy',
                    height: 40,
                    onPressed: () => Navigator.pop(context),
                  ),
                  const SizedBox(width: 8),
                  AppButton(
                    label: 'Tạo',
                    variant: AppButtonVariant.primary,
                    height: 40,
                    onPressed: () {
                      final title = _title.text.trim();
                      if (title.isEmpty) return;
                      Navigator.pop(context, (
                        title: title,
                        description: _details.text,
                      ));
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BoardView extends StatelessWidget {
  const _BoardView({
    required this.tasks,
    required this.onDrop,
    this.focusTaskId,
  });
  final List<TaskListItem> tasks;
  final void Function(TaskListItem, String) onDrop;
  final String? focusTaskId;

  @override
  Widget build(BuildContext context) {
    const cols = ['TODO', 'IN_PROGRESS', 'DONE'];
    final roots = tasks.roots;
    return LayoutBuilder(
      builder: (context, c) {
        final scroll = c.maxWidth < 720;
        Widget column(String status) => _Column(
          status: status,
          tasks: roots.where((t) => t.status == status).toList(),
          allTasks: tasks,
          onDrop: onDrop,
          focusTaskId: focusTaskId,
        );
        if (scroll) {
          return SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final status in cols)
                  SizedBox(
                    width: 240,
                    height: c.maxHeight - 24,
                    child: column(status),
                  ),
              ],
            ),
          );
        }
        return Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final status in cols) Expanded(child: column(status)),
            ],
          ),
        );
      },
    );
  }
}

class _Column extends StatelessWidget {
  const _Column({
    required this.status,
    required this.tasks,
    required this.allTasks,
    required this.onDrop,
    this.focusTaskId,
  });
  final String status;
  final List<TaskListItem> tasks;
  final List<TaskListItem> allTasks;
  final void Function(TaskListItem, String) onDrop;
  final String? focusTaskId;

  Color get _bg {
    return switch (status) {
      'IN_PROGRESS' => ColorSkin.orangeLight,
      'DONE' => ColorSkin.tealLight,
      _ => const Color(0xFFF5F7F7),
    };
  }

  String get _label {
    return switch (status) {
      'IN_PROGRESS' => 'Đang làm',
      'DONE' => 'Hoàn thành',
      _ => 'Todo',
    };
  }

  String get _emptyHint {
    return switch (status) {
      'IN_PROGRESS' => 'Kéo thẻ vào đây để bắt đầu làm việc',
      'DONE' => 'Kéo thẻ vào đây khi công việc hoàn tất',
      _ => 'Kéo thẻ vào đây',
    };
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: _bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '$_label · ${tasks.length}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: ColorSkin.title,
                  ),
                ),
              ),
              const Icon(
                Icons.more_horiz,
                size: 18,
                color: ColorSkin.subtitle,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Expanded(
            child: DragTarget<TaskListItem>(
              onWillAcceptWithDetails: (d) => d.data.status != status,
              onAcceptWithDetails: (d) => onDrop(d.data, status),
              builder: (context, candidate, _) {
                return ColoredBox(
                  // Always painted so empty column space is hit-testable for drops.
                  color: candidate.isNotEmpty
                      ? ColorSkin.primary.withValues(alpha: 0.12)
                      : const Color(0x00000000),
                  child: ListView(
                    children: [
                      if (tasks.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _DashedRRect(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 16,
                            ),
                            child: Column(
                              children: [
                                Icon(
                                  status == 'DONE'
                                      ? Icons.check_circle_outline
                                      : Icons.south,
                                  size: 18,
                                  color: ColorSkin.subtitle,
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  _emptyHint,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: ColorSkin.subtitle,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        ),
                      for (final t in tasks)
                        _DraggableTaskCard(
                          task: t,
                          children: allTasks.childrenOf(t.id),
                          highlighted: t.id == focusTaskId,
                        ),
                      // Keep a droppable floor under the last card / empty column.
                      const SizedBox(height: 120),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Immediate drag (mouse/web). Horizontal affinity so column ListView can still scroll.
class _DraggableTaskCard extends StatelessWidget {
  const _DraggableTaskCard({
    required this.task,
    this.children = const [],
    this.highlighted = false,
  });

  final TaskListItem task;
  final List<TaskListItem> children;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final card = _TaskCard(
      task: task,
      children: children,
      highlighted: highlighted,
    );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Draggable<TaskListItem>(
            data: task,
            affinity: Axis.horizontal,
            maxSimultaneousDrags: 1,
            feedback: Material(
              elevation: 6,
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(width: 220, child: card),
            ),
            childWhenDragging: Opacity(opacity: 0.35, child: card),
            child: MouseRegion(
              cursor: SystemMouseCursors.grab,
              child: card,
            ),
          ),
        ),
        IconButton(
          tooltip: 'Chi tiết',
          visualDensity: VisualDensity.compact,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          icon: const Icon(Icons.edit_outlined, size: 18),
          onPressed: () => showTaskDetailDialog(context, task),
        ),
      ],
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({
    required this.task,
    this.children = const [],
    this.highlighted = false,
  });
  final TaskListItem task;
  final List<TaskListItem> children;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final assignee = task.assignees.isEmpty ? null : task.assignees.first;
    final assigneeName = assignee == null
        ? 'Chưa gán'
        : (assignee.displayName?.trim().isNotEmpty == true
            ? assignee.displayName!.trim()
            : assignee.email);
    final dueLabel = formatBoardDueLabel(task.dueDate);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: ColorSkin.white,
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: highlighted
            ? const BorderSide(color: ColorSkin.primary, width: 2)
            : BorderSide.none,
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: ColorSkin.tealLight,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    task.code,
                    style: const TextStyle(
                      color: ColorSkin.primary,
                      fontWeight: FontWeight.w700,
                      fontSize: 11,
                    ),
                  ),
                ),
                const Spacer(),
                _StatusGlyph(status: task.status),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              task.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 14,
                color: ColorSkin.title,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                CircleAvatar(
                  radius: 10,
                  backgroundColor: assignee == null
                      ? ColorSkin.grey3
                      : ColorSkin.primary,
                  child: Text(
                    assigneeInitials(assigneeName),
                    style: const TextStyle(
                      fontSize: 8,
                      fontWeight: FontWeight.w700,
                      color: ColorSkin.white,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    assigneeName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: ColorSkin.subtitle,
                    ),
                  ),
                ),
                if (dueLabel != null) ...[
                  const SizedBox(width: 8),
                  const Icon(
                    Icons.calendar_today_outlined,
                    size: 12,
                    color: ColorSkin.subtitle,
                  ),
                  const SizedBox(width: 3),
                  Text(
                    dueLabel,
                    style: const TextStyle(
                      fontSize: 11,
                      color: ColorSkin.subtitle,
                    ),
                  ),
                ],
              ],
            ),
            if (children.isNotEmpty) ...[
              const SizedBox(height: 10),
              const Divider(height: 1),
              for (final c in children) _SubtaskMiniRow(task: c),
            ],
          ],
        ),
      ),
    );
  }
}

class _SubtaskMiniRow extends StatelessWidget {
  const _SubtaskMiniRow({required this.task});
  final TaskListItem task;

  @override
  Widget build(BuildContext context) {
    final done = task.status == 'DONE';
    return InkWell(
      onTap: () => showTaskDetailDialog(context, task),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            SizedBox(
              width: 28,
              height: 28,
              child: Checkbox(
                value: done,
                onChanged: (v) {
                  context.read<TasksBloc>().add(
                    TasksPatchRequested(
                      code: task.code,
                      status: v == true ? 'DONE' : 'TODO',
                    ),
                  );
                },
              ),
            ),
            Expanded(
              child: Text(
                task.title,
                style: TextStyle(
                  fontSize: 12,
                  decoration: done ? TextDecoration.lineThrough : null,
                  color: done ? Colors.black45 : Colors.black87,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ListView extends StatelessWidget {
  const _ListView({
    required this.tasks,
    required this.filter,
    required this.onFilter,
    required this.onClaim,
    required this.onComplete,
    this.focusTaskId,
  });
  final List<TaskListItem> tasks;
  final String? filter;
  final ValueChanged<String?> onFilter;
  final ValueChanged<TaskListItem> onClaim;
  final ValueChanged<TaskListItem> onComplete;
  final String? focusTaskId;

  @override
  Widget build(BuildContext context) {
    final rows = filter == null
        ? tasks.nestedForList
        : tasks.where((t) => t.status == filter).toList();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Wrap(
            spacing: 6,
            children: [
              ChoiceChip(
                label: const Text('Tất cả'),
                selected: filter == null,
                onSelected: (_) => onFilter(null),
              ),
              for (final s in ['TODO', 'IN_PROGRESS', 'DONE'])
                ChoiceChip(
                  label: Text(s),
                  selected: filter == s,
                  onSelected: (_) => onFilter(s),
                ),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: rows.length,
            itemBuilder: (context, i) {
              final t = rows[i];
              final isChild = filter == null && !t.isRoot;
              final focused = t.id == focusTaskId;
              return Card(
                margin: EdgeInsets.only(
                  bottom: 8,
                  left: isChild ? 20 : 0,
                ),
                color: focused ? ColorSkin.tealLight : null,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                  side: focused
                      ? const BorderSide(color: ColorSkin.primary, width: 2)
                      : BorderSide.none,
                ),
                child: InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () => showTaskDetailDialog(context, t),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            IconButton(
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(
                                minWidth: 32,
                                minHeight: 32,
                              ),
                              tooltip: t.starred ? 'Bỏ gắn sao' : 'Gắn sao',
                              onPressed: () {
                                context.read<TasksBloc>().add(
                                  TasksPatchRequested(
                                    code: t.code,
                                    starred: !t.starred,
                                  ),
                                );
                              },
                              icon: Icon(
                                t.starred ? Icons.star : Icons.star_border,
                                size: 20,
                                color: t.starred
                                    ? Colors.amber.shade700
                                    : Colors.black38,
                              ),
                            ),
                            if (isChild)
                              Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: Checkbox(
                                  value: t.status == 'DONE',
                                  onChanged: (v) {
                                    context.read<TasksBloc>().add(
                                      TasksPatchRequested(
                                        code: t.code,
                                        status: v == true ? 'DONE' : 'TODO',
                                      ),
                                    );
                                  },
                                ),
                              ),
                            Expanded(
                              child: Text(
                                isChild
                                    ? t.title
                                    : '${t.code} — ${t.title}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            Text(
                              t.status,
                              style: const TextStyle(
                                fontSize: 11,
                                color: Colors.black54,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        _DueChips(task: t),
                        const SizedBox(height: 6),
                        _AssigneeRow(task: t, onClaim: onClaim),
                        if (t.status == 'IN_PROGRESS')
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: () => onComplete(t),
                              child: const Text('Hoàn thành'),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime? _parseDue(String? due) {
  if (due == null || due.length < 10) return null;
  try {
    return DateTime.parse(due.substring(0, 10));
  } catch (_) {
    return null;
  }
}

class _DueChips extends StatelessWidget {
  const _DueChips({required this.task});
  final TaskListItem task;

  void _set(BuildContext context, String? due) {
    context.read<TasksBloc>().add(
      TasksDueDateRequested(code: task.code, dueDate: due),
    );
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final tomorrow = today.add(const Duration(days: 1));
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: [
        ActionChip(
          label: const Text('Hôm nay'),
          onPressed: () => _set(context, _ymd(today)),
        ),
        ActionChip(
          label: const Text('Ngày mai'),
          onPressed: () => _set(context, _ymd(tomorrow)),
        ),
        ActionChip(
          avatar: const Icon(Icons.event, size: 16),
          label: Text(task.dueDate ?? 'Chọn ngày'),
          onPressed: () async {
            final initial = _parseDue(task.dueDate) ?? today;
            final picked = await showDatePicker(
              context: context,
              initialDate: initial,
              firstDate: DateTime(2020),
              lastDate: DateTime(2035),
            );
            if (picked == null || !context.mounted) return;
            _set(context, _ymd(picked));
          },
        ),
        if (task.dueDate != null)
          ActionChip(
            label: const Text('Xóa hạn'),
            onPressed: () => _set(context, null),
          ),
      ],
    );
  }
}

class _AssigneeRow extends StatelessWidget {
  const _AssigneeRow({required this.task, required this.onClaim});
  final TaskListItem task;
  final ValueChanged<TaskListItem> onClaim;

  @override
  Widget build(BuildContext context) {
    final names = task.assignees
        .map((a) => a.displayName?.trim().isNotEmpty == true
            ? a.displayName!
            : a.email)
        .toList();
    return Row(
      children: [
        Expanded(
          child: Text(
            names.isEmpty ? 'Chưa gán' : names.join(', '),
            style: TextStyle(
              fontSize: 12,
              color: names.isEmpty ? Colors.black45 : Colors.black87,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (task.allowClaim &&
            (task.status == 'TODO' || task.assignees.isEmpty))
          TextButton(
            onPressed: () => onClaim(task),
            child: const Text('Claim'),
          ),
        TextButton(
          onPressed: () => _openAssign(context),
          child: const Text('Gán'),
        ),
      ],
    );
  }

  Future<void> _openAssign(BuildContext context) async {
    final bloc = context.read<TasksBloc>();
    final core = context.read<CoreRepository>();
    final ws = context.read<WorkspaceBloc>().state;
    final groupId = ws is WorkspaceReady ? ws.selectedGroupId : null;
    if (groupId == null) {
      SimpleSnackbarService.showError('Chưa chọn nhóm');
      return;
    }
    late final GroupDetail detail;
    try {
      detail = await core.getGroup(groupId);
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
      return;
    }
    if (!context.mounted) return;
    final assigned = task.assignees.map((a) => a.userId).toSet();
    final candidates =
        detail.members.where((m) => !assigned.contains(m.userId)).toList();
    if (candidates.isEmpty) {
      SimpleSnackbarService.showError('Không còn thành viên để gán');
      return;
    }
    final selected = await showDialog<List<String>>(
      context: context,
      builder: (ctx) => _AssignMembersDialog(members: candidates),
    );
    if (selected == null || selected.isEmpty || !context.mounted) return;
    bloc.add(TasksAssignManyRequested(code: task.code, userIds: selected));
  }
}

class _AssignMembersDialog extends StatefulWidget {
  const _AssignMembersDialog({required this.members});
  final List<GroupMember> members;

  @override
  State<_AssignMembersDialog> createState() => _AssignMembersDialogState();
}

class _AssignMembersDialogState extends State<_AssignMembersDialog> {
  final _selected = <String>{};

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Gán người làm'),
      content: SizedBox(
        width: 360,
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final m in widget.members)
              CheckboxListTile(
                value: _selected.contains(m.userId),
                onChanged: (v) {
                  setState(() {
                    if (v == true) {
                      _selected.add(m.userId);
                    } else {
                      _selected.remove(m.userId);
                    }
                  });
                },
                title: Text(
                  m.displayName?.trim().isNotEmpty == true
                      ? m.displayName!
                      : m.email,
                ),
                subtitle: Text(m.email),
                dense: true,
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Hủy'),
        ),
        FilledButton(
          onPressed: _selected.isEmpty
              ? null
              : () => Navigator.pop(context, _selected.toList()),
          child: const Text('Gán'),
        ),
      ],
    );
  }
}

class _CalendarView extends StatelessWidget {
  const _CalendarView({
    required this.tasks,
    required this.focusedDay,
    required this.mode,
    required this.onFocused,
    required this.onMode,
  });
  final List<TaskListItem> tasks;
  final DateTime focusedDay;
  final TasksCalendarMode mode;
  final ValueChanged<DateTime> onFocused;
  final ValueChanged<TasksCalendarMode> onMode;

  List<TaskListItem> _forDay(DateTime day) {
    return tasks.where((t) {
      final due = _parseDue(t.dueDate);
      if (due == null) return false;
      return due.year == day.year &&
          due.month == day.month &&
          due.day == day.day;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final format = switch (mode) {
      TasksCalendarMode.day => CalendarFormat.week,
      TasksCalendarMode.week => CalendarFormat.week,
      TasksCalendarMode.month => CalendarFormat.month,
    };
    return Column(
      children: [
        Wrap(
          spacing: 8,
          children: [
            ChoiceChip(
              label: const Text('Ngày'),
              selected: mode == TasksCalendarMode.day,
              onSelected: (_) => onMode(TasksCalendarMode.day),
            ),
            ChoiceChip(
              label: const Text('Tuần'),
              selected: mode == TasksCalendarMode.week,
              onSelected: (_) => onMode(TasksCalendarMode.week),
            ),
            ChoiceChip(
              label: const Text('Tháng'),
              selected: mode == TasksCalendarMode.month,
              onSelected: (_) => onMode(TasksCalendarMode.month),
            ),
          ],
        ),
        TableCalendar<TaskListItem>(
          firstDay: DateTime.utc(2020),
          lastDay: DateTime.utc(2035),
          focusedDay: focusedDay,
          calendarFormat: format,
          eventLoader: _forDay,
          onDaySelected: (selected, focused) => onFocused(focused),
          onPageChanged: onFocused,
          calendarStyle: const CalendarStyle(
            markerDecoration: BoxDecoration(
              color: ColorSkin.primary,
              shape: BoxShape.circle,
            ),
          ),
        ),
        Expanded(
          child: ListView(
            children: [
              for (final t in _forDay(focusedDay))
                ListTile(
                  title: Text('${t.code} — ${t.title}'),
                  subtitle: Text('Hạn: ${t.dueDate} · ${t.status}'),
                  onTap: () => showTaskDetailDialog(context, t),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ViewTab extends StatelessWidget {
  const _ViewTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Container(
        padding: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: selected ? ColorSkin.primary : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            color: selected ? ColorSkin.primary : ColorSkin.subtitle,
          ),
        ),
      ),
    );
  }
}

class _StatusGlyph extends StatelessWidget {
  const _StatusGlyph({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    return switch (status) {
      'DONE' => const Icon(
          Icons.check_circle,
          size: 18,
          color: ColorSkin.primary,
        ),
      'IN_PROGRESS' => Container(
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: ColorSkin.secondary1, width: 2),
          ),
        ),
      _ => Container(
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: ColorSkin.subtitle, width: 2),
          ),
        ),
    };
  }
}

class _DashedRRect extends StatelessWidget {
  const _DashedRRect({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedRRectPainter(
        color: ColorSkin.border1,
        radius: 10,
      ),
      child: child,
    );
  }
}

class _DashedRRectPainter extends CustomPainter {
  _DashedRRectPainter({required this.color, required this.radius});
  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final r = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(radius),
    );
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final path = Path()..addRRect(r);
    for (final metric in path.computeMetrics()) {
      var dist = 0.0;
      const dash = 5.0;
      const gap = 4.0;
      while (dist < metric.length) {
        final next = (dist + dash).clamp(0, metric.length);
        canvas.drawPath(metric.extractPath(dist, next.toDouble()), paint);
        dist += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedRRectPainter old) =>
      old.color != color || old.radius != radius;
}
