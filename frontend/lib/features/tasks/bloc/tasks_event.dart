import 'package:equatable/equatable.dart';
import 'package:manage_teams/core/models/api_models.dart';

enum TasksViewMode { board, list, calendar }

enum TasksCalendarMode { day, week, month }

sealed class TasksEvent extends Equatable {
  const TasksEvent();
  @override
  List<Object?> get props => [];
}

class TasksStarted extends TasksEvent {
  const TasksStarted();
}

class TasksGroupChanged extends TasksEvent {
  const TasksGroupChanged(this.groupId);
  final String? groupId;
  @override
  List<Object?> get props => [groupId];
}

class TasksRefreshRequested extends TasksEvent {
  const TasksRefreshRequested();
}

class TasksViewChanged extends TasksEvent {
  const TasksViewChanged(this.mode);
  final TasksViewMode mode;
  @override
  List<Object?> get props => [mode];
}

class TasksFilterChanged extends TasksEvent {
  const TasksFilterChanged(this.status);
  final String? status;
  @override
  List<Object?> get props => [status];
}

class TasksCalendarModeChanged extends TasksEvent {
  const TasksCalendarModeChanged(this.mode);
  final TasksCalendarMode mode;
  @override
  List<Object?> get props => [mode];
}

class TasksFocusedDayChanged extends TasksEvent {
  const TasksFocusedDayChanged(this.day);
  final DateTime day;
  @override
  List<Object?> get props => [day];
}

class TasksCreateRequested extends TasksEvent {
  const TasksCreateRequested(this.title);
  final String title;
  @override
  List<Object?> get props => [title];
}

class TasksDragRequested extends TasksEvent {
  const TasksDragRequested({
    required this.task,
    required this.toStatus,
  });
  final TaskListItem task;
  final String toStatus;
  @override
  List<Object?> get props => [task.id, toStatus];
}
