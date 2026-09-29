import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/auth/data/google_sign_in_helper.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';

/// Google Sign-In trigger — custom button on all platforms (web uses GIS popup).
class GoogleAuthAction extends StatefulWidget {
  const GoogleAuthAction({
    super.key,
    required this.onTokens,
    this.label = 'Tiếp tục với Google',
    this.enabled = true,
  });

  final Future<void> Function(GoogleSignInTokens tokens) onTokens;
  final String label;
  final bool enabled;

  @override
  State<GoogleAuthAction> createState() => _GoogleAuthActionState();
}

class _GoogleAuthActionState extends State<GoogleAuthAction> {
  bool _busy = false;

  Future<void> _pressed() async {
    if (_busy || !widget.enabled) return;
    setState(() => _busy = true);
    try {
      final tokens = await requestGoogleSignInTokens();
      await widget.onTokens(tokens);
    } catch (e) {
      if (!mounted) return;
      SimpleSnackbarService.showError(
        e is ApiException ? e.message : e.toString(),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppButton(
      label: _busy ? 'Đang xử lý…' : widget.label,
      variant: AppButtonVariant.primary,
      expand: true,
      isLoading: _busy,
      onPressed: (_busy || !widget.enabled) ? null : _pressed,
      icon: _busy
          ? null
          : SvgPicture.asset(
              'lib/assets/svg/google_logo.svg',
              width: 18,
              height: 18,
            ),
    );
  }
}
