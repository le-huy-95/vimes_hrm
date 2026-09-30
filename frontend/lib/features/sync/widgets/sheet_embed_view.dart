import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Test override — set true to force external-only path in widget tests.
bool debugForceSheetEmbedUnsupported = false;

bool supportsInAppSheetEmbed() {
  if (debugForceSheetEmbedUnsupported) return false;
  if (kIsWeb) return false;
  switch (defaultTargetPlatform) {
    case TargetPlatform.android:
    case TargetPlatform.iOS:
    case TargetPlatform.macOS:
      return true;
    default:
      return false;
  }
}

class SheetEmbedView extends StatefulWidget {
  const SheetEmbedView({
    super.key,
    required this.url,
    this.onWebResourceError,
  });

  final String url;
  final void Function(String message)? onWebResourceError;

  @override
  State<SheetEmbedView> createState() => _SheetEmbedViewState();
}

class _SheetEmbedViewState extends State<SheetEmbedView> {
  WebViewController? _controller;
  var _failed = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (!supportsInAppSheetEmbed()) return;
    try {
      final c = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setNavigationDelegate(
          NavigationDelegate(
            onWebResourceError: (err) {
              setState(() {
                _failed = true;
                _error = err.description;
              });
              widget.onWebResourceError?.call(err.description);
            },
          ),
        )
        ..loadRequest(Uri.parse(widget.url));
      _controller = c;
    } catch (e) {
      _failed = true;
      _error = e.toString();
    }
  }

  Future<void> _openExternal() async {
    final uri = Uri.parse(widget.url);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    if (!supportsInAppSheetEmbed()) {
      return _Fallback(
        message:
            'Chỉnh sửa trong app hỗ trợ trên Android, iOS và macOS. Mở Google Sheets trên trình duyệt.',
        onOpen: _openExternal,
      );
    }
    if (_failed) {
      return _Fallback(
        message: _error ?? 'Không tải được Google Sheets trong app.',
        onOpen: _openExternal,
      );
    }
    final c = _controller;
    if (c == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return WebViewWidget(controller: c);
  }
}

class _Fallback extends StatelessWidget {
  const _Fallback({required this.message, required this.onOpen});

  final String message;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: ColorSkin.subtitle),
            ),
            const SizedBox(height: 16),
            AppButton(
              label: 'Mở Google Sheets',
              variant: AppButtonVariant.primary,
              onPressed: onOpen,
            ),
          ],
        ),
      ),
    );
  }
}
