import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';

class CoreRepository {
  CoreRepository(this._api);
  final ApiClient _api;

  Future<List<OrganizationItem>> listOrganizations() async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>('/organizations');
      final list = res.data?['organizations'] as List<dynamic>? ?? [];
      return list
          .map((e) => OrganizationItem.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<OrganizationItem> createOrganization(String name) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/organizations',
        data: {'name': name},
      );
      final org = res.data?['organization'] as Map<String, dynamic>? ?? {};
      return OrganizationItem(
        id: org['id'] as String,
        name: org['name'] as String? ?? name,
        role: 'OWNER',
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> inviteToOrganization(
    String orgId, {
    required String email,
    String role = 'MEMBER',
  }) async {
    try {
      await _api.dio.post(
        '/organizations/$orgId/invitations',
        data: {'email': email, 'role': role},
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<List<OrgInvitationItem>> listOrgInvitations() async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>('/invitations/org');
      final list = res.data?['invitations'] as List<dynamic>? ?? [];
      return list
          .map((e) => OrgInvitationItem.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<String> acceptOrgInvitation(String invitationId) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/invitations/org/$invitationId/accept',
      );
      return res.data?['organizationId'] as String? ?? '';
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> rejectOrgInvitation(String invitationId) async {
    try {
      await _api.dio.post('/invitations/org/$invitationId/reject');
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<List<GroupSummary>> listGroups(String orgId) async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>(
        '/organizations/$orgId/groups',
      );
      final list = res.data?['groups'] as List<dynamic>? ?? [];
      return list
          .map((e) => GroupSummary.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<GroupSummary> createGroup(String orgId, String name) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/organizations/$orgId/groups',
        data: {'name': name},
      );
      final g = res.data?['group'] as Map<String, dynamic>? ?? {};
      return GroupSummary(
        id: g['id'] as String,
        organizationId: g['organizationId'] as String? ?? orgId,
        name: g['name'] as String? ?? name,
        myRole: 'OWNER',
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<GroupDetail> getGroup(String groupId) async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>('/groups/$groupId');
      return GroupDetail.fromJson(res.data ?? {});
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> addGroupMember(
    String groupId, {
    required String userId,
    String role = 'MEMBER',
  }) async {
    try {
      await _api.dio.post(
        '/groups/$groupId/members',
        data: {'userId': userId, 'role': role},
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> removeGroupMember(String groupId, String userId) async {
    try {
      await _api.dio.delete('/groups/$groupId/members/$userId');
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<List<TaskListItem>> listTasks(String groupId) async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>(
        '/groups/$groupId/tasks',
      );
      final list = res.data?['tasks'] as List<dynamic>? ?? [];
      return list
          .map((e) => TaskListItem.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<TaskListItem> createTask(
    String groupId, {
    required String title,
    String? description,
    String completionMode = 'ANY',
    bool allowClaim = true,
    int? maxAssignees,
    List<String>? assigneeIds,
    String? dueDate,
    String? startDate,
    String? parentCode,
  }) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/groups/$groupId/tasks',
        data: {
          'title': title,
          if (description != null) 'description': description,
          'completionMode': completionMode,
          'allowClaim': allowClaim,
          if (maxAssignees != null) 'maxAssignees': maxAssignees,
          if (assigneeIds != null) 'assigneeIds': assigneeIds,
          if (dueDate != null) 'dueDate': dueDate,
          if (startDate != null) 'startDate': startDate,
          if (parentCode != null) 'parentCode': parentCode,
        },
      );
      final t = res.data?['task'] as Map<String, dynamic>? ?? {};
      return TaskListItem(
        id: t['id'] as String,
        code: t['code'] as String? ?? '',
        title: t['title'] as String? ?? title,
        status: t['status'] as String? ?? 'TODO',
        completionMode: completionMode,
        allowClaim: allowClaim,
        maxAssignees: maxAssignees,
        assignees: const [],
        createdAt: DateTime.now().toUtc(),
        createdById:
            t['createdById'] as String? ?? t['created_by_id'] as String?,
        description: description,
        dueDate: dueDate,
        startDate: startDate,
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<Map<String, dynamic>> getTask(String groupId, String code) async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>(
        '/groups/$groupId/tasks/$code',
      );
      return (res.data?['task'] as Map<String, dynamic>?) ?? {};
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> claimTask(String groupId, String code) async {
    try {
      await _api.dio.post('/groups/$groupId/tasks/$code/claim');
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> completeTask(String groupId, String code) async {
    try {
      await _api.dio.post('/groups/$groupId/tasks/$code/complete');
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> patchTask(
    String groupId,
    String code, {
    String? title,
    String? description,
    String? dueDate,
    bool clearDueDate = false,
    String? startDate,
    bool clearStartDate = false,
    String? status,
    bool? starred,
  }) async {
    try {
      await _api.dio.patch(
        '/groups/$groupId/tasks/$code',
        data: {
          if (title != null) 'title': title,
          if (description != null) 'description': description,
          if (clearDueDate) 'dueDate': null,
          if (!clearDueDate && dueDate != null) 'dueDate': dueDate,
          if (clearStartDate) 'startDate': null,
          if (!clearStartDate && startDate != null) 'startDate': startDate,
          if (status != null) 'status': status,
          if (starred != null) 'starred': starred,
        },
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> unassignTask(
    String groupId,
    String code, {
    String? userId,
  }) async {
    try {
      await _api.dio.post(
        '/groups/$groupId/tasks/$code/unassign',
        data: {if (userId != null) 'userId': userId},
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> assignTask(String groupId, String code, String userId) async {
    try {
      await _api.dio.post(
        '/groups/$groupId/tasks/$code/assign',
        data: {'userId': userId},
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<List<String>> deleteTask(String groupId, String code) async {
    try {
      final res = await _api.dio.delete<Map<String, dynamic>>(
        '/groups/$groupId/tasks/$code',
      );
      final codes = res.data?['codes'] as List<dynamic>? ?? [code];
      return codes.map((e) => e.toString()).toList();
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<({bool leftGroup, List<Map<String, dynamic>> chatResults})> leaveGroup(
    String groupId,
  ) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/groups/$groupId/leave',
      );
      final data = res.data ?? {};
      return (
        leftGroup: data['leftGroup'] == true,
        chatResults: (data['chatResults'] as List<dynamic>? ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
