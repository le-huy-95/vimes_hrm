import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';
import 'package:manage_teams/features/auth/data/auth_repository.dart';
import 'package:manage_teams/features/auth/widgets/auth_primary_button.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_header.dart';
import 'package:pinput/pinput.dart';

class VerifyOtpPage extends StatefulWidget {
  const VerifyOtpPage({super.key, this.email, this.phone});

  final String? email;
  final String? phone;

  @override
  State<VerifyOtpPage> createState() => _VerifyOtpPageState();
}

class _VerifyOtpPageState extends State<VerifyOtpPage> {
  final _pinController = TextEditingController();
  final _focusNode = FocusNode();
  Timer? _countdownTimer;
  int _secondsLeft = 0;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _pinController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    final target = DateTime.now().add(const Duration(seconds: 60));
    void tick() {
      final left = target.difference(DateTime.now()).inSeconds;
      if (!mounted) return;
      setState(() => _secondsLeft = left > 0 ? left : 0);
      if (left <= 0) _countdownTimer?.cancel();
    }

    tick();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) => tick());
  }

  String get _destination {
    if (widget.email != null && widget.email!.isNotEmpty) return widget.email!;
    if (widget.phone != null && widget.phone!.isNotEmpty) return widget.phone!;
    return 'email/SĐT của bạn';
  }

  void _goBackToRegister() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.register.path);
    }
  }

  Future<void> _confirm() async {
    final code = _pinController.text.trim();
    if (code.length != 6) {
      SimpleSnackbarService.showWarning('Vui lòng nhập đủ 6 số OTP');
      return;
    }
    final email = widget.email?.trim() ?? '';
    if (email.isEmpty) {
      SimpleSnackbarService.showError('Thiếu email để xác minh');
      return;
    }
    try {
      final result = await context.read<AuthRepository>().verifyEmail(
            email: email,
            code: code,
          );
      if (!mounted) return;
      context.go(
        AppRoutes.login.path,
        extra: {
          'message': result.message.isNotEmpty
              ? result.message
              : 'Xác minh thành công. Vui lòng đăng nhập.',
        },
      );
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  Future<void> _resend() async {
    final email = widget.email?.trim() ?? '';
    if (email.isEmpty) {
      SimpleSnackbarService.showError('Thiếu email để gửi lại mã');
      return;
    }
    try {
      final result = await context.read<AuthRepository>().resendOtp(email);
      if (!mounted) return;
      SimpleSnackbarService.showSuccess(result.message);
      _pinController.clear();
      _startCountdown();
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final defaultPinTheme = PinTheme(
      width: 48,
      height: 56,
      textStyle: TypoSkin.title2.copyWith(color: ColorSkin.title),
      decoration: BoxDecoration(
        color: ColorSkin.tealLight.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ColorSkin.border1),
      ),
    );

    return PopScope(
      canPop: context.canPop(),
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        context.go(AppRoutes.register.path);
      },
      child: Scaffold(
        backgroundColor: ColorSkin.white,
        appBar: AppHeader(
          variant: AppHeaderVariant.auth,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new, size: 20),
            onPressed: _goBackToRegister,
          ),
          onTitleTap: _goBackToRegister,
          title: Text(
            'Xác minh OTP',
            style: TypoSkin.title2.copyWith(color: ColorSkin.title),
          ),
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
            child: GestureDetector(
              onTap: () =>
                  FocusScope.of(context, createDependency: false).unfocus(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Bước 2 / 2',
                    style: TypoSkin.bodyText2.copyWith(
                      color: ColorSkin.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: const LinearProgressIndicator(
                      value: 1,
                      minHeight: 8,
                      backgroundColor: ColorSkin.tealLight,
                      color: ColorSkin.primary,
                    ),
                  ),
                  const SizedBox(height: 28),
                  Text(
                    'Nhập mã xác minh',
                    style: TypoSkin.title1.copyWith(color: ColorSkin.title),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Chúng tôi đã gửi mã 6 số tới $_destination',
                    style: TypoSkin.bodyText2.copyWith(
                      color: ColorSkin.subtitle,
                    ),
                  ),
                  const SizedBox(height: 32),
                  Center(
                    child: Pinput(
                      length: 6,
                      controller: _pinController,
                      focusNode: _focusNode,
                      onTapOutside: (_) => FocusScope.of(
                        context,
                        createDependency: false,
                      ).unfocus(),
                      defaultPinTheme: defaultPinTheme,
                      focusedPinTheme: defaultPinTheme.copyWith(
                        decoration: defaultPinTheme.decoration!.copyWith(
                          border: Border.all(
                            color: ColorSkin.primary,
                            width: 1.6,
                          ),
                        ),
                      ),
                      submittedPinTheme: defaultPinTheme.copyWith(
                        decoration: defaultPinTheme.decoration!.copyWith(
                          color: ColorSkin.tealLight,
                          border: Border.all(color: ColorSkin.primary),
                        ),
                      ),
                      onCompleted: (_) => _confirm(),
                    ),
                  ),
                  const SizedBox(height: 28),
                  AuthPrimaryButton(
                    label: 'Xác nhận',
                    onPressed: _confirm,
                  ),
                  const SizedBox(height: 20),
                  Center(
                    child: _secondsLeft > 0
                        ? Text(
                            'Gửi lại sau ${_secondsLeft}s',
                            style: TypoSkin.bodyText2.copyWith(
                              color: ColorSkin.subtitle,
                            ),
                          )
                        : TextButton(
                            onPressed: _resend,
                            child: Text(
                              'Gửi lại mã',
                              style: TypoSkin.bodyText2.copyWith(
                                color: ColorSkin.secondary1,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
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
