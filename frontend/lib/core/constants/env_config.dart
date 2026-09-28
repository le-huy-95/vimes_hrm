import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Environment accessors — values come from project-root `.env`.
class EnvConfig {
  static final _env = dotenv.env['APP_ENV'] ?? 'dev';
  static final String mediaBaseUrl = dotenv.env['API_IMG_URL'] ?? '';

  static const String dev = 'dev';
  static const String prod = 'prod';

  static bool get isDev => _env == dev;
  static bool get isProd => _env == prod;

  static String get baseUrl {
    switch (_env) {
      case dev:
        return dotenv.env['API_DEV_URL'] ?? '';
      case prod:
        return dotenv.env['API_PROD_URL'] ?? '';
      default:
        return '';
    }
  }

  static String get socketUrl {
    switch (_env) {
      case dev:
        return dotenv.env['SOCKET_DEV_URL'] ??
            dotenv.env['SOCKET_BASE_URL'] ??
            '';
      case prod:
        return dotenv.env['SOCKET_PROD_URL'] ??
            dotenv.env['SOCKET_BASE_URL'] ??
            '';
      default:
        return dotenv.env['SOCKET_BASE_URL'] ?? '';
    }
  }

  static String get mapsApiKey => dotenv.env['MAPS_API_KEY'] ?? '';
  static String get googleIosClientId =>
      dotenv.env['GOOGLE_IOS_CLIENT_ID'] ?? '';
  static String get googleServerClientId =>
      dotenv.env['GOOGLE_SERVER_CLIENT_ID'] ?? '';
  static String get googleIosUrlScheme =>
      dotenv.env['GOOGLE_IOS_URL_SCHEME'] ?? '';
  static String get smsBaseUrl => dotenv.env['SMS_BASE_URL'] ?? '';
  static String get smsApiKey => dotenv.env['SMS_API_KEY'] ?? '';
  static String get currency => dotenv.env['CURRENCY'] ?? 'VND';

  static String get notificationApiUrl =>
      dotenv.env['NOTIFICATION_API_URL'] ?? '';

  static String get notificationWsUrl =>
      dotenv.env['NOTIFICATION_WS_URL'] ??
      _wsUrlFromApiUrl(notificationApiUrl);

  static String _wsUrlFromApiUrl(String apiUrl) {
    if (apiUrl.isEmpty) return '';
    var url = apiUrl.replaceFirst('/api/v1', '');
    url = url.replaceFirst('http://', 'ws://').replaceFirst('https://', 'wss://');
    return '$url/notifications';
  }
}
