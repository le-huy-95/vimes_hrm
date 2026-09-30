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
  const TasksCreateRequested(
    this.title, {
    this.description,
    this.parentCode,
  });
  final String title;
  final String? description;
  final String? parentCode;
  @override
  List<Object?> get props => [title, description, parentCode];
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

class TasksAssignRequested extends TasksEvent {
  const TasksAssignRequested({
    required this.code,
    required this.userId,
  });
  final String code;
  final String userId;
  @override
  List<Object?> get props => [code, userId];
}

class TasksAssignManyRequested extends TasksEvent {
  const TasksAssignManyRequested({
    required this.code,
    required this.userIds,
  });
  final String code;
  final List<String> userIds;
  @override
  List<Object?> get props => [code, userIds];
}

class TasksDueDateRequested extends TasksEvent {
  const TasksDueDateRequested({
    required this.code,
    this.dueDate,
  });
  final String code;
  /// YYYY-MM-DD, or null to clear.
  final String? dueDate;
  @override
  List<Object?> get props => [code, dueDate];
}

class TasksPatchRequested extends TasksEvent {
  const TasksPatchRequested({
    required this.code,
    this.title,
    this.description,
    this.status,
    this.starred,
  });
  final String code;
  final String? title;
  final String? description;
  final String? status;
  final bool? starred;
  @override
  List<Object?> get props => [code, title, description, status, starred];
}

class TasksUnassignRequested extends TasksEvent {
  const TasksUnassignRequested({
    required this.code,
    this.userId,
  });
  final String code;
  /// Null = bỏ gán chính mình.
  final String? userId;
  @override
  List<Object?> get props => [code, userId];
}

class TasksClaimRequested extends TasksEvent {
  const TasksClaimRequested(this.code);
  final String code;
  @override
  List<Object?> get props => [code];
}

class TasksDeleteRequested extends TasksEvent {
  const TasksDeleteRequested(this.code);
  final String code;
  @override
  List<Object?> get props => [code];
}

class TasksFocusRequested extends TasksEvent {
  const TasksFocusRequested(this.taskId);
  final String taskId;
  @override
  List<Object?> get props => [taskId];
}

class TasksFocusCleared extends TasksEvent {
  const TasksFocusCleared();
}
