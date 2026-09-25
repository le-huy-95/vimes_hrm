import 'package:equatable/equatable.dart';

class Me extends Equatable {
  const Me({
    required this.id,
    required this.email,
    required this.fullName,
    required this.orgId,
    required this.status,
    required this.org,
  });

  final String id;
  final String email;
  final String fullName;
  final String orgId;
  final String status;
  final OrgBrief org;

  factory Me.fromJson(Map<String, dynamic> json) => Me(
        id: json['id'] as String,
        email: json['email'] as String,
        fullName: json['fullName'] as String,
        orgId: json['orgId'] as String,
        status: json['status'] as String,
        org: OrgBrief.fromJson(json['org'] as Map<String, dynamic>),
      );

  @override
  List<Object?> get props => [id, email, fullName, orgId, status, org];
}

class OrgBrief extends Equatable {
  const OrgBrief({required this.id, required this.name, this.domain});

  final String id;
  final String name;
  final String? domain;

  factory OrgBrief.fromJson(Map<String, dynamic> json) => OrgBrief(
        id: json['id'] as String,
        name: json['name'] as String,
        domain: json['domain'] as String?,
      );

  @override
  List<Object?> get props => [id, name, domain];
}

class Session extends Equatable {
  const Session({required this.accessToken});

  final String accessToken;

  factory Session.fromJson(Map<String, dynamic> json) => Session(
        accessToken: json['accessToken'] as String,
      );

  @override
  List<Object?> get props => [accessToken];
}
