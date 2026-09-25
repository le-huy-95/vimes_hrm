import 'package:manage_teams_app/data/models/team_models.dart';

abstract class TeamRepository {
  Future<List<Team>> fetchTree();
  Future<Team> create({required String name});
  Future<Team> getById(String id);
  Future<Team> update(
    String id, {
    String? name,
    String? description,
  });
  Future<void> delete(String id);
  Future<List<TeamMember>> listMembers(String teamId);
  Future<void> invite(
    String teamId, {
    required String email,
    required String role,
  });
  Future<void> updateMemberRole(String teamId, String userId, String role);
  Future<void> removeMember(String teamId, String userId);
}
