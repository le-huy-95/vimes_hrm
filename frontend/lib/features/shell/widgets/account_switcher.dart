import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_event.dart';
import 'package:manage_teams/features/auth/bloc/auth_state.dart';
import 'package:manage_teams/features/auth/data/auth_repository.dart';
import 'package:manage_teams/features/auth/data/google_sign_in_helper.dart';
import 'package:manage_teams/features/sync/bloc/sync_bloc.dart';
import 'package:manage_teams/features/sync/bloc/sync_event.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';

/// Header control: primary Google email + menu to switch primary / link more.
class AccountSwitcher extends StatefulWidget {
  const AccountSwitcher({super.key});

  @override
  State<AccountSwitcher> createState() => _AccountSwitcherState();
}

class _AccountSwitcherState extends State<AccountSwitcher> {
  final MenuController _menu = MenuController();
  bool _busy = false;

  GoogleAccountBrief? _primaryOf(AuthAuthenticated auth) {
    final accounts = auth.user.googleAccounts;
    for (final a in accounts) {
      if (a.isPrimary) return a;
    }
    return accounts.isEmpty ? null : accounts.first;
  }

  Future<void> _linkGoogle() async {
    if (_busy) return;
    setState(() => _busy = true);
    _menu.close();
    try {
      final tokens = await requestGoogleSignInTokens();
      if (!mounted) return;
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
      context.read<SyncBloc>().add(const SyncRefreshRequested());
    } catch (e) {
      final message = e is ApiException ? e.message : e.toString();
      SimpleSnackbarService.showError(message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setPrimary(GoogleAccountBrief account) async {
    if (_busy || account.isPrimary) return;
    _menu.close();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Đổi Primary Google?'),
        content: const Text(
          'Liên kết Tasks / Sheets / Chat Google của tài khoản cũ sẽ bị gỡ. '
          'Dữ liệu task và chat trong Vimes được giữ. Đồng bộ sẽ dùng Google mới.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Xác nhận đổi'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final repo = context.read<AuthRepository>();
      final result = await repo.setGoogleAccountPrimary(account.googleSub);
      final user = await repo.fetchMe();
      if (!mounted) return;
      SimpleSnackbarService.showSuccess(result.message);
      context.read<AuthBloc>().add(AuthGoogleLinked(user));
      context.read<SyncBloc>().add(const SyncRefreshRequested());
    } catch (e) {
      final message = e is ApiException ? e.message : e.toString();
      SimpleSnackbarService.showError(message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      builder: (context, state) {
        if (state is! AuthAuthenticated) {
          return const SizedBox.shrink();
        }
        final primary = _primaryOf(state);
        final line1 = primary?.email ??
            (state.user.googleAccounts.isEmpty
                ? state.user.email
                : (state.user.googleAccounts.first.email ??
                    state.user.email));
        final line2 = state.user.googleAccounts.isEmpty
            ? 'Liên kết Google'
            : 'Google primary';

        return MenuAnchor(
          controller: _menu,
          alignmentOffset: const Offset(0, 4),
          style: MenuStyle(
            backgroundColor: WidgetStatePropertyAll(ColorSkin.white),
            elevation: const WidgetStatePropertyAll(8),
            shape: WidgetStatePropertyAll(
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(vertical: 6)),
          ),
          menuChildren: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Google đang liên kết',
                    style: TextStyle(
                      fontSize: 11,
                      color: ColorSkin.subtitle,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    line1,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: ColorSkin.title,
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            if (state.user.googleAccounts.isEmpty)
              MenuItemButton(
                onPressed: _busy ? null : _linkGoogle,
                child: const Text('Liên kết Google'),
              )
            else ...[
              for (final a in state.user.googleAccounts)
                MenuItemButton(
                  onPressed: _busy || a.isPrimary
                      ? null
                      : () => _setPrimary(a),
                  trailingIcon: a.isPrimary
                      ? const Text(
                          'Primary',
                          style: TextStyle(
                            fontSize: 11,
                            color: ColorSkin.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        )
                      : null,
                  child: Text(
                    a.email ?? a.googleSub,
                    style: TextStyle(
                      fontWeight:
                          a.isPrimary ? FontWeight.w700 : FontWeight.w500,
                      color: ColorSkin.title,
                    ),
                  ),
                ),
              MenuItemButton(
                onPressed: _busy ? null : _linkGoogle,
                child: Text(
                  _busy ? 'Đang liên kết…' : '+ Liên kết email khác',
                  style: const TextStyle(
                    color: ColorSkin.primary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ],
          builder: (context, controller, child) {
            return Material(
              color: ColorSkin.tealLight,
              borderRadius: BorderRadius.circular(10),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: _busy
                    ? null
                    : () {
                        if (controller.isOpen) {
                          controller.close();
                        } else {
                          controller.open();
                        }
                      },
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              line1,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: ColorSkin.primarySub,
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                              ),
                            ),
                            Text(
                              line2,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: ColorSkin.primarySub.withValues(
                                  alpha: 0.85,
                                ),
                                fontSize: 10,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 4),
                      if (_busy)
                        const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      else
                        const Icon(
                          Icons.expand_more,
                          size: 18,
                          color: ColorSkin.primarySub,
                        ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}
