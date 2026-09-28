/// Typed API models for Phase 1–3 (gateway responses).
library;

class OrganizationItem {
  const OrganizationItem({
    required this.id,
    required this.name,
    required this.role,
  });

  final String id;
  final String name;
  final String role; // OWNER | ADMIN | MEMBER

  bool get isAdmin => role == 'OWNER' || role == 'ADMIN';

  factory OrganizationItem.fromJson(Map<String, dynamic> j) => OrganizationItem(
        id: j['id'] as String,
        name: j['name'] as String,
        role: j['role'] as String? ?? 'MEMBER',
      );
}

class GroupSummary {
  const GroupSummary({
    required this.id,
    required this.organizationId,
    required this.name,
    this.myRole,
  });

  final String id;
  final String organizationId;
  final String name;
  final String? myRole;

  bool get isAdmin => myRole == 'OWNER' || myRole == 'ADMIN';

  factory GroupSummary.fromJson(Map<String, dynamic> j) => GroupSummary(
        id: j['id'] as String,
        organizationId: j['organizationId'] as String,
        name: j['name'] as String,
        myRole: j['myRole'] as String?,
      );
}

class GroupMember {
  const GroupMember({
    required this.userId,
    required this.role,
    required this.email,
    this.displayName,
  });

  final String userId;
  final String role;
  final String email;
  final String? displayName;

  factory GroupMember.fromJson(Map<String, dynamic> j) => GroupMember(
        userId: j['userId'] as String,
        role: j['role'] as String,
        email: j['email'] as String? ?? '',
        displayName: j['displayName'] as String?,
      );
}

class GroupDetail {
  const GroupDetail({
    required this.id,
    required this.organizationId,
    required this.name,
    required this.members,
    this.settings = const {},
  });

  final String id;
  final String organizationId;
  final String name;
  final Map<String, dynamic> settings;
  final List<GroupMember> members;

