import 'package:manage_teams_app/data/datasources/api_services/integration_api_service.dart';
import 'package:manage_teams_app/data/models/integration_models.dart';
import 'package:manage_teams_app/domain/repositories/integration_repository.dart';

class IntegrationRepositoryImpl implements IntegrationRepository {
  IntegrationRepositoryImpl({IntegrationApiService? api})
      : _api = api ?? IntegrationApiService();

  final IntegrationApiService _api;

  @override
  Future<IntegrationStatus> getStatus(String teamId) => _api.getStatus(teamId);

  @override
  Future<String> googleTasksConnectUrl(String teamId) =>
      _api.googleTasksConnectUrl(teamId);

  @override
  Future<String> githubInstallUrl(String teamId) =>
      _api.githubInstallUrl(teamId);

  @override
  Future<String> workspaceConnectUrl() => _api.workspaceConnectUrl();
}
