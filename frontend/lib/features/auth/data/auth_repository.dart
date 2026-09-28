import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/auth/data/auth_models.dart';

export 'package:manage_teams/features/auth/data/auth_models.dart';

class AuthRepository {
  AuthRepository(this._api);
  final ApiClient _api;

  Future<RegisterResponse> register({
    required String email,
    required String password,
    String? displayName,
  }) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/auth/register',
        data: {
          'email': email,
          'password': password,
          if (displayName != null && displayName.isNotEmpty)
            'displayName': displayName,
        },
      );
      return RegisterResponse.fromJson(res.data ?? {});
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<OkMessageResponse> verifyEmail({
    required String email,
    required String code,
  }) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/auth/verify-email',
        data: {'email': email, 'code': code},
      );
      return OkMessageResponse.fromJson(res.data ?? {'ok': true, 'message': ''});
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<MessageResponse> resendOtp(String email) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/auth/resend-otp',
        data: {'email': email},
      );
      return MessageResponse.fromJson(
        res.data ?? {'message': 'Nếu email tồn tại, mã xác minh đã được gửi.'},
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<AuthUser> login({required String email, required String password}) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/auth/login',
        data: {'email': email, 'password': password},
      );
      final login = LoginResponse.fromJson(res.data ?? {});
      await _api.tokenStore.saveTokens(
        accessToken: login.accessToken,
        refreshToken: login.refreshToken,
      );
      return login.user;
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<AuthUser> loginWithGoogleIdToken(
    String idToken, {
    String? serverAuthCode,
  }) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/auth/google/id-token',
        data: {
          'idToken': idToken,
          if (serverAuthCode != null && serverAuthCode.isNotEmpty)
            'serverAuthCode': serverAuthCode,
        },
      );
      final data = res.data ?? {};
      await _api.tokenStore.saveTokens(
        accessToken: data['accessToken'] as String,
        refreshToken: data['refreshToken'] as String,
      );
      final user = data['user'] as Map<String, dynamic>;
      return AuthUser.fromJson(user);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<MessageResponse> forgotPassword(String email) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/auth/forgot-password',
        data: {'email': email},
      );
      return MessageResponse.fromJson(
        res.data ??
            {
              'message':
                  'Nếu email tồn tại trong hệ thống, mã OTP đã được gửi đến hộp thư của bạn.',
            },
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<OkMessageResponse> resetPassword({
    required String email,
    required String code,
    required String newPassword,
  }) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/auth/reset-password',
        data: {
          'email': email,
          'code': code,
          'newPassword': newPassword,
        },
      );
      // JWT cũ coi như hết hiệu lực sau khi tokenVersion tăng.
      await _api.tokenStore.clear();
      return OkMessageResponse.fromJson(
        res.data ?? {'ok': true, 'message': 'Mật khẩu Vimes đã được cập nhật.'},
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Future<AuthUser?> restoreSession() async {
    final token = await _api.tokenStore.getAccessToken();
    if (token == null || token.isEmpty) return null;
    try {
      final res = await _api.dio.get<Map<String, dynamic>>('/auth/me');
      final me = MeResponse.fromJson(res.data ?? {});
      return me.user.toAuthUser();
    } catch (_) {
      await _api.tokenStore.clear();
      return null;
    }
  }

  Future<void> logout() => _api.tokenStore.clear();
}
