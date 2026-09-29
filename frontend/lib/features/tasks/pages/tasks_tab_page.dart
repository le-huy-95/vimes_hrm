import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_bloc.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_event.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_prompt_dialog.dart';
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
    final title = await showAppPromptDialog(
      context,
      title: 'Tạo task',
      hint: 'Tiêu đề task',
      label: 'Tiêu đề',
      confirmLabel: 'Tạo',
    );
    if (title == null || title.trim().isEmpty || !context.mounted) return;
    context.read<TasksBloc>().add(TasksCreateRequested(title));
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
              return ListTile(
                selected: focused,
                selectedTileColor: ColorSkin.tealLight,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                  side: focused
                      ? const BorderSide(color: ColorSkin.primary, width: 2)
                      : BorderSide.none,
                ),
                title: Text('${t.code} — ${t.title}'),
                subtitle: Text(t.status),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: 'Assign userId',
                      icon: const Icon(Icons.person_add_alt),
                      onPressed: () async {
                        final userId = await showAppPromptDialog(
                          context,
                          title: 'Assign',
                          hint: 'userId UUID',
                          label: 'User ID',
                        );
                        if (userId == null ||
                            userId.trim().isEmpty ||
                            !context.mounted) {
                          return;
                        }
                        context.read<TasksBloc>().add(
                          TasksAssignRequested(
                            code: t.code,
                            userId: userId.trim(),
                          ),
                        );
                      },
                    ),
                    if (t.status == 'TODO')
                      TextButton(
                        onPressed: () => onClaim(t),
                        child: const Text('Claim'),
                      )
                    else if (t.status == 'IN_PROGRESS')
                      TextButton(
                        onPressed: () => onComplete(t),
                        child: const Text('Hoàn thành'),
                      ),
                  ],
                ),
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
  final TasksCalendarMode mode;
  final ValueChanged<DateTime> onFocused;
  final ValueChanged<TasksCalendarMode> onMode;

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
                  subtitle: Text('Tạo: ${t.createdAt.toLocal()} · ${t.status}'),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
