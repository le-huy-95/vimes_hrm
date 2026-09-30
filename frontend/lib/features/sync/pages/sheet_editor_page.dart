import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/sync/bloc/sync_bloc.dart';
import 'package:manage_teams/features/sync/bloc/sync_event.dart';
import 'package:manage_teams/features/sync/widgets/sheet_embed_view.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:url_launcher/url_launcher.dart';

class SheetEditorPage extends StatelessWidget {
  const SheetEditorPage({
    super.key,
    required this.groupId,
    this.sheetTitle,
    this.spreadsheetUrl,
    this.isLocalMatrix = false,
    this.popOnGroupChange = true,
  });

  final String groupId;
  final String? sheetTitle;
  final String? spreadsheetUrl;
  final bool isLocalMatrix;
  /// When false (widget tests), skip WorkspaceBloc listener.
  final bool popOnGroupChange;

  Future<void> _openExternal(String url) async {
    final ok = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    );
    if (!ok) {
      SimpleSnackbarService.showError('Không mở được Google Sheets');
    }
  }

  @override
  Widget build(BuildContext context) {
    final scaffold = Scaffold(
      backgroundColor: ColorSkin.themeBackground,
      appBar: AppBar(
        backgroundColor: ColorSkin.themeBackground,
        elevation: 0,
        leading: IconButton(
          tooltip: 'Quay lại',
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (context.canPop()) context.pop();
          },
        ),
        title: Text(
          sheetTitle?.trim().isNotEmpty == true ? sheetTitle! : 'Sheet nhóm',
          style: const TextStyle(
            color: ColorSkin.title,
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
        actions: [
          if (!isLocalMatrix && spreadsheetUrl != null) ...[
            TextButton(
              onPressed: () =>
                  context.read<SyncBloc>().add(const SyncSheetPushRequested()),
              child: const Text('Đẩy lên Sheet'),
            ),
            TextButton(
              onPressed: () =>
                  context.read<SyncBloc>().add(const SyncSheetPullRequested()),
              child: const Text('Kéo từ Sheet'),
            ),
            TextButton(
              onPressed: () => _openExternal(spreadsheetUrl!),
              child: const Text('Mở ngoài'),
            ),
          ],
        ],
      ),
      body: _buildBody(),
    );

    if (!popOnGroupChange) return scaffold;

    return BlocListener<WorkspaceBloc, WorkspaceState>(
      listenWhen: (prev, next) {
        final prevId = prev is WorkspaceReady ? prev.selectedGroupId : null;
        final nextId = next is WorkspaceReady ? next.selectedGroupId : null;
        return prevId != nextId;
      },
      listener: (context, state) {
        final selected =
            state is WorkspaceReady ? state.selectedGroupId : null;
        if (selected != groupId && context.canPop()) {
          context.pop();
        }
      },
      child: scaffold,
    );
  }

  Widget _buildBody() {
    if (isLocalMatrix || spreadsheetUrl == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Sheet local (dev) — bật GOOGLE_SHEETS_LIVE và Ensure để mở Google Sheets thật.',
            textAlign: TextAlign.center,
            style: TextStyle(color: ColorSkin.subtitle),
          ),
        ),
      );
    }

    return Column(
      children: [
        if (!supportsInAppSheetEmbed())
          Material(
            color: ColorSkin.orangeLight.withValues(alpha: 0.7),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Nền tảng này mở Sheets ngoài app.',
                      style: TextStyle(fontSize: 13, color: ColorSkin.title),
                    ),
                  ),
                  AppButton(
                    label: 'Mở Google Sheets',
                    variant: AppButtonVariant.primary,
                    onPressed: () => _openExternal(spreadsheetUrl!),
                  ),
                ],
              ),
            ),
          ),
        Expanded(child: SheetEmbedView(url: spreadsheetUrl!)),
      ],
    );
  }
}
