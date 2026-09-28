import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:logger/logger.dart';
import 'package:manage_teams/features/home/data/device_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

/// Best-effort đăng ký push token với backend (Phase 1.7).
/// Nếu Firebase chưa init → dùng token local ổn định (stub sẵn sàng).
class PushTokenService {
  PushTokenService(this._devices);

  final DeviceRepository _devices;
  final _log = Logger();
  static const _prefsKey = 'mt_push_token';
  String? _lastToken;

  String get _platform {
    if (kIsWeb) return 'web';
    try {
      if (Platform.isIOS) return 'ios';
      if (Platform.isAndroid) return 'android';
    } catch (_) {
      // Platform not available
    }
    return 'fcm';
  }

  /// Gọi sau khi user authenticated. Không throw ra UI.
  Future<void> registerAfterLogin() async {
    try {
      final token = await _resolveToken();
      if (token == null || token.length < 8) return;
      await _devices.registerPushToken(platform: _platform, token: token);
      _lastToken = token;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, token);
      _log.i('Push token registered ($_platform)');
    } catch (e, st) {
      _log.w('Push token register skipped: $e', error: e, stackTrace: st);
    }
  }

  /// Gọi khi logout — best effort unregister.
  Future<void> unregisterOnLogout() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = _lastToken ?? prefs.getString(_prefsKey);
      if (token == null || token.isEmpty) return;
      await _devices.unregisterPushToken(token);
      await prefs.remove(_prefsKey);
      _lastToken = null;
    } catch (e, st) {
      _log.w('Push token unregister skipped: $e', error: e, stackTrace: st);
    }
  }

  Future<String?> _resolveToken() async {
    final fcm = await _tryFcmToken();
    if (fcm != null && fcm.length >= 8) return fcm;

    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_prefsKey);
    if (existing != null && existing.length >= 8) return existing;
    return 'dev-${const Uuid().v4()}';
  }

  Future<String?> _tryFcmToken() async {
    try {
      if (Firebase.apps.isEmpty) return null;
      return await FirebaseMessaging.instance.getToken();
    } catch (_) {
      return null;
    }
  }
}
