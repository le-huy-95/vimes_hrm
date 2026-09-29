import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_event.dart';
import 'package:manage_teams/features/auth/data/auth_repository.dart';
import 'package:manage_teams/features/auth/data/google_sign_in_helper.dart';
import 'package:manage_teams/features/auth/widgets/google_auth_action.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';

/// Bắt buộc liên kết Google sau login email/password (chưa có googleAccounts).
class LinkGooglePage extends StatefulWidget {
  const LinkGooglePage({super.key});

  @override
  State<LinkGooglePage> createState() => _LinkGooglePageState();
}

class _LinkGooglePageState extends State<LinkGooglePage> {
  bool _busy = false;

  Future<void> _onTokens(GoogleSignInTokens tokens) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final repo = context.read<AuthRepository>();
      final result = await repo.linkGoogleWithIdToken(
        tokens.idToken,
        serverAuthCode: tokens.serverAuthCode,
        redirectUri: tokens.redirectUri,
      );
      final user = await repo.fetchMe();
      if (!mounted) return;
      SimpleSnackbarService.showSuccess(result.message);
      context.read<AuthBloc>().add(AuthGoogleLinked(user));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F9FA),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: ColorSkin.tealLight,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.cloud_sync_outlined,
                      color: ColorSkin.primary,
                      size: 32,
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Liên kết Google để tiếp tục',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: ColorSkin.title,
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Tài khoản email Vimes cần liên kết Google '
                    '(cùng email) để đồng bộ Tasks, Sheets và Drive.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: ColorSkin.subtitle,
                      fontSize: 14,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 28),
                  GoogleAuthAction(
                    label: 'Liên kết Google',
                    enabled: !_busy,
                    onTokens: _onTokens,
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () => context
                            .read<AuthBloc>()
                            .add(const AuthLogoutRequested()),
                    child: const Text('Đăng xuất'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
