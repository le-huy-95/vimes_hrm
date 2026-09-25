import 'package:manage_teams_app/data/models/integration_models.dart';

abstract class IntegrationRepository {
  Future<IntegrationStatus> getStatus(String teamId);
  Future<String> googleTasksConnectUrl(String teamId);
  Future<String> githubInstallUrl(String teamId);
  Future<String> workspaceConnectUrl();
}
