import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:manage_teams/core/constants/env_config.dart';
import 'package:manage_teams/features/auth/data/google_web_popup.dart';

/// Scopes Tasks + Sheets + Drive.file + Chat (Google Chat OAuth proxy).
const kGoogleSyncScopes = <String>[
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages',
  'https://www.googleapis.com/auth/chat.memberships',
];

class GoogleSignInTokens {
  const GoogleSignInTokens({
    this.idToken = '',
    this.serverAuthCode,
    this.redirectUri,
  });

  final String idToken;
  final String? serverAuthCode;

  /// When set (web GIS popup), backend must use this on token exchange.
  final String? redirectUri;
}

/// Web GIS rejects a second [GoogleSignIn.initialize]; Dart state resets on hot
/// restart while the JS plugin stays initialized — guard both cases.
Future<void>? _googleInitFuture;

bool get googleSignInSupportsAuthenticate =>
    !kIsWeb && GoogleSignIn.instance.supportsAuthenticate();

Future<void> ensureGoogleSignInInitialized() {
  if (kIsWeb) return Future<void>.value();

  final existing = _googleInitFuture;
  if (existing != null) return existing;

  final future = _initializeGoogleSignIn();
  _googleInitFuture = future;
  future.catchError((Object _) {
    if (identical(_googleInitFuture, future)) {
      _googleInitFuture = null;
    }
  });
  return future;
}

Future<void> _initializeGoogleSignIn() async {
  final webClientId = EnvConfig.googleServerClientId;
  final iosClientId = EnvConfig.googleIosClientId;

  try {
    await GoogleSignIn.instance.initialize(
      clientId: iosClientId.isEmpty ? null : iosClientId,
      serverClientId: webClientId.isEmpty ? null : webClientId,
    );
  } on StateError catch (e) {
    if (!e.message.contains('already been called')) rethrow;
  }
}

Future<GoogleSignInTokens> tokensFromGoogleAccount(
  GoogleSignInAccount account,
) async {
  final idToken = account.authentication.idToken;
  if (idToken == null || idToken.isEmpty) {
    throw StateError('Không lấy được Google idToken');
  }
  String? serverAuthCode;
  try {
    final serverAuth =
        await account.authorizationClient.authorizeServer(kGoogleSyncScopes);
    serverAuthCode = serverAuth?.serverAuthCode;
  } catch (_) {
    // Liên kết/đăng nhập vẫn tiếp tục; sync có thể chưa sẵn sàng.
  }
  return GoogleSignInTokens(
    idToken: idToken,
    serverAuthCode: serverAuthCode,
  );
}

/// Cross-platform Google Sign-In → tokens for backend.
Future<GoogleSignInTokens> requestGoogleSignInTokens() async {
  if (kIsWeb) {
    final result = await requestGoogleWebPopupAuth(
      clientId: EnvConfig.googleServerClientId,
      scopes: kGoogleSyncScopes,
    );
    return GoogleSignInTokens(
      serverAuthCode: result.serverAuthCode,
      redirectUri: GoogleWebSignInResult.redirectUri,
    );
  }

  await ensureGoogleSignInInitialized();
  final account =
      await GoogleSignIn.instance.authenticate(scopeHint: kGoogleSyncScopes);
  return tokensFromGoogleAccount(account);
}
