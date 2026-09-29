class RegisterResponse {
  const RegisterResponse({
    required this.userId,
    required this.email,
    required this.message,
  });

  final String userId;
  final String email;
  final String message;

  factory RegisterResponse.fromJson(Map<String, dynamic> json) =>
      RegisterResponse(
        userId: json['userId'] as String,
        email: json['email'] as String,
        message: json['message'] as String,
      );
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    this.googleAccounts = const [],
  });

  final String id;
  final String email;
  final List<GoogleAccountBrief> googleAccounts;

  bool get hasGoogleLinked => googleAccounts.isNotEmpty;

  AuthUser copyWith({
    String? id,
    String? email,
    List<GoogleAccountBrief>? googleAccounts,
  }) =>
      AuthUser(
        id: id ?? this.id,
        email: email ?? this.email,
        googleAccounts: googleAccounts ?? this.googleAccounts,
      );

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        email: json['email'] as String,
      );
}

class LoginResponse {
  const LoginResponse({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
  });

  final AuthUser user;
  final String accessToken;
  final String refreshToken;
  final int expiresIn;

  factory LoginResponse.fromJson(Map<String, dynamic> json) => LoginResponse(
        user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        expiresIn: json['expiresIn'] as int,
      );
}

class MessageResponse {
  const MessageResponse({required this.message});

  final String message;

  factory MessageResponse.fromJson(Map<String, dynamic> json) =>
      MessageResponse(message: json['message'] as String);
}

class OkMessageResponse {
  const OkMessageResponse({required this.ok, required this.message});

  final bool ok;
  final String message;

  factory OkMessageResponse.fromJson(Map<String, dynamic> json) =>
      OkMessageResponse(
        ok: json['ok'] as bool,
        message: json['message'] as String,
      );
}

class MeResponse {
  const MeResponse({required this.user, required this.googleAccounts});

  final MeUser user;
  final List<GoogleAccountBrief> googleAccounts;

  factory MeResponse.fromJson(Map<String, dynamic> json) => MeResponse(
        user: MeUser.fromJson(json['user'] as Map<String, dynamic>),
        googleAccounts: (json['googleAccounts'] as List? ?? [])
            .map((e) => GoogleAccountBrief.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class MeUser {
  const MeUser({
    required this.id,
    required this.email,
    this.displayName,
    this.emailVerifiedAt,
    required this.tokenVersion,
  });

  final String id;
  final String email;
  final String? displayName;
  final DateTime? emailVerifiedAt;
  final int tokenVersion;

  factory MeUser.fromJson(Map<String, dynamic> json) => MeUser(
        id: json['id'] as String,
        email: json['email'] as String,
        displayName: json['display_name'] as String?,
        emailVerifiedAt: json['email_verified_at'] != null
            ? DateTime.parse(json['email_verified_at'] as String)
            : null,
        tokenVersion: json['token_version'] as int,
      );

  AuthUser toAuthUser() => AuthUser(id: id, email: email);

  AuthUser toAuthUserWithAccounts(List<GoogleAccountBrief> accounts) =>
      AuthUser(id: id, email: email, googleAccounts: accounts);
}

class GoogleAccountBrief {
  const GoogleAccountBrief({
    required this.googleSub,
    this.email,
    required this.accountType,
    required this.isPrimary,
    required this.linkedAt,
  });

  final String googleSub;
  final String? email;
  final String accountType;
  final bool isPrimary;
  final DateTime linkedAt;

  factory GoogleAccountBrief.fromJson(Map<String, dynamic> json) =>
      GoogleAccountBrief(
        googleSub: json['google_sub'] as String,
        email: json['email'] as String?,
        accountType: json['account_type'] as String,
        isPrimary: json['is_primary'] as bool,
        linkedAt: DateTime.parse(json['linked_at'] as String),
      );
}
