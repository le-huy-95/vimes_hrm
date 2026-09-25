class AppFailure implements Exception {
  AppFailure(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  factory AppFailure.fromBody(dynamic data, int? statusCode) {
    if (data is Map) {
      final details = data['details'];
      if (details is List && details.isNotEmpty) {
        final parts = details.map((issue) {
          if (issue is! Map) return 'Không hợp lệ';
          final path = issue['path'];
          final prefix = path is List && path.isNotEmpty
              ? '${path.join('.')}: '
              : '';
          return '$prefix${issue['message'] ?? 'Không hợp lệ'}';
        }).join('; ');
        return AppFailure(parts, statusCode: statusCode);
      }
      final err = data['error'];
      if (err is String && err.isNotEmpty) {
        return AppFailure(err, statusCode: statusCode);
      }
      if (err is Map && err['message'] is String) {
        return AppFailure(err['message'] as String, statusCode: statusCode);
      }
    }
    return AppFailure('Yêu cầu thất bại', statusCode: statusCode);
  }

  @override
  String toString() => message;
}
