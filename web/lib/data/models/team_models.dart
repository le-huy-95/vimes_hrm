import 'package:equatable/equatable.dart';

class Team extends Equatable {
  const Team({
    required this.id,
    required this.orgId,
    this.parentTeamId,
    required this.name,
    this.description,
    required this.createdAt,
    this.memberNames = const [],
    this.children = const [],
  });

  final String id;
  final String orgId;
  final String? parentTeamId;
  final String name;
  final String? description;
  final String createdAt;
  final List<String> memberNames;
  final List<Team> children;

  factory Team.fromJson(Map<String, dynamic> json) {
    final childrenJson = json['children'];
    return Team(
      id: json['id'] as String,
      orgId: json['orgId'] as String,
      parentTeamId: json['parentTeamId'] as String?,
      name: json['name'] as String,
      description: json['description'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
      memberNames: (json['memberNames'] as List?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      children: childrenJson is List
          ? childrenJson
              .whereType<Map>()
              .map((e) => Team.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
    );
  }

  /// Flatten tree depth-first for pickers.
  List<Team> get flatten {
    return [this, for (final c in children) ...c.flatten];
  }

  @override
  List<Object?> get props =>
      [id, orgId, parentTeamId, name, description, createdAt, memberNames, children];
}

class TeamMember extends Equatable {
  const TeamMember({
    required this.id,
    required this.teamId,
    required this.userId,
    required this.role,
    this.githubLogin,
    required this.joinedAt,
    required this.user,
  });

  final String id;
  final String teamId;
  final String userId;
  final String role; // lead | member | viewer
  final String? githubLogin;
  final String joinedAt;
  final TeamMemberUser user;

  factory TeamMember.fromJson(Map<String, dynamic> json) => TeamMember(
        id: json['id'] as String,
        teamId: json['teamId'] as String,
        userId: json['userId'] as String,
        role: json['role'] as String,
        githubLogin: json['githubLogin'] as String?,
        joinedAt: json['joinedAt'] as String? ?? '',
        user: TeamMemberUser.fromJson(
          Map<String, dynamic>.from(json['user'] as Map),
        ),
      );

  @override
  List<Object?> get props =>
      [id, teamId, userId, role, githubLogin, joinedAt, user];
}

class TeamMemberUser extends Equatable {
  const TeamMemberUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.status,
    this.googleUserId,
  });

  final String id;
  final String email;
  final String fullName;
  final String status;
  final String? googleUserId;

  factory TeamMemberUser.fromJson(Map<String, dynamic> json) => TeamMemberUser(
        id: json['id'] as String,
        email: json['email'] as String,
        fullName: json['fullName'] as String,
        status: json['status'] as String? ?? '',
        googleUserId: json['googleUserId'] as String?,
      );

  @override
  List<Object?> get props => [id, email, fullName, status, googleUserId];
}
