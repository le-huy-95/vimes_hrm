import 'package:manage_teams/core/constants/env_config.dart';

/// Giải quyết URL tĩnh (ảnh/file) trả về từ backend.
///
/// Backend thường trả về đường dẫn tương đối (vd `/inventory/uploads/x.png`),
/// nên cần ghép với `API_IMG_URL` để tạo URL tuyệt đối hiển thị được.
/// URL đã có scheme (http/https) và không phải loopback thì giữ nguyên.
///
/// Không gắn query cache-bust vào URL — media có auth dễ bị 403/lỗi khi
/// thêm `?v=`. Bust cache ở [AppNetworkImage] qua header / ImageCache.
String? resolveMediaUrl(String? rawUrl) {
  final raw = rawUrl?.trim();
  if (raw == null || raw.isEmpty) return null;

  final uri = Uri.tryParse(raw);
  if (uri == null) return raw;

  final base = EnvConfig.mediaBaseUrl.trim();
  final baseUri = base.isEmpty ? null : Uri.tryParse(base);
  final isLoopbackHost = uri.host == 'localhost' ||
      uri.host == '127.0.0.1' ||
      uri.host == '::1';

  if (uri.hasScheme && !isLoopbackHost) {
    return raw;
  }

  final path =
      uri.hasScheme ? uri.path : (raw.startsWith('/') ? raw : '/$raw');
  final relativePath = path.startsWith('/') ? path.substring(1) : path;

  if (baseUri == null) {
    return uri.hasScheme && isLoopbackHost
        ? null
        : (raw.startsWith('/') ? raw : '/$raw');
  }

  return baseUri.resolve(relativePath).toString();
}
