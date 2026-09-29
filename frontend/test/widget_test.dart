import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams/app/app.dart';
import 'package:manage_teams/features/auth/widgets/app_logo.dart';

void main() {
  testWidgets('splash then navigates to login', (tester) async {
    await tester.pumpWidget(const ManageTeamsApp());
    await tester.pump();

    expect(find.byType(AppLogo), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 800));
    await tester.pumpAndSettle();

    expect(find.text('Chào mừng trở lại'), findsOneWidget);
  });
}
