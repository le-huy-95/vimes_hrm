import 'package:equatable/equatable.dart';

class TasksChartCounts extends Equatable {
  const TasksChartCounts({
    this.todo = 0,
    this.doing = 0,
    this.done = 0,
    this.connected = false,
    this.lastSyncedAt,
  });

  final int todo;
  final int doing;
  final int done;
  final bool connected;
  final String? lastSyncedAt;

  factory TasksChartCounts.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const TasksChartCounts();
    return TasksChartCounts(
      todo: (json['todo'] as num?)?.toInt() ?? 0,
      doing: (json['doing'] as num?)?.toInt() ?? 0,
      done: (json['done'] as num?)?.toInt() ?? 0,
      connected: json['connected'] == true,
      lastSyncedAt: json['lastSyncedAt'] as String?,
    );
  }

  bool get hasData => connected || todo + doing + done > 0;

  @override
  List<Object?> get props => [todo, doing, done, connected, lastSyncedAt];
}

class GoogleTasksStatus extends Equatable {
  const GoogleTasksStatus({
    required this.oauthConnected,
    this.todoListId,
    this.doingListId,
    this.doneListId,
    this.chart = const TasksChartCounts(),
  });

  final bool oauthConnected;
  final String? todoListId;
  final String? doingListId;
  final String? doneListId;
  final TasksChartCounts chart;

  factory GoogleTasksStatus.fromJson(Map<String, dynamic> json) {
    final settings = json['settings'];
    final settingsMap =
        settings is Map ? Map<String, dynamic>.from(settings) : null;
    final chartJson = json['chart'];
    return GoogleTasksStatus(
      oauthConnected: json['oauthConnected'] == true,
      todoListId: settingsMap?['todoListId'] as String?,
      doingListId: settingsMap?['doingListId'] as String?,
      doneListId: settingsMap?['doneListId'] as String?,
      chart: TasksChartCounts.fromJson(
        chartJson is Map ? Map<String, dynamic>.from(chartJson) : null,
      ),
    );
  }

  @override
  List<Object?> get props =>
      [oauthConnected, todoListId, doingListId, doneListId, chart];
}

class TaskListOption extends Equatable {
  const TaskListOption({required this.id, required this.title});
  final String id;
  final String title;
  factory TaskListOption.fromJson(Map<String, dynamic> json) => TaskListOption(
        id: json['id'] as String,
        title: json['title'] as String? ?? json['id'] as String,
      );
  @override
  List<Object?> get props => [id, title];
}

class MemberIntegration extends Equatable {
  const MemberIntegration({
    required this.userId,
    required this.fullName,
    required this.email,
    required this.role,
    required this.linked,
    this.handle,
    this.githubLogin,
  });

  final String userId;
  final String fullName;
  final String email;
  final String role;
  final bool linked;
  final String? handle;
  final String? githubLogin;

  factory MemberIntegration.fromJson(Map<String, dynamic> json) =>
      MemberIntegration(
        userId: json['userId'] as String,
        fullName: json['fullName'] as String? ?? '',
        email: json['email'] as String? ?? '',
        role: json['role'] as String? ?? '',
        linked: json['linked'] == true,
        handle: json['handle'] as String?,
        githubLogin: json['githubLogin'] as String?,
      );

  @override
  List<Object?> get props =>
      [userId, fullName, email, role, linked, handle, githubLogin];
}

class GithubCommitItem extends Equatable {
  const GithubCommitItem({
    required this.id,
    required this.title,
    required this.eventType,
    this.action,
    required this.occurredAt,
    this.externalUrl,
    this.repoFullName,
  });

  final String id;
  final String title;
  final String eventType;
  final String? action;
  final String occurredAt;
  final String? externalUrl;
  final String? repoFullName;

  factory GithubCommitItem.fromJson(Map<String, dynamic> json) =>
      GithubCommitItem(
        id: json['id'] as String,
        title: json['title'] as String? ?? '',
        eventType: json['eventType'] as String? ?? '',
        action: json['action'] as String?,
        occurredAt: json['occurredAt'] as String? ?? '',
        externalUrl: json['externalUrl'] as String?,
        repoFullName: json['repoFullName'] as String?,
      );

  @override
  List<Object?> get props =>
      [id, title, eventType, action, occurredAt, externalUrl, repoFullName];
}

class GithubCommitPage extends Equatable {
  const GithubCommitPage({
    required this.userId,
    required this.githubLogin,
    required this.items,
    this.nextCursor,
  });

  final String userId;
  final String githubLogin;
  final List<GithubCommitItem> items;
  final String? nextCursor;

  factory GithubCommitPage.fromJson(Map<String, dynamic> json) =>
      GithubCommitPage(
        userId: json['userId'] as String? ?? '',
        githubLogin: json['githubLogin'] as String? ?? '',
        items: (json['items'] as List?)
                ?.whereType<Map>()
                .map((e) => GithubCommitItem.fromJson(Map<String, dynamic>.from(e)))
                .toList() ??
            const [],
        nextCursor: json['nextCursor'] as String?,
      );

  GithubCommitPage append(GithubCommitPage next) => GithubCommitPage(
        userId: userId,
        githubLogin: githubLogin,
        items: [...items, ...next.items],
        nextCursor: next.nextCursor,
      );

  @override
  List<Object?> get props => [userId, githubLogin, items, nextCursor];
}

class TeamDashboard extends Equatable {
  const TeamDashboard({
    required this.chart,
    this.githubConnected = false,
    this.githubRepoCount = 0,
    this.googleLinked = 0,
    this.githubLinked = 0,
  });

  final TasksChartCounts chart;
  final bool githubConnected;
  final int githubRepoCount;
  final int googleLinked;
  final int githubLinked;

  @override
  List<Object?> get props =>
      [chart, githubConnected, githubRepoCount, googleLinked, githubLinked];
}