  factory GroupDetail.fromJson(Map<String, dynamic> j) {
    final group = j['group'] is Map<String, dynamic>
        ? j['group'] as Map<String, dynamic>
        : j;
    return GroupDetail(
      id: group['id'] as String,
      organizationId: group['organizationId'] as String,
      name: group['name'] as String,
      settings: (group['settings'] as Map?)?.cast<String, dynamic>() ?? const {},
      members: (group['members'] as List<dynamic>? ?? const [])
          .map((e) => GroupMember.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class TaskAssigneeBrief {
  const TaskAssigneeBrief({
    required this.userId,
    required this.status,
    required this.email,
    this.displayName,
  });

  final String userId;
  final String status;
  final String email;
  final String? displayName;

  factory TaskAssigneeBrief.fromJson(Map<String, dynamic> j) =>
      TaskAssigneeBrief(
        userId: j['userId'] as String,
        status: j['status'] as String,
        email: j['email'] as String? ?? '',
        displayName: j['displayName'] as String?,
      );
}

class TaskListItem {
  const TaskListItem({
    required this.id,
    required this.code,
    required this.title,
    required this.status,
    required this.completionMode,
    required this.allowClaim,
    required this.assignees,
    required this.createdAt,
    this.maxAssignees,
    this.description,
  });

  final String id;
  final String code;
  final String title;
  final String status;
  final String completionMode;
  final bool allowClaim;
  final int? maxAssignees;
  final List<TaskAssigneeBrief> assignees;
  final DateTime createdAt;
  final String? description;

  factory TaskListItem.fromJson(Map<String, dynamic> j) {
    final createdRaw = j['createdAt'] ?? j['created_at'];
    return TaskListItem(
      id: j['id'] as String,
      code: j['code'] as String,
      title: j['title'] as String,
      status: j['status'] as String? ?? 'TODO',
      completionMode: j['completionMode'] as String? ?? 'ANY',
      allowClaim: j['allowClaim'] as bool? ?? true,
      maxAssignees: j['maxAssignees'] as int?,
      description: j['description'] as String?,
      assignees: (j['assignees'] as List<dynamic>? ?? const [])
          .map((e) => TaskAssigneeBrief.fromJson(e as Map<String, dynamic>))
          .toList(),
      createdAt: createdRaw != null
          ? DateTime.parse(createdRaw.toString()).toUtc()
          : DateTime.now().toUtc(),
    );
  }

  TaskListItem copyWith({
    String? status,
    List<TaskAssigneeBrief>? assignees,
  }) {
    return TaskListItem(
      id: id,
      code: code,
      title: title,
      status: status ?? this.status,
      completionMode: completionMode,
      allowClaim: allowClaim,
      maxAssignees: maxAssignees,
      assignees: assignees ?? this.assignees,
      createdAt: createdAt,
      description: description,
    );
  }
}

class ConversationItem {
  const ConversationItem({
    required this.id,
    required this.type,
    required this.lastReadSeq,
    this.groupId,
    this.taskId,
    this.title,
  });

  final String id;
  final String type; // GROUP | TASK
  final String? groupId;
  final String? taskId;
  final String? title;
  final int lastReadSeq;

  factory ConversationItem.fromJson(Map<String, dynamic> j) => ConversationItem(
        id: j['id'] as String,
        type: j['type'] as String,
        groupId: j['groupId'] as String?,
        taskId: j['taskId'] as String?,
        title: j['title'] as String?,
        lastReadSeq: (j['lastReadSeq'] as num?)?.toInt() ?? 0,
      );
}

class ReactionAgg {
  const ReactionAgg({
    required this.emoji,
    required this.count,
    required this.me,
  });

  final String emoji;
  final int count;
  final bool me;

  factory ReactionAgg.fromJson(Map<String, dynamic> j) => ReactionAgg(
        emoji: j['emoji'] as String,
        count: (j['count'] as num?)?.toInt() ?? 0,
        me: j['me'] as bool? ?? false,
      );
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.seq,
    required this.senderUserId,
    required this.body,
    required this.fileIds,
    required this.mentions,
    required this.reactions,
    required this.createdAt,
    required this.deleted,
    this.clientMsgId,
    this.replyToId,
    this.editedAt,
    this.conversationId,
    this.deduped,
  });

  final String id;
  final int seq;
  final String? clientMsgId;
  final String senderUserId;
  final String body;
  final String? replyToId;
  final List<String> fileIds;
  final List<String> mentions;
  final List<ReactionAgg> reactions;
  final DateTime createdAt;
  final DateTime? editedAt;
  final bool deleted;
  final String? conversationId;
  final bool? deduped;

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: j['id'] as String,
        seq: (j['seq'] as num?)?.toInt() ?? 0,
        clientMsgId: j['clientMsgId'] as String?,
        senderUserId: j['senderUserId'] as String? ?? '',
        body: j['body'] as String? ?? '',
        replyToId: j['replyToId'] as String?,
        fileIds: (j['fileIds'] as List<dynamic>? ?? const [])
            .map((e) => e as String)
            .toList(),
        mentions: (j['mentions'] as List<dynamic>? ?? const [])
            .map((e) => e as String)
            .toList(),
        reactions: (j['reactions'] as List<dynamic>? ?? const [])
            .map((e) => ReactionAgg.fromJson(e as Map<String, dynamic>))
            .toList(),
        createdAt: DateTime.parse(j['createdAt'].toString()),
        editedAt: j['editedAt'] != null
            ? DateTime.parse(j['editedAt'].toString())
            : null,
        deleted: j['deleted'] as bool? ?? false,
        conversationId: j['conversationId'] as String?,
        deduped: j['deduped'] as bool?,
      );
}

class SyncBacklog {
  const SyncBacklog({
    required this.pending,
    required this.retry,
    required this.failed,
    required this.authRequired,
  });

  final int pending;
  final int retry;
  final int failed;
  final int authRequired;

  factory SyncBacklog.fromJson(Map<String, dynamic> j) => SyncBacklog(
        pending: (j['pending'] as num?)?.toInt() ?? 0,
        retry: (j['retry'] as num?)?.toInt() ?? 0,
        failed: (j['failed'] as num?)?.toInt() ?? 0,
        authRequired: (j['authRequired'] as num?)?.toInt() ?? 0,
      );
}

class SyncStatus {
  const SyncStatus({
    required this.googleLinked,
    required this.backlog,
    required this.linkedTasks,
    required this.recentJobs,
    this.tasksLastPullAt,
  });

  final bool googleLinked;
  final DateTime? tasksLastPullAt;
  final SyncBacklog backlog;
  final int linkedTasks;
  final List<Map<String, dynamic>> recentJobs;

  factory SyncStatus.fromJson(Map<String, dynamic> j) => SyncStatus(
        googleLinked: j['googleLinked'] as bool? ?? false,
        tasksLastPullAt: j['tasksLastPullAt'] != null
            ? DateTime.parse(j['tasksLastPullAt'].toString())
            : null,
        backlog: SyncBacklog.fromJson(
          (j['backlog'] as Map<String, dynamic>?) ?? const {},
        ),
        linkedTasks: (j['linkedTasks'] as num?)?.toInt() ?? 0,
        recentJobs: (j['recentJobs'] as List<dynamic>? ?? const [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
      );
}
