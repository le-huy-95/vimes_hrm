import 'package:manage_teams_app/data/datasources/api_services/team_api_service.dart';
import 'package:manage_teams_app/data/models/team_models.dart';
import 'package:manage_teams_app/domain/repositories/team_repository.dart';

class TeamRepositoryImpl implements TeamRepository {
  TeamRepositoryImpl({TeamApiService? api}) : _api = api ?? TeamApiService();

  final TeamApiService _api;

  @override
  Future<List<Team>> fetchTree() => _api.fetchTree();

  @override
  Future<Team> create({required String name}) => _api.create({'name': name});

  @override
  Future<Team> getById(String id) => _api.getById(id);

  @override
  Future<Team> update(
    String id, {
    String? name,
    String? description,
  }) {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (description != null) body['description'] = description;
    return _api.update(id, body);
  }

  @override
  Future<void> delete(String id) => _api.delete(id);

  @override
  Future<List<TeamMember>> listMembers(String teamId) =>
      _api.listMembers(teamId);

  @override
  Future<void> invite(
    String teamId, {
    required String email,
    required String role,
  }) =>
      _api.invite(teamId, {'email': email, 'role': role});

  @override
  Future<void> updateMemberRole(String teamId, String userId, String role) =>
      _api.updateMember(teamId, userId, {'role': role});

  @override
  Future<void> removeMember(String teamId, String userId) =>
      _api.removeMember(teamId, userId);
}
