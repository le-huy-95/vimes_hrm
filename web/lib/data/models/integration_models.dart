import 'package:equatable/equatable.dart';

class IntegrationStatus extends Equatable {
  const IntegrationStatus({
    required this.google,
    required this.github,
    required this.summary,
  });

  final GoogleIntegrationFlags google;
  final GithubIntegrationFlags github;
  final IntegrationSummary summary;

  factory IntegrationStatus.fromJson(Map<String, dynamic> json) {
    final google = json['google'];
    final github = json['github'];
    final summary = json['summary'];
    return IntegrationStatus(
      google: GoogleIntegrationFlags.fromJson(
        google is Map ? Map<String, dynamic>.from(google) : const {},
      ),
      github: GithubIntegrationFlags.fromJson(
        github is Map ? Map<String, dynamic>.from(github) : const {},
      ),
      summary: IntegrationSummary.fromJson(
        summary is Map ? Map<String, dynamic>.from(summary) : const {},
      ),
    );
  }

  static const empty = IntegrationStatus(
    google: GoogleIntegrationFlags(),
    github: GithubIntegrationFlags(),
    summary: IntegrationSummary(),
  );

  @override
  List<Object?> get props => [google, github, summary];
}

class GoogleIntegrationFlags extends Equatable {
  const GoogleIntegrationFlags({
    this.login = false,
    this.tasks = false,
    this.workspace = false,
    this.gchat = false,
  });

  final bool login;
  final bool tasks;
  final bool workspace;
  final bool gchat;

  factory GoogleIntegrationFlags.fromJson(Map<String, dynamic> json) =>
      GoogleIntegrationFlags(
        login: json['login'] == true,
        tasks: json['tasks'] == true,
        workspace: json['workspace'] == true,
        gchat: json['gchat'] == true,
      );

  @override
  List<Object?> get props => [login, tasks, workspace, gchat];
}

class GithubIntegrationFlags extends Equatable {
  const GithubIntegrationFlags({this.app = false, this.repos = false});

  final bool app;
  final bool repos;

  factory GithubIntegrationFlags.fromJson(Map<String, dynamic> json) =>
      GithubIntegrationFlags(
        app: json['app'] == true,
        repos: json['repos'] == true,
      );

  @override
  List<Object?> get props => [app, repos];
}

class IntegrationSummary extends Equatable {
  const IntegrationSummary({
    this.memberTotal = 0,
    this.googleLinked = 0,
    this.githubLinked = 0,
    this.repoCount = 0,
  });

  final int memberTotal;
  final int googleLinked;
  final int githubLinked;
  final int repoCount;

  factory IntegrationSummary.fromJson(Map<String, dynamic> json) =>
      IntegrationSummary(
        memberTotal: (json['memberTotal'] as num?)?.toInt() ?? 0,
        googleLinked: (json['googleLinked'] as num?)?.toInt() ?? 0,
        githubLinked: (json['githubLinked'] as num?)?.toInt() ?? 0,
        repoCount: (json['repoCount'] as num?)?.toInt() ?? 0,
      );

  @override
  List<Object?> get props =>
      [memberTotal, googleLinked, githubLinked, repoCount];
}
