import 'package:manage_teams_app/data/datasources/api_services/dashboard_api_service.dart';
import 'package:manage_teams_app/data/models/dashboard_models.dart';
import 'package:manage_teams_app/domain/repositories/dashboard_repository.dart';

class DashboardRepositoryImpl implements DashboardRepository {
  DashboardRepositoryImpl({DashboardApiService? api})
      : _api = api ?? DashboardApiService();

  final DashboardApiService _api;

  @override
  Future<TeamDashboard> loadDashboard(String teamId) =>
      _api.loadDashboard(teamId);

  @override
  Future<GoogleTasksStatus> googleTasksStatus(String teamId) =>
      _api.googleTasksStatus(teamId);

  @override
  Future<List<TaskListOption>> googleTasksLists(String teamId) =>
      _api.googleTasksLists(teamId);

  @override
  Future<void> bindGoogleTasksLists(
    String teamId, {
    String? todoListId,
    String? doingListId,
    String? doneListId,
  }) =>
      _api.bindLists(teamId, {
        'todoListId': todoListId,
        'doingListId': doingListId,
        'doneListId': doneListId,
      });

  @override
  Future<void> syncGoogleTasks(String teamId) => _api.sync(teamId);

  @override
  Future<List<MemberIntegration>> memberIntegrations(
    String teamId,
    String service,
  ) =>
      _api.memberIntegrations(teamId, service);

  @override
  Future<GithubCommitPage> githubCommits(
    String teamId,
    String userId, {
    String? cursor,
  }) =>
      _api.githubCommits(teamId, userId, cursor: cursor);
}
