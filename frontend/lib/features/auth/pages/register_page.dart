import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';
import 'package:manage_teams/features/auth/data/auth_repository.dart';
import 'package:manage_teams/features/auth/widgets/auth_primary_button.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/features/auth/widgets/auth_responsive_layout.dart';
import 'package:manage_teams/features/auth/widgets/auth_text_field.dart';
import 'package:manage_teams/shared/widgets/app_header.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _agreeTerms = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (!_agreeTerms) {
      SimpleSnackbarService.showWarning('Vui lòng đồng ý điều khoản');
      return;
    }
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    try {
      final result = await context.read<AuthRepository>().register(
            email: email,
            password: password,
            displayName: _nameController.text.trim().isEmpty
                ? null
                : _nameController.text.trim(),
          );
      if (!mounted) return;
      SimpleSnackbarService.showSuccess(result.message);
      context.push(
        AppRoutes.verifyOtp.path,
        extra: {'email': result.email},
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
          'Đăng ký',
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
          'Đăng ký',
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
            const SizedBox(height: 24),
            Text(
              'Tạo tài khoản',
              style: TypoSkin.title1.copyWith(color: ColorSkin.title),
            ),
            const SizedBox(height: 8),
            Text(
              'Điền thông tin để bắt đầu dùng Manage Teams',
              style: TypoSkin.bodyText2.copyWith(
                color: ColorSkin.subtitle,
              ),
            ),
            const SizedBox(height: 24),
            AuthTextField(
              controller: _nameController,
              label: 'Họ và tên',
              hint: 'Nguyễn Văn A',
              textInputAction: TextInputAction.next,
              validator: (value) =>
                  value == null || value.trim().isEmpty
                  ? 'Vui lòng nhập họ tên'
                  : null,
            ),
            const SizedBox(height: 16),
            AuthTextField(
              controller: _emailController,
              label: 'Email',
              hint: 'email@example.com',
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              validator: (value) {
                final email = value?.trim() ?? '';
                if (email.isEmpty) return 'Vui lòng nhập email';
                if (!email.contains('@')) return 'Email không hợp lệ';
                return null;
              },
            ),
            const SizedBox(height: 16),
            AuthTextField(
              controller: _phoneController,
              label: 'Số điện thoại (tuỳ chọn)',
              hint: '09xxxxxxxx',
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 16),
            AuthTextField(
              controller: _passwordController,
              label: 'Mật khẩu',
              hint: 'Tối thiểu 8 ký tự',
              obscureText: _obscurePassword,
              textInputAction: TextInputAction.done,
              suffixIcon: IconButton(
                onPressed: () => setState(
                  () => _obscurePassword = !_obscurePassword,
                ),
                icon: Icon(
                  _obscurePassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: ColorSkin.subtitle,
                ),
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Vui lòng nhập mật khẩu';
                }
                if (value.length < 8) {
                  return 'Mật khẩu tối thiểu 8 ký tự';
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Checkbox(
                  value: _agreeTerms,
                  activeColor: ColorSkin.primary,
                  onChanged: (value) =>
                      setState(() => _agreeTerms = value ?? false),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      'Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật',
                      style: TypoSkin.bodyText2.copyWith(
                        color: ColorSkin.subtitle,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            AuthPrimaryButton(
              label: 'Tiếp tục',
              onPressed: _agreeTerms ? _submit : null,
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'Đã có tài khoản? ',
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
