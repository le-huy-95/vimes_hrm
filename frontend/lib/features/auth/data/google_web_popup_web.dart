import 'dart:async';

import 'package:google_identity_services_web/loader.dart';
import 'package:google_identity_services_web/oauth2.dart';
import 'package:web/web.dart' as web;

class GoogleWebSignInResult {
  const GoogleWebSignInResult({required this.serverAuthCode});
  final String serverAuthCode;

  /// GIS popup codes must be exchanged with redirect_uri=postmessage.
  static const redirectUri = 'postmessage';
}

bool _sdkLoaded = false;

String get _currentOrigin {
  try {
    return web.window.location.origin;
  } catch (_) {
    return 'http://localhost:8080';
  }
}

StateError _mapGisError(String raw) {
  final lower = raw.toLowerCase();
  final origin = _currentOrigin;
  if (lower.contains('origin_mismatch')) {
    return StateError(
      'Google chặn origin $origin (origin_mismatch).\n'
      'Console → Credentials → OAuth client (Web) → '
      'Authorized JavaScript origins, thêm:\n'
      '• $origin\n'
      '• http://localhost\n'
      'Chạy web: ./tool/run_chrome.sh (port 8080)',
    );
  }
  if (lower.contains('access_denied') ||
      lower.contains('popup_closed') ||
      lower.contains('popup_closed_by_user')) {
    return StateError(
      'Google từ chối đăng nhập (access_denied / app đang Testing).\n'
      'Console → OAuth consent screen → Test users, thêm đúng '
      'email Google bạn đang dùng để liên kết.\n'
      'Hoặc Publishing status → In production (nếu đã sẵn sàng).',
    );
  }
  return StateError(raw);
}

/// Opens the Google GIS authorization popup and returns an auth code.
Future<GoogleWebSignInResult> requestGoogleWebPopupAuth({
  required String clientId,
  required List<String> scopes,
}) async {
  if (clientId.isEmpty) {
    throw StateError(
      'Thiếu GOOGLE_SERVER_CLIENT_ID trong .env (Web OAuth client).',
    );
  }
  if (!_sdkLoaded) {
    await loadWebSdk();
    _sdkLoaded = true;
  }

  final completer = Completer<GoogleWebSignInResult>();
  final scopeList = <String>{
    'openid',
    'email',
    'profile',
    ...scopes,
  }.toList();

  final client = oauth2.initCodeClient(
    CodeClientConfig(
      client_id: clientId,
      scope: scopeList,
      ux_mode: UxMode.popup,
      select_account: true,
      callback: (CodeResponse response) {
        if (completer.isCompleted) return;
        final error = response.error;
        if (error != null && error.isNotEmpty) {
          completer.completeError(
            _mapGisError(response.error_description ?? error),
          );
          return;
        }
        final code = response.code;
        if (code == null || code.isEmpty) {
          completer.completeError(
            StateError('Không nhận được mã Google authorization'),
          );
          return;
        }
        completer.complete(GoogleWebSignInResult(serverAuthCode: code));
      },
      error_callback: (GoogleIdentityServicesError? error) {
        if (completer.isCompleted) return;
        completer.completeError(
          _mapGisError(error?.type.name ?? 'Google đăng nhập bị huỷ'),
        );
      },
    ),
  );

  client.requestCode();
  return completer.future.timeout(
    const Duration(minutes: 3),
    onTimeout: () => throw StateError('Hết thời gian chờ đăng nhập Google'),
  );
}
