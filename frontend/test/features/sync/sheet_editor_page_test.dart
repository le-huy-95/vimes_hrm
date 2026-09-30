import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams/features/sync/pages/sheet_editor_page.dart';
import 'package:manage_teams/features/sync/widgets/sheet_embed_view.dart';

void main() {
  tearDown(() {
    debugForceSheetEmbedUnsupported = false;
  });

  testWidgets('local matrix shows message and no open button', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: SheetEditorPage(
          groupId: 'g1',
          sheetTitle: 'Tasks',
          isLocalMatrix: true,
          popOnGroupChange: false,
        ),
      ),
    );
    expect(find.textContaining('Sheet local'), findsOneWidget);
    expect(find.text('Mở Google Sheets'), findsNothing);
    expect(find.text('Đẩy lên Sheet'), findsNothing);
  });

  testWidgets('LIVE shows title back and open-external', (tester) async {
    debugForceSheetEmbedUnsupported = true;
    await tester.pumpWidget(
      const MaterialApp(
        home: SheetEditorPage(
          groupId: 'g1',
          sheetTitle: 'Tasks',
          spreadsheetUrl:
              'https://docs.google.com/spreadsheets/d/abc/edit',
          isLocalMatrix: false,
          popOnGroupChange: false,
        ),
      ),
    );
    expect(find.text('Tasks'), findsOneWidget);
    expect(find.byTooltip('Quay lại'), findsOneWidget);
    expect(find.text('Mở ngoài'), findsOneWidget);
    expect(find.text('Đẩy lên Sheet'), findsOneWidget);
  });
}
