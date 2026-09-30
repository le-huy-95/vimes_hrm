import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_state.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_bloc.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_event.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_state.dart';
import 'package:manage_teams/features/tasks/task_tree.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_text_field.dart';

Future<void> showTaskDetailDialog(
  BuildContext context,
  TaskListItem task,
) {
  final tasksBloc = context.read<TasksBloc>();
  final workspaceBloc = context.read<WorkspaceBloc>();
  return showDialog<void>(
    context: context,
    builder: (ctx) => MultiBlocProvider(
      providers: [
        BlocProvider.value(value: tasksBloc),
        BlocProvider.value(value: workspaceBloc),
      ],
      child: TaskDetailDialog(taskId: task.id, fallback: task),
    ),
  );
}

class TaskDetailDialog extends StatefulWidget {
  const TaskDetailDialog({
    super.key,
    required this.taskId,
    required this.fallback,
  });

  final String taskId;
  final TaskListItem fallback;

  @override
  State<TaskDetailDialog> createState() => _TaskDetailDialogState();
}

class _TaskDetailDialogState extends State<TaskDetailDialog> {
  late final TextEditingController _title;
  late final TextEditingController _notes;
  late final TextEditingController _newSubtask;
  String? _lastSyncedTitle;
  String? _lastSyncedNotes;

  @override
  void initState() {
    super.initState();
    _title = TextEditingController(text: widget.fallback.title);
    _notes = TextEditingController(text: widget.fallback.description ?? '');
    _newSubtask = TextEditingController();
    _lastSyncedTitle = widget.fallback.title;
    _lastSyncedNotes = widget.fallback.description ?? '';
  }

  @override
  void dispose() {
    _title.dispose();
    _notes.dispose();
    _newSubtask.dispose();
    super.dispose();
  }

  TasksReady? _readyOf(TasksState state) {
    return switch (state) {
      TasksReady() => state,
      TasksFailure(:final previous) => previous,
      TasksActionSuccess(:final ready) => ready,
      _ => null,
    };
  }

  TaskListItem _resolve(TasksState state) {
    final ready = _readyOf(state);
    if (ready == null) return widget.fallback;
    for (final t in ready.tasks) {
      if (t.id == widget.taskId) return t;
    }
    return widget.fallback;
  }

  void _syncControllers(TaskListItem task) {
    final title = task.title;
    final notes = task.description ?? '';
    if (title != _lastSyncedTitle) {
      if (_title.text == _lastSyncedTitle) {
        _title.text = title;
      }
      _lastSyncedTitle = title;
    }
    if (notes != _lastSyncedNotes) {
      if (_notes.text == _lastSyncedNotes) {
        _notes.text = notes;
      }
      _lastSyncedNotes = notes;
    }
  }

  void _saveTitle(TaskListItem task) {
    final next = _title.text.trim();
    if (next.isEmpty || next == task.title) return;
    context.read<TasksBloc>().add(
      TasksPatchRequested(code: task.code, title: next),
    );
  }

