/// Stub for non-web platforms.
Future<GoogleWebSignInResult> requestGoogleWebPopupAuth({
  required String clientId,
  required List<String> scopes,
}) {
  throw UnsupportedError('Đăng nhập Google bằng popup chỉ hỗ trợ trên web');
}

class GoogleWebSignInResult {
  const GoogleWebSignInResult({required this.serverAuthCode});
  final String serverAuthCode;
  /// GIS popup codes must be exchanged with redirect_uri=postmessage.
  static const redirectUri = 'postmessage';
}
