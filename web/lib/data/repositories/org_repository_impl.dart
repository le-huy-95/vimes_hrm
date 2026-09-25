import 'package:manage_teams_app/data/datasources/api_services/org_api_service.dart';
import 'package:manage_teams_app/domain/repositories/org_repository.dart';

class OrgRepositoryImpl implements OrgRepository {
  OrgRepositoryImpl({OrgApiService? api}) : _api = api ?? OrgApiService();

  final OrgApiService _api;

  @override
  Future<void> createOrgUser({
    required String email,
    required String fullName,
  }) =>
      _api.createUser(email: email, fullName: fullName);
}
