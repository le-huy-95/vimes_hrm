import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';
import 'package:manage_teams/features/auth/data/auth_repository.dart';
import 'package:manage_teams/features/auth/widgets/auth_primary_button.dart';
import 'package:manage_teams/features/auth/widgets/auth_responsive_layout.dart';
import 'package:manage_teams/features/auth/widgets/auth_text_field.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_header.dart';

class ForgotPasswordPage extends StatefulWidget {
  const ForgotPasswordPage({super.key, this.initialEmail});

  final String? initialEmail;

  @override
  State<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends State<ForgotPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailController;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(text: widget.initialEmail ?? '');
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final email = _emailController.text.trim();
    try {
      final result = await context.read<AuthRepository>().forgotPassword(email);
      if (!mounted) return;
      context.push(
        AppRoutes.resetPassword.path,
        extra: {
          'email': email,
          'message': result.message.isNotEmpty
              ? result.message
              : 'Nếu email tồn tại, mã OTP đã được gửi. Kiểm tra Hộp thư đến và Spam.',
        },
      );
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  Widget _desktopBack(BuildContext context) {
    return Row(
      children: [
        IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => context.go(AppRoutes.login.path),
        ),
        Text(
          'Quên mật khẩu',
          style: TypoSkin.title2.copyWith(color: ColorSkin.title),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return AuthResponsiveLayout(
      appBar: AppHeader(
        variant: AppHeaderVariant.auth,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => context.go(AppRoutes.login.path),
        ),
        onTitleTap: () => context.go(AppRoutes.login.path),
        title: Text(
          'Quên mật khẩu',
          style: TypoSkin.title2.copyWith(color: ColorSkin.title),
        ),
      ),
      desktopBack: _desktopBack(context),
      form: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Bước 1 / 2',
              style: TypoSkin.bodyText2.copyWith(
                color: ColorSkin.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: const LinearProgressIndicator(
                value: 0.5,
                minHeight: 8,
                backgroundColor: ColorSkin.tealLight,
                color: ColorSkin.primary,
              ),
            ),
            const SizedBox(height: 28),
            Text(
              'Nhập email của bạn',
              style: TypoSkin.title1.copyWith(color: ColorSkin.title),
            ),
            const SizedBox(height: 8),
            Text(
              'Nhập email đã đăng ký. Nếu email tồn tại trong hệ thống, '
              'bạn sẽ nhận được mã OTP 6 số qua email để đặt lại mật khẩu. '
              'Hãy kiểm tra cả Hộp thư đến và Spam.',
              style: TypoSkin.bodyText2.copyWith(
                color: ColorSkin.subtitle,
              ),
            ),
            const SizedBox(height: 28),
            AuthTextField(
              controller: _emailController,
              label: 'Email',
              hint: 'email@example.com',
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.done,
              prefixIcon: const Icon(
                Icons.email_outlined,
                color: ColorSkin.primary,
              ),
              onFieldSubmitted: (_) => _submit(),
              validator: (value) {
                final email = value?.trim() ?? '';
                if (email.isEmpty) return 'Vui lòng nhập email';
                if (!email.contains('@')) return 'Email không hợp lệ';
                return null;
              },
            ),
            const SizedBox(height: 24),
            AuthPrimaryButton(
              label: 'Gửi mã OTP',
              onPressed: _submit,
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'Nhớ mật khẩu? ',
                  style: TypoSkin.bodyText2.copyWith(
                    color: ColorSkin.subtitle,
                  ),
                ),
                GestureDetector(
                  onTap: () => context.go(AppRoutes.login.path),
                  child: Text(
                    'Đăng nhập',
                    style: TypoSkin.bodyText2.copyWith(
                      color: ColorSkin.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
