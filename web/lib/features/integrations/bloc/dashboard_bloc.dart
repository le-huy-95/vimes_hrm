import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams_app/data/models/dashboard_models.dart';
import 'package:manage_teams_app/domain/repositories/dashboard_repository.dart';

sealed class DashboardEvent extends Equatable {
  const DashboardEvent();
  @override
  List<Object?> get props => [];
}

class DashboardStarted extends DashboardEvent {
  const DashboardStarted(this.teamId);
  final String teamId;
  @override
  List<Object?> get props => [teamId];
}

class DashboardRefreshed extends DashboardEvent {
  const DashboardRefreshed();
}

class DashboardBindAndSync extends DashboardEvent {
  const DashboardBindAndSync({
    this.todoListId,
    this.doingListId,
    this.doneListId,
  });
  final String? todoListId;
  final String? doingListId;
  final String? doneListId;
  @override
  List<Object?> get props => [todoListId, doingListId, doneListId];
}

class DashboardLoadMembers extends DashboardEvent {
  const DashboardLoadMembers(this.service);
  final String service;
  @override
  List<Object?> get props => [service];
}

class DashboardLoadCommits extends DashboardEvent {
  const DashboardLoadCommits(this.userId);
  final String userId;
  @override
  List<Object?> get props => [userId];
}

class DashboardLoadMoreCommits extends DashboardEvent {
  const DashboardLoadMoreCommits();
}

sealed class DashboardState extends Equatable {
  const DashboardState();
  @override
  List<Object?> get props => [];
}

class DashboardInitial extends DashboardState {
  const DashboardInitial();
}

class DashboardLoading extends DashboardState {
  const DashboardLoading();
}

class DashboardReady extends DashboardState {
  const DashboardReady({
    required this.dashboard,
    required this.tasksStatus,
    this.remoteLists = const [],
    this.members = const [],
    this.membersService,
    this.commits,
    this.message,
    this.busy = false,
  });

  final TeamDashboard dashboard;
  final GoogleTasksStatus tasksStatus;
  final List<TaskListOption> remoteLists;
  final List<MemberIntegration> members;
  final String? membersService;
  final GithubCommitPage? commits;
  final String? message;
  final bool busy;

  @override
  List<Object?> get props => [
        dashboard,
        tasksStatus,
        remoteLists,
        members,
        membersService,
        commits,
        message,
        busy,
      ];

  DashboardReady copyWith({
    TeamDashboard? dashboard,
    GoogleTasksStatus? tasksStatus,
    List<TaskListOption>? remoteLists,
    List<MemberIntegration>? members,
    String? membersService,
    GithubCommitPage? commits,
    String? message,
    bool? busy,
    bool clearMessage = false,
  }) {
    return DashboardReady(
      dashboard: dashboard ?? this.dashboard,
      tasksStatus: tasksStatus ?? this.tasksStatus,
      remoteLists: remoteLists ?? this.remoteLists,
      members: members ?? this.members,
      membersService: membersService ?? this.membersService,
      commits: commits ?? this.commits,
      message: clearMessage ? null : (message ?? this.message),
      busy: busy ?? this.busy,
    );
  }
}

class DashboardFailure extends DashboardState {
  const DashboardFailure(this.message);
  final String message;
  @override
  List<Object?> get props => [message];
}

class DashboardBloc extends Bloc<DashboardEvent, DashboardState> {
  DashboardBloc({required DashboardRepository repository})
      : _repo = repository,
        super(const DashboardInitial()) {
    on<DashboardStarted>(_onStarted);
    on<DashboardRefreshed>(_onRefreshed);
    on<DashboardBindAndSync>(_onBind);
    on<DashboardLoadMembers>(_onMembers);
    on<DashboardLoadCommits>(_onCommits);
    on<DashboardLoadMoreCommits>(_onMoreCommits);
  }

  final DashboardRepository _repo;
  String? _teamId;
  String? _commitUserId;

  Future<void> _hydrate(Emitter<DashboardState> emit, {String? message}) async {
    final id = _teamId;
    if (id == null) return;
    emit(const DashboardLoading());
    try {
      final dash = await _repo.loadDashboard(id);
      var tasks = GoogleTasksStatus(
        oauthConnected: dash.chart.connected,
        chart: dash.chart,
      );
      var lists = <TaskListOption>[];
      try {
        tasks = await _repo.googleTasksStatus(id);
        if (tasks.oauthConnected) {
          lists = await _repo.googleTasksLists(id);
        }
      } catch (_) {
        // optional
      }
      emit(DashboardReady(
        dashboard: dash.copyWithChart(tasks.chart),
        tasksStatus: tasks,
        remoteLists: lists,
        message: message,
      ));
    } catch (e) {
      emit(DashboardFailure(e.toString()));
    }
  }

  Future<void> _onStarted(
    DashboardStarted e,
    Emitter<DashboardState> emit,
  ) async {
    _teamId = e.teamId;
    await _hydrate(emit);
  }

  Future<void> _onRefreshed(
    DashboardRefreshed e,
    Emitter<DashboardState> emit,
  ) async {
    await _hydrate(emit);
  }

  Future<void> _onBind(
    DashboardBindAndSync e,
    Emitter<DashboardState> emit,
  ) async {
    final id = _teamId;
    final current = state;
    if (id == null || current is! DashboardReady) return;
    emit(current.copyWith(busy: true, clearMessage: true));
    try {
      await _repo.bindGoogleTasksLists(
        id,
        todoListId: e.todoListId,
        doingListId: e.doingListId,
        doneListId: e.doneListId,
      );
      await _repo.syncGoogleTasks(id);
      await _hydrate(emit, message: 'Đã gắn list và xếp hàng sync');
    } catch (err) {
      emit(current.copyWith(busy: false, message: err.toString()));
    }
  }

  Future<void> _onMembers(
    DashboardLoadMembers e,
    Emitter<DashboardState> emit,
  ) async {
    final id = _teamId;
    final current = state;
    if (id == null || current is! DashboardReady) return;
    try {
      final rows = await _repo.memberIntegrations(id, e.service);
      emit(current.copyWith(members: rows, membersService: e.service));
    } catch (err) {
      emit(current.copyWith(message: err.toString()));
    }
  }

  Future<void> _onCommits(
    DashboardLoadCommits e,
    Emitter<DashboardState> emit,
  ) async {
    final id = _teamId;
    final current = state;
    if (id == null || current is! DashboardReady) return;
    _commitUserId = e.userId;
    try {
      final page = await _repo.githubCommits(id, e.userId);
      emit(current.copyWith(commits: page));
    } catch (err) {
      emit(current.copyWith(message: err.toString()));
    }
  }

  Future<void> _onMoreCommits(
    DashboardLoadMoreCommits e,
    Emitter<DashboardState> emit,
  ) async {
    final id = _teamId;
    final userId = _commitUserId;
    final current = state;
    if (id == null ||
        userId == null ||
        current is! DashboardReady ||
        current.commits?.nextCursor == null) {
      return;
    }
    try {
      final page = await _repo.githubCommits(
        id,
        userId,
        cursor: current.commits!.nextCursor,
      );
      emit(current.copyWith(commits: current.commits!.append(page)));
    } catch (err) {
      emit(current.copyWith(message: err.toString()));
    }
  }
}

extension on TeamDashboard {
  TeamDashboard copyWithChart(TasksChartCounts chart) => TeamDashboard(
        chart: chart,
        githubConnected: githubConnected,
        githubRepoCount: githubRepoCount,
        googleLinked: googleLinked,
        githubLinked: githubLinked,
      );
}
