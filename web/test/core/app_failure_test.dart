import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams_app/core/error/app_failure.dart';

void main() {
  test('parses string error field', () {
    final f = AppFailure.fromBody({'error': 'Sai mật khẩu'}, 401);
    expect(f.message, 'Sai mật khẩu');
  });

  test('parses zod-like details', () {
    final f = AppFailure.fromBody({
      'details': [
        {'path': ['email'], 'message': 'Required'},
      ],
    }, 400);
    expect(f.message, contains('email'));
    expect(f.message, contains('Required'));
  });
}
