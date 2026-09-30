import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams/features/home/widgets/home_member_actions.dart';
import 'package:manage_teams/features/home/widgets/role_label.dart';

void main() {
  group('roleLabelVi', () {
    test('maps known roles', () {
      expect(roleLabelVi('OWNER'), 'Chủ sở hữu');
      expect(roleLabelVi('ADMIN'), 'Quản trị');
      expect(roleLabelVi('MEMBER'), 'Thành viên');
    });

    test('falls back for null/unknown', () {
      expect(roleLabelVi(null), '—');
      expect(roleLabelVi(''), '—');
      expect(roleLabelVi('CUSTOM'), 'CUSTOM');
    });
  });

  group('canShowRemoveMember', () {
    test('false when viewer is not group admin', () {
      expect(
        canShowRemoveMember(
          groupAdmin: false,
          currentUserId: 'me',
          memberUserId: 'other',
        ),
        isFalse,
      );
    });

    test('false when row is self', () {
      expect(
        canShowRemoveMember(
          groupAdmin: true,
          currentUserId: 'me',
          memberUserId: 'me',
        ),
        isFalse,
      );
    });

    test('true when admin removing someone else', () {
      expect(
        canShowRemoveMember(
          groupAdmin: true,
          currentUserId: 'me',
          memberUserId: 'other',
        ),
        isTrue,
      );
    });

    test('false when currentUserId is null', () {
      expect(
        canShowRemoveMember(
          groupAdmin: true,
          currentUserId: null,
          memberUserId: 'other',
        ),
        isFalse,
      );
    });
  });
}