  void _saveNotes(TaskListItem task) {
    final next = _notes.text;
    final prev = task.description ?? '';
    if (next == prev) return;
    context.read<TasksBloc>().add(
      TasksPatchRequested(code: task.code, description: next),
    );
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

  Future<void> _confirmDelete(BuildContext context, TaskListItem task) async {
    final hasChildren = (_readyOf(context.read<TasksBloc>().state)?.tasks ?? [])
        .any((t) => t.parentId == task.id);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Xóa công việc?'),
        content: Text(
          hasChildren
              ? 'Task ${task.code} và mọi subtask sẽ bị xóa. Đồng bộ Google Tasks cũng được gỡ.'
              : 'Task ${task.code} sẽ bị xóa. Đồng bộ Google Tasks cũng được gỡ.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Huỷ'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: ColorSkin.error,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    context.read<TasksBloc>().add(TasksDeleteRequested(task.code));
  }

  bool _canDelete(BuildContext context, TaskListItem task) {
    final auth = context.read<AuthBloc>().state;
    final userId = auth is AuthAuthenticated ? auth.user.id : null;
    final ws = context.read<WorkspaceBloc>().state;
    final isAdmin =
        ws is WorkspaceReady && (ws.selectedGroup?.isAdmin ?? false);
    if (isAdmin) return true;
    if (userId == null || task.createdById == null) return false;
    return task.createdById == userId;
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<TasksBloc, TasksState>(
      listenWhen: (prev, curr) =>
          curr is TasksActionSuccess &&
          curr.message == TasksBloc.deleteSuccessMessage,
      listener: (context, state) {
        final success = state as TasksActionSuccess;
        SimpleSnackbarService.showSuccess(success.message);
        final stillPresent =
            success.ready.tasks.any((t) => t.id == widget.taskId);
        if (!stillPresent) {
          Navigator.of(context).pop();
        }
      },
      child: BlocBuilder<TasksBloc, TasksState>(
      builder: (context, state) {
        final task = _resolve(state);
        final busy = _readyOf(state)?.busy == true;
        final canDelete = _canDelete(context, task);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          _syncControllers(task);
        });

        return AlertDialog(
          title: Row(
            children: [
              IconButton(
                tooltip: task.starred ? 'Bỏ gắn sao' : 'Gắn sao',
                onPressed: busy
                    ? null
                    : () {
                        context.read<TasksBloc>().add(
                          TasksPatchRequested(
                            code: task.code,
                            starred: !task.starred,
                          ),
                        );
                      },
                icon: Icon(
                  task.starred ? Icons.star : Icons.star_border,
                  color: task.starred ? Colors.amber.shade700 : null,
                ),
              ),
              Expanded(
                child: Text(
                  task.code,
                  style: const TextStyle(
                    color: ColorSkin.primary,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (busy)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              IconButton(
                tooltip: 'Đóng',
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          content: SizedBox(
            width: 420,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Focus(
                    onFocusChange: (has) {
                      if (!has) _saveTitle(task);
                    },
                    child: AppTextField(
                      controller: _title,
                      label: 'Tiêu đề',
                    ),
                  ),
                  const SizedBox(height: 12),
                  Focus(
                    onFocusChange: (has) {
                      if (!has) _saveNotes(task);
                    },
                    child: AppTextField(
                      controller: _notes,
                      label: 'Ghi chú',
                      maxLines: 4,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Ngày bắt đầu',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  const SizedBox(height: 6),
                  _StartSection(task: task, ymd: _ymd, parseDue: _parseDue),
                  const SizedBox(height: 16),
                  const Text(
                    'Hạn chót',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  const SizedBox(height: 6),
                  _DueSection(task: task, ymd: _ymd, parseDue: _parseDue),
                  const SizedBox(height: 16),
                  const Text(
                    'Trạng thái',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final s in const [
                        ('TODO', 'Todo'),
                        ('IN_PROGRESS', 'Đang làm'),
                        ('DONE', 'Hoàn thành'),
                      ])
                        ChoiceChip(
                          label: Text(s.$2),
                          selected: task.status == s.$1,
                          onSelected: (_) {
                            if (task.status == s.$1) return;
                            context.read<TasksBloc>().add(
                              TasksPatchRequested(code: task.code, status: s.$1),
                            );
                          },
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Người làm',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  const SizedBox(height: 6),
                  _AssigneeSection(task: task),
                  if (task.isRoot) ...[
                    const SizedBox(height: 16),
                    _SubtasksSection(
                      parent: task,
                      allTasks: _readyOf(state)?.tasks ?? const [],
                      newSubtaskController: _newSubtask,
                      canDeleteChild: (child) => _canDelete(context, child),
                      busy: busy,
                    ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            if (canDelete)
              TextButton.icon(
                onPressed: busy ? null : () => _confirmDelete(context, task),
                icon: const Icon(Icons.delete_outline, color: ColorSkin.error),
                label: const Text(
                  'Xóa công việc',
                  style: TextStyle(color: ColorSkin.error),
                ),
              ),
          ],
        );
      },
      ),
    );
  }
}

class _SubtasksSection extends StatelessWidget {
  const _SubtasksSection({
    required this.parent,
    required this.allTasks,
    required this.newSubtaskController,
    required this.canDeleteChild,
    required this.busy,
  });

  final TaskListItem parent;
  final List<TaskListItem> allTasks;
  final TextEditingController newSubtaskController;
  final bool Function(TaskListItem child) canDeleteChild;
  final bool busy;

  void _addSubtask(BuildContext context) {
    final title = newSubtaskController.text.trim();
    if (title.isEmpty) return;
    context.read<TasksBloc>().add(
      TasksCreateRequested(title, parentCode: parent.code),
    );
    newSubtaskController.clear();
  }

  Future<void> _confirmDeleteChild(
    BuildContext context,
    TaskListItem child,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Xóa công việc?'),
        content: Text(
          'Task ${child.code} sẽ bị xóa. Đồng bộ Google Tasks cũng được gỡ.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Huỷ'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: ColorSkin.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    context.read<TasksBloc>().add(TasksDeleteRequested(child.code));
  }

  @override
  Widget build(BuildContext context) {
    final children = allTasks.childrenOf(parent.id);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Subtasks',
          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
        ),
        const SizedBox(height: 6),
        for (final c in children)
          ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            leading: Checkbox(
              value: c.status == 'DONE',
              onChanged: (v) {
                context.read<TasksBloc>().add(
                  TasksPatchRequested(
                    code: c.code,
                    status: v == true ? 'DONE' : 'TODO',
                  ),
                );
              },
            ),
            title: Text(c.title),
            trailing: canDeleteChild(c)
                ? IconButton(
                    tooltip: 'Xóa subtask',
                    icon: const Icon(
                      Icons.delete_outline,
                      color: ColorSkin.error,
                    ),
                    onPressed: busy
                        ? null
                        : () => _confirmDeleteChild(context, c),
                  )
                : null,
            onTap: () {
              Navigator.of(context).pop();
              showTaskDetailDialog(context, c);
            },
          ),
        Row(
          children: [
            Expanded(
              child: TextField(
                decoration: const InputDecoration(
                  hintText: 'Thêm subtask…',
                  isDense: true,
                ),
                controller: newSubtaskController,
                onSubmitted: (_) => _addSubtask(context),
              ),
            ),
            IconButton(
              tooltip: 'Thêm',
              icon: const Icon(Icons.add),
              onPressed: () => _addSubtask(context),
            ),
          ],
        ),
      ],
    );
  }
}

class _StartSection extends StatelessWidget {
  const _StartSection({
    required this.task,
    required this.ymd,
    required this.parseDue,
  });

  final TaskListItem task;
  final String Function(DateTime) ymd;
  final DateTime? Function(String?) parseDue;

  void _set(BuildContext context, String? start) {
    context.read<TasksBloc>().add(
      TasksStartDateRequested(code: task.code, startDate: start),
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
          onPressed: () => _set(context, ymd(today)),
        ),
        ActionChip(
          label: const Text('Ngày mai'),
          onPressed: () => _set(context, ymd(tomorrow)),
        ),
        ActionChip(
          avatar: const Icon(Icons.event, size: 16),
          label: Text(task.startDate ?? 'Chọn ngày'),
          onPressed: () async {
            final initial = parseDue(task.startDate) ?? today;
            final picked = await showDatePicker(
              context: context,
              initialDate: initial,
              firstDate: DateTime(2020),
              lastDate: DateTime(2035),
            );
            if (picked == null || !context.mounted) return;
            _set(context, ymd(picked));
          },
        ),
        if (task.startDate != null)
          ActionChip(
            label: const Text('Xóa'),
            onPressed: () => _set(context, null),
          ),
      ],
    );
  }
}

class _DueSection extends StatelessWidget {
  const _DueSection({
    required this.task,
    required this.ymd,
    required this.parseDue,
  });

  final TaskListItem task;
  final String Function(DateTime) ymd;
  final DateTime? Function(String?) parseDue;

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
          onPressed: () => _set(context, ymd(today)),
        ),
        ActionChip(
          label: const Text('Ngày mai'),
          onPressed: () => _set(context, ymd(tomorrow)),
        ),
        ActionChip(
          avatar: const Icon(Icons.event, size: 16),
          label: Text(task.dueDate ?? 'Chọn ngày'),
          onPressed: () async {
            final initial = parseDue(task.dueDate) ?? today;
            final picked = await showDatePicker(
              context: context,
              initialDate: initial,
              firstDate: DateTime(2020),
              lastDate: DateTime(2035),
            );
            if (picked == null || !context.mounted) return;
            _set(context, ymd(picked));
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

class _AssigneeSection extends StatelessWidget {
  const _AssigneeSection({required this.task});
  final TaskListItem task;

  String _label(TaskAssigneeBrief a) =>
      a.displayName?.trim().isNotEmpty == true ? a.displayName! : a.email;

  @override
  Widget build(BuildContext context) {
    final active = task.assignees.where((a) => a.status != 'REMOVED').toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (active.isEmpty)
          const Text(
            'Chưa gán',
            style: TextStyle(fontSize: 13, color: Colors.black45),
          )
        else
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              for (final a in active)
                InputChip(
                  label: Text(_label(a)),
                  onDeleted: () {
                    context.read<TasksBloc>().add(
                      TasksUnassignRequested(
                        code: task.code,
                        userId: a.userId,
                      ),
                    );
                  },
                ),
            ],
          ),
        const SizedBox(height: 4),
        Wrap(
          spacing: 8,
          children: [
            if (task.allowClaim &&
                (task.status == 'TODO' || task.assignees.isEmpty))
              TextButton(
                onPressed: () => context.read<TasksBloc>().add(
                  TasksClaimRequested(task.code),
                ),
                child: const Text('Claim'),
              ),
            TextButton(
              onPressed: () => _openAssign(context),
              child: const Text('Gán'),
            ),
            if (active.isNotEmpty)
              TextButton(
                onPressed: () => context.read<TasksBloc>().add(
                  TasksUnassignRequested(code: task.code),
                ),
                child: const Text('Bỏ gán tôi'),
              ),
          ],
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
                subtitle: Text(m.email, style: const TextStyle(fontSize: 12)),
                controlAffinity: ListTileControlAffinity.leading,
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
        TextButton(
          onPressed: _selected.isEmpty
              ? null
              : () => Navigator.pop(context, _selected.toList()),
          child: const Text('Gán'),
        ),
      ],
    );
  }
}
