import 'package:manage_teams_app/data/models/dashboard_models.dart';

abstract class DashboardRepository {
  Future<TeamDashboard> loadDashboard(String teamId);
  Future<GoogleTasksStatus> googleTasksStatus(String teamId);
  Future<List<TaskListOption>> googleTasksLists(String teamId);
  Future<void> bindGoogleTasksLists(
    String teamId, {
    String? todoListId,
    String? doingListId,
    String? doneListId,
  });
  Future<void> syncGoogleTasks(String teamId);
  Future<List<MemberIntegration>> memberIntegrations(
    String teamId,
    String service,
  );
  Future<GithubCommitPage> githubCommits(
    String teamId,
    String userId, {
    String? cursor,
  });
}
