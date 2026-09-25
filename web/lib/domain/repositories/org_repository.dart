abstract class OrgRepository {
  Future<void> createOrgUser({
    required String email,
    required String fullName,
  });
}
