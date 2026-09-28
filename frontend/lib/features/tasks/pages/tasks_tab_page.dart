import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_text_field.dart';
import 'package:table_calendar/table_calendar.dart';

enum _TasksView { board, list, calendar }

enum _CalMode { day, week, month }

class TasksTabPage extends StatefulWidget {
  const TasksTabPage({super.key});

  @override
  State<TasksTabPage> createState() => _TasksTabPageState();
}

class _TasksTabPageState extends State<TasksTabPage> {
  List<TaskListItem> _tasks = [];
  bool _loading = false;
  _TasksView _view = _TasksView.board;
  _CalMode _calMode = _CalMode.week;
  DateTime _focusedDay = DateTime.now();
  String? _filter; // null = all

  CoreRepository get _core => context.read<CoreRepository>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final ws = context.read<WorkspaceBloc>().state;
    if (ws is! WorkspaceReady || ws.selectedGroupId == null) {
      setState(() => _tasks = []);
      return;
    }
    setState(() => _loading = true);
    try {
      final tasks = await _core.listTasks(ws.selectedGroupId!);
      if (mounted) setState(() => _tasks = tasks);
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    final ws = context.read<WorkspaceBloc>().state;
    if (ws is! WorkspaceReady || ws.selectedGroupId == null) return;
    final controller = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tạo task'),
        content: AppTextField(
          label: 'Tiêu đề',
          controller: controller,
          required: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Tạo')),
        ],
      ),
    );
    if (ok != true || controller.text.trim().isEmpty) return;
    try {
      await _core.createTask(ws.selectedGroupId!, title: controller.text.trim());
      await _load();
      SimpleSnackbarService.showSuccess('Đã tạo task');
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  Future<void> _onDrag(TaskListItem task, String toStatus) async {
    final from = task.status;
    if (from == toStatus) return;
    final ws = context.read<WorkspaceBloc>().state;
    if (ws is! WorkspaceReady || ws.selectedGroupId == null) return;

    final allowed = (from == 'TODO' && toStatus == 'IN_PROGRESS') ||
        (from == 'IN_PROGRESS' && toStatus == 'DONE');
    if (!allowed) {
      SimpleSnackbarService.showError(
        'Chỉ hỗ trợ kéo TODO→IN_PROGRESS (claim) hoặc IN_PROGRESS→DONE (complete).',
      );
      return;
    }

    final idx = _tasks.indexWhere((t) => t.id == task.id);
    if (idx < 0) return;
    final backup = _tasks[idx];
    setState(() {
      _tasks = [..._tasks]..[idx] = task.copyWith(status: toStatus);
    });

    try {
      if (toStatus == 'IN_PROGRESS') {
        await _core.claimTask(ws.selectedGroupId!, task.code);
      } else {
        await _core.completeTask(ws.selectedGroupId!, task.code);
      }
      await _load();
    } catch (e) {
      setState(() {
        _tasks = [..._tasks]..[idx] = backup;
      });
      SimpleSnackbarService.showError(e.toString());
    }
  }

  List<TaskListItem> get _filtered {
    if (_filter == null) return _tasks;
    return _tasks.where((t) => t.status == _filter).toList();
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<WorkspaceBloc, WorkspaceState>(
      listener: (_, __) => _load(),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Công việc',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                ),
                AppButton(
                  label: '+ Tạo task',
                  variant: AppButtonVariant.primary,
                  height: 40,
                  onPressed: _create,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Wrap(
              spacing: 8,
              children: [
                _chip('Board', _view == _TasksView.board, () => setState(() => _view = _TasksView.board)),
                _chip('List', _view == _TasksView.list, () => setState(() => _view = _TasksView.list)),
                _chip('Lịch', _view == _TasksView.calendar, () => setState(() => _view = _TasksView.calendar)),
              ],
            ),
          ),
          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else
            Expanded(
              child: switch (_view) {
                _TasksView.board => _BoardView(tasks: _tasks, onDrop: _onDrag),
                _TasksView.list => _ListView(
                    tasks: _filtered,
                    filter: _filter,
                    onFilter: (f) => setState(() => _filter = f),
                    onClaim: (t) => _onDrag(t, 'IN_PROGRESS'),
                    onComplete: (t) => _onDrag(t, 'DONE'),
                  ),
                _TasksView.calendar => _CalendarView(
                    tasks: _tasks,
                    focusedDay: _focusedDay,
                    mode: _calMode,
                    onFocused: (d) => setState(() => _focusedDay = d),
                    onMode: (m) => setState(() => _calMode = m),
                  ),
              },
            ),
        ],
      ),
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
}

class _BoardView extends StatelessWidget {
  const _BoardView({required this.tasks, required this.onDrop});
  final List<TaskListItem> tasks;
  final Future<void> Function(TaskListItem, String) onDrop;

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
            );
        if (scroll) {
          return SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final status in cols)
                  SizedBox(width: 240, height: c.maxHeight - 24, child: column(status)),
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
  });
  final String status;
  final List<TaskListItem> tasks;
  final Future<void> Function(TaskListItem, String) onDrop;

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
                            child: _TaskCard(task: t),
                          ),
                        ),
                        childWhenDragging: Opacity(
                          opacity: 0.4,
                          child: _TaskCard(task: t),
                        ),
                        child: _TaskCard(task: t),
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
  const _TaskCard({required this.task});
  final TaskListItem task;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
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
            Text(task.title, style: const TextStyle(fontWeight: FontWeight.w600)),
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
  });
  final List<TaskListItem> tasks;
  final String? filter;
  final ValueChanged<String?> onFilter;
  final ValueChanged<TaskListItem> onClaim;
  final ValueChanged<TaskListItem> onComplete;

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
              return ListTile(
                title: Text('${t.code} — ${t.title}'),
                subtitle: Text(t.status),
                trailing: t.status == 'TODO'
                    ? TextButton(onPressed: () => onClaim(t), child: const Text('Claim'))
                    : t.status == 'IN_PROGRESS'
                        ? TextButton(
                            onPressed: () => onComplete(t),
                            child: const Text('Hoàn thành'),
                          )
                        : null,
              );
            },
          ),
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
  final _CalMode mode;
  final ValueChanged<DateTime> onFocused;
  final ValueChanged<_CalMode> onMode;

  List<TaskListItem> _forDay(DateTime day) {
    return tasks.where((t) {
      final local = t.createdAt.toLocal();
      return local.year == day.year &&
          local.month == day.month &&
          local.day == day.day;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final format = switch (mode) {
      _CalMode.day => CalendarFormat.week,
      _CalMode.week => CalendarFormat.week,
      _CalMode.month => CalendarFormat.month,
    };
    return Column(
      children: [
        Wrap(
          spacing: 8,
          children: [
            ChoiceChip(
              label: const Text('Ngày'),
              selected: mode == _CalMode.day,
              onSelected: (_) => onMode(_CalMode.day),
            ),
            ChoiceChip(
              label: const Text('Tuần'),
              selected: mode == _CalMode.week,
              onSelected: (_) => onMode(_CalMode.week),
            ),
            ChoiceChip(
              label: const Text('Tháng'),
              selected: mode == _CalMode.month,
              onSelected: (_) => onMode(_CalMode.month),
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
                  subtitle: Text(
                    'Tạo: ${t.createdAt.toLocal()} · ${t.status}',
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
