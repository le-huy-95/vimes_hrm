import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_bloc.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_event.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_state.dart';
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
            Padding(
              padding: const EdgeInsets.all(12),
              child: Wrap(
                spacing: 8,
                children: [
                  _chip(
                    'Board',
                    ready?.view == TasksViewMode.board,
                    () => context.read<TasksBloc>().add(
                      const TasksViewChanged(TasksViewMode.board),
                    ),
                  ),
                  _chip(
                    'List',
                    ready?.view == TasksViewMode.list,
                    () => context.read<TasksBloc>().add(
                      const TasksViewChanged(TasksViewMode.list),
                    ),
                  ),
                  _chip(
                    'Lịch',
                    ready?.view == TasksViewMode.calendar,
                    () => context.read<TasksBloc>().add(
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

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: ColorSkin.primary,
      labelStyle: TextStyle(
        color: selected ? Colors.white : ColorSkin.title,
        fontWeight: FontWeight.w600,
      ),
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
    return LayoutBuilder(
      builder: (context, c) {
        final scroll = c.maxWidth < 720;
        Widget column(String status) => _Column(
          status: status,
          tasks: tasks.where((t) => t.status == status).toList(),
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
    required this.onDrop,
    this.focusTaskId,
  });
  final String status;
  final List<TaskListItem> tasks;
  final void Function(TaskListItem, String) onDrop;
  final String? focusTaskId;

  Color get _bg {
    return switch (status) {
      'IN_PROGRESS' => ColorSkin.orangeLight,
      'DONE' => ColorSkin.tealLight,
      _ => const Color(0xFFF5F7F7),
    };
  }

  @override
  Widget build(BuildContext context) {
    return DragTarget<TaskListItem>(
      onWillAcceptWithDetails: (_) => true,
      onAcceptWithDetails: (d) => onDrop(d.data, status),
      builder: (context, candidate, _) {
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: candidate.isNotEmpty
                ? ColorSkin.primary.withValues(alpha: 0.12)
                : _bg,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '$status · ${tasks.length}',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: ListView(
                  children: [
                    for (final t in tasks)
                      LongPressDraggable<TaskListItem>(
                        data: t,
                        feedback: Material(
                          elevation: 4,
                          borderRadius: BorderRadius.circular(10),
                          child: SizedBox(
                            width: 220,
                            child: _TaskCard(
                              task: t,
                              highlighted: t.id == focusTaskId,
                            ),
                          ),
                        ),
                        childWhenDragging: Opacity(
                          opacity: 0.4,
                          child: _TaskCard(
                            task: t,
                            highlighted: t.id == focusTaskId,
                          ),
                        ),
                        child: _TaskCard(
                          task: t,
                          highlighted: t.id == focusTaskId,
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
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({required this.task, this.highlighted = false});
  final TaskListItem task;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: highlighted
            ? const BorderSide(color: ColorSkin.primary, width: 2)
            : BorderSide.none,
      ),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              task.code,
              style: const TextStyle(
                color: ColorSkin.primary,
                fontWeight: FontWeight.w700,
                fontSize: 11,
              ),
            ),
            Text(
              task.title,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            if (task.dueDate != null) ...[
              const SizedBox(height: 4),
              Text(
                'Hạn: ${task.dueDate}',
                style: const TextStyle(fontSize: 11, color: ColorSkin.title),
              ),
            ],
            if (task.assignees.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                task.assignees
                    .map((a) => a.displayName ?? a.email)
                    .join(', '),
                style: const TextStyle(fontSize: 11, color: Colors.black54),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
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
            itemCount: tasks.length,
            itemBuilder: (context, i) {
              final t = tasks[i];
              final focused = t.id == focusTaskId;
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                color: focused ? ColorSkin.tealLight : null,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                  side: focused
                      ? const BorderSide(color: ColorSkin.primary, width: 2)
                      : BorderSide.none,
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${t.code} — ${t.title}',
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
      SimpleSnackbarService.showError('Không còn member để gán');
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
                ),
            ],
          ),
        ),
      ],
    );
  }
}
