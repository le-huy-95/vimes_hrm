import 'package:equatable/equatable.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_event.dart';

sealed class TasksState extends Equatable {
  const TasksState();
  @override
  List<Object?> get props => [];
}

class TasksInitial extends TasksState {
  const TasksInitial();
}

class TasksLoading extends TasksState {
  const TasksLoading();
}

class TasksReady extends TasksState {
  TasksReady({
    required this.tasks,
    this.view = TasksViewMode.board,
    this.filter,
    this.calendarMode = TasksCalendarMode.week,
    DateTime? focusedDay,
    this.busy = false,
    this.focusTaskId,
  }) : focusedDay = focusedDay ?? DateTime.now();

  final List<TaskListItem> tasks;
  final TasksViewMode view;
  final String? filter;
  final TasksCalendarMode calendarMode;
  final DateTime focusedDay;
  final bool busy;
  final String? focusTaskId;

  List<TaskListItem> get filtered {
    if (filter == null) return tasks;
    return tasks.where((t) => t.status == filter).toList();
  }

  TasksReady copyWith({
    List<TaskListItem>? tasks,
    TasksViewMode? view,
    String? filter,
    bool clearFilter = false,
    TasksCalendarMode? calendarMode,
    DateTime? focusedDay,
    bool? busy,
    String? focusTaskId,
    bool clearFocus = false,
  }) {
    return TasksReady(
      tasks: tasks ?? this.tasks,
      view: view ?? this.view,
      filter: clearFilter ? null : (filter ?? this.filter),
      calendarMode: calendarMode ?? this.calendarMode,
      focusedDay: focusedDay ?? this.focusedDay,
      busy: busy ?? this.busy,
      focusTaskId: clearFocus ? null : (focusTaskId ?? this.focusTaskId),
    );
  }

  @override
  List<Object?> get props =>
      [tasks, view, filter, calendarMode, focusedDay, busy, focusTaskId];
}

class TasksFailure extends TasksState {
  const TasksFailure(this.message, {this.previous});
  final String message;
  final TasksReady? previous;
  @override
  List<Object?> get props => [message, previous];
}

class TasksActionSuccess extends TasksState {
  const TasksActionSuccess(this.message, {required this.ready});
  final String message;
  final TasksReady ready;
  @override
  List<Object?> get props => [message, ready];
}
