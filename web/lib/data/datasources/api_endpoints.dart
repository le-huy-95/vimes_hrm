class ApiEndpoints {
  static const authLogin = '/auth/login';
  static const authRegister = '/auth/register';
  static const authRefresh = '/auth/refresh';
  static const authMe = '/auth/me';
  static const authLogout = '/auth/logout';
  static const authGoogle = '/auth/google';
  static const authProviders = '/auth/providers';
  static const teams = '/teams';
  static String team(String id) => '/teams/$id';
  static String teamMembers(String id) => '/teams/$id/members';
  static String teamMember(String teamId, String userId) =>
      '/teams/$teamId/members/$userId';
  static String teamIntegrations(String id) => '/teams/$id/integrations';
  static String teamDashboard(String id) => '/teams/$id/dashboard';
  static String teamGoogleTasks(String id) => '/teams/$id/google-tasks';
  static String teamGoogleTasksConnect(String id) =>
      '/teams/$id/google-tasks/connect';
  static String teamGoogleTasksLists(String id) =>
      '/teams/$id/google-tasks/lists';
  static String teamGoogleTasksSync(String id) =>
      '/teams/$id/google-tasks/sync';
  static String teamGithubInstallUrl(String id) =>
      '/teams/$id/github/install-url';
  static String teamGithubConnection(String id) =>
      '/teams/$id/github/connection';
  static String teamMemberIntegrations(String id, String service) =>
      '/teams/$id/members/integrations?service=$service';
  static String teamMemberGithubCommits(String teamId, String userId) =>
      '/teams/$teamId/members/$userId/github-commits';
  static const orgUsers = '/orgs/me/users';
  static const orgWorkspaceConnect =
      '/orgs/me/workspace/connect?format=json';
}
