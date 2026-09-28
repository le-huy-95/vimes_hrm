import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_event.dart';
import 'package:manage_teams/features/auth/data/auth_repository.dart';
import 'package:manage_teams/features/auth/widgets/auth_primary_button.dart';
import 'package:manage_teams/features/auth/widgets/auth_text_field.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_header.dart';
import 'package:pinput/pinput.dart';

class ResetPasswordPage extends StatefulWidget {
  const ResetPasswordPage({
    super.key,
    required this.email,
    this.infoMessage,
  });

  final String email;
  final String? infoMessage;

  @override
  State<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends State<ResetPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _pinController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _focusNode = FocusNode();
  Timer? _countdownTimer;
  int _secondsLeft = 0;
  bool _obscureNewPassword = true;
  bool _obscureConfirmPassword = true;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _pinController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
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

  Future<void> _submit() async {
    final code = _pinController.text.trim();
    if (code.length != 6) {
      SimpleSnackbarService.showWarning('Vui lòng nhập đủ 6 số OTP');
      return;
    }
    if (!_formKey.currentState!.validate()) return;
    try {
      final result = await context.read<AuthRepository>().resetPassword(
            email: widget.email,
            code: code,
            newPassword: _newPasswordController.text,
          );
      if (!mounted) return;
      context.read<AuthBloc>().add(const AuthLogoutRequested());
      if (!mounted) return;
      context.go(
        AppRoutes.login.path,
        extra: {
          'message': result.message.isNotEmpty
              ? result.message
              : 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập.',
        },
      );
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  Future<void> _resend() async {
    try {
      final result =
          await context.read<AuthRepository>().forgotPassword(widget.email);
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
        context.go(AppRoutes.forgotPassword.path);
      },
      child: Scaffold(
        backgroundColor: ColorSkin.white,
        appBar: AppHeader(
          variant: AppHeaderVariant.auth,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new, size: 20),
            onPressed: () {
              if (context.canPop()) {
                context.pop();
              } else {
                context.go(AppRoutes.forgotPassword.path);
              }
            },
          ),
          onTitleTap: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(AppRoutes.forgotPassword.path);
            }
          },
          title: Text(
            'Đặt lại mật khẩu',
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
              child: Form(
                key: _formKey,
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
                      'Nhập OTP và mật khẩu mới',
                      style: TypoSkin.title1.copyWith(color: ColorSkin.title),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: ColorSkin.tealLight.withValues(alpha: 0.45),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: ColorSkin.border1),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.info_outline,
                            color: ColorSkin.primary,
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              widget.infoMessage ??
                                  'Chúng tôi đã gửi mã OTP 6 số tới email của bạn.',
                              style: TypoSkin.bodyText2.copyWith(
                                color: ColorSkin.title,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Nhập mã OTP đã gửi tới ${widget.email}',
                      style: TypoSkin.bodyText2.copyWith(
                        color: ColorSkin.subtitle,
                      ),
                    ),
                    const SizedBox(height: 28),
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
                      ),
                    ),
                    const SizedBox(height: 28),
                    AuthTextField(
                      controller: _newPasswordController,
                      label: 'Mật khẩu mới',
                      hint: 'Tối thiểu 8 ký tự',
                      obscureText: _obscureNewPassword,
                      textInputAction: TextInputAction.next,
                      prefixIcon: const Icon(
                        Icons.lock_outline,
                        color: ColorSkin.primary,
                      ),
                      suffixIcon: IconButton(
                        onPressed: () => setState(
                          () => _obscureNewPassword = !_obscureNewPassword,
                        ),
                        icon: Icon(
                          _obscureNewPassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          color: ColorSkin.subtitle,
                        ),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Vui lòng nhập mật khẩu mới';
                        }
                        if (value.length < 8) {
                          return 'Mật khẩu tối thiểu 8 ký tự';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    AuthTextField(
                      controller: _confirmPasswordController,
                      label: 'Xác nhận mật khẩu',
                      hint: 'Nhập lại mật khẩu mới',
                      obscureText: _obscureConfirmPassword,
                      textInputAction: TextInputAction.done,
                      prefixIcon: const Icon(
                        Icons.lock_outline,
                        color: ColorSkin.primary,
                      ),
                      onFieldSubmitted: (_) => _submit(),
                      suffixIcon: IconButton(
                        onPressed: () => setState(
                          () => _obscureConfirmPassword =
                              !_obscureConfirmPassword,
                        ),
                        icon: Icon(
                          _obscureConfirmPassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          color: ColorSkin.subtitle,
                        ),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Vui lòng xác nhận mật khẩu';
                        }
                        if (value != _newPasswordController.text) {
                          return 'Mật khẩu xác nhận không khớp';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 28),
                    AuthPrimaryButton(
                      label: 'Đặt lại mật khẩu',
                      onPressed: _submit,
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
                                'Gửi lại mã OTP',
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
      ),
    );
  }
}
