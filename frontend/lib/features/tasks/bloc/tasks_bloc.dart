import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_event.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_state.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';

class TasksBloc extends Bloc<TasksEvent, TasksState> {
  TasksBloc(this._core, this._workspace) : super(const TasksInitial()) {
    on<TasksStarted>(_onStarted);
    on<TasksGroupChanged>(_onGroupChanged);
    on<TasksRefreshRequested>(_onRefresh);
    on<TasksViewChanged>(_onViewChanged);
    on<TasksFilterChanged>(_onFilterChanged);
    on<TasksCalendarModeChanged>(_onCalMode);
    on<TasksFocusedDayChanged>(_onFocusedDay);
    on<TasksCreateRequested>(_onCreate);
    on<TasksDragRequested>(_onDrag);
    on<TasksAssignRequested>(_onAssign);
    on<TasksFocusRequested>(_onFocus);
    on<TasksFocusCleared>(_onFocusCleared);

    _wsSub = _workspace.stream.listen((ws) {
      if (ws is WorkspaceReady) {
        add(TasksGroupChanged(ws.selectedGroupId));
      }
    });
  }

  final CoreRepository _core;
  final WorkspaceBloc _workspace;
  late final StreamSubscription<WorkspaceState> _wsSub;
  String? _groupId;

  TasksReady? get _ready {
    final s = state;
    if (s is TasksReady) return s;
    if (s is TasksFailure) return s.previous;
    if (s is TasksActionSuccess) return s.ready;
    return null;
  }

  Future<void> _onStarted(TasksStarted event, Emitter<TasksState> emit) async {
    final ws = _workspace.state;
    add(TasksGroupChanged(ws is WorkspaceReady ? ws.selectedGroupId : null));
  }

  Future<void> _onGroupChanged(
    TasksGroupChanged event,
    Emitter<TasksState> emit,
  ) async {
    _groupId = event.groupId;
    final prev = _ready;
    if (event.groupId == null) {
      emit(TasksReady(tasks: const [], view: prev?.view ?? TasksViewMode.board));
      return;
    }
    emit(const TasksLoading());
    try {
      final tasks = await _core.listTasks(event.groupId!);
      emit(
        TasksReady(
          tasks: tasks,
          view: prev?.view ?? TasksViewMode.board,
          filter: prev?.filter,
          calendarMode: prev?.calendarMode ?? TasksCalendarMode.week,
          focusedDay: prev?.focusedDay,
        ),
      );
    } catch (e) {
      emit(TasksFailure(_msg(e), previous: prev));
    }
  }

  Future<void> _onRefresh(
    TasksRefreshRequested event,
    Emitter<TasksState> emit,
  ) async {
    add(TasksGroupChanged(_groupId));
  }

  Future<void> _onViewChanged(
    TasksViewChanged event,
    Emitter<TasksState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    emit(prev.copyWith(view: event.mode));
  }

  Future<void> _onFilterChanged(
    TasksFilterChanged event,
    Emitter<TasksState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    emit(
      prev.copyWith(
        filter: event.status,
        clearFilter: event.status == null,
      ),
    );
  }

  Future<void> _onCalMode(
    TasksCalendarModeChanged event,
    Emitter<TasksState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    emit(prev.copyWith(calendarMode: event.mode));
  }

  Future<void> _onFocusedDay(
    TasksFocusedDayChanged event,
    Emitter<TasksState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    emit(prev.copyWith(focusedDay: event.day));
  }

  Future<void> _onCreate(
    TasksCreateRequested event,
    Emitter<TasksState> emit,
  ) async {
    final prev = _ready;
    if (_groupId == null || prev == null) return;
    emit(prev.copyWith(busy: true));
    try {
      await _core.createTask(_groupId!, title: event.title.trim());
      final tasks = await _core.listTasks(_groupId!);
      final next = prev.copyWith(tasks: tasks, busy: false);
      emit(TasksActionSuccess('Đã tạo task', ready: next));
      emit(next);
    } catch (e) {
      emit(TasksFailure(_msg(e), previous: prev));
      emit(prev.copyWith(busy: false));
    }
  }

  Future<void> _onDrag(
    TasksDragRequested event,
    Emitter<TasksState> emit,
  ) async {
    final prev = _ready;
    if (_groupId == null || prev == null) return;
    final from = event.task.status;
    final to = event.toStatus;
    if (from == to) return;

    final allowed = (from == 'TODO' && to == 'IN_PROGRESS') ||
        (from == 'IN_PROGRESS' && to == 'DONE');
    if (!allowed) {
      emit(
        TasksFailure(
          'Chỉ hỗ trợ kéo TODO→IN_PROGRESS (claim) hoặc IN_PROGRESS→DONE (complete).',
          previous: prev,
        ),
      );
      emit(prev);
      return;
    }

    final optimistic = prev.tasks
        .map((t) => t.id == event.task.id ? t.copyWith(status: to) : t)
        .toList();
    emit(prev.copyWith(tasks: optimistic, busy: true));

    try {
      if (to == 'IN_PROGRESS') {
        await _core.claimTask(_groupId!, event.task.code);
      } else {
        await _core.completeTask(_groupId!, event.task.code);
      }
      final tasks = await _core.listTasks(_groupId!);
      final next = prev.copyWith(tasks: tasks, busy: false);
      emit(next);
    } catch (e) {
      emit(TasksFailure(_msg(e), previous: prev));
      emit(prev.copyWith(busy: false));
    }
  }

  Future<void> _onAssign(
    TasksAssignRequested event,
    Emitter<TasksState> emit,
  ) async {
    final prev = _ready;
    if (_groupId == null || prev == null) return;
    emit(prev.copyWith(busy: true));
    try {
      await _core.assignTask(_groupId!, event.code, event.userId.trim());
      final tasks = await _core.listTasks(_groupId!);
      final next = prev.copyWith(tasks: tasks, busy: false);
      emit(TasksActionSuccess('Đã assign', ready: next));
      emit(next);
    } catch (e) {
      emit(TasksFailure(_msg(e), previous: prev));
      emit(prev.copyWith(busy: false));
    }
  }

  Future<void> _onFocus(
    TasksFocusRequested event,
    Emitter<TasksState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    TaskListItem? match;
    for (final t in prev.tasks) {
      if (t.id == event.taskId) {
        match = t;
        break;
      }
    }
    emit(
      prev.copyWith(
        view: TasksViewMode.list,
        filter: match?.status,
        clearFilter: match == null,
        focusTaskId: event.taskId,
      ),
    );
  }

  Future<void> _onFocusCleared(
    TasksFocusCleared event,
    Emitter<TasksState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    emit(prev.copyWith(clearFocus: true));
  }

  String _msg(Object e) => e is ApiException ? e.message : e.toString();

  @override
  Future<void> close() {
    _wsSub.cancel();
    return super.close();
  }
}
