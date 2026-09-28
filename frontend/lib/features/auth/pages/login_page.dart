import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/core/constants/env_config.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_event.dart';
import 'package:manage_teams/features/auth/bloc/auth_state.dart';
import 'package:manage_teams/features/auth/data/auth_repository.dart';
import 'package:manage_teams/features/auth/widgets/auth_primary_button.dart';
import 'package:manage_teams/features/auth/widgets/auth_responsive_layout.dart';
import 'package:manage_teams/features/auth/widgets/auth_text_field.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, this.infoMessage});

  final String? infoMessage;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _credentialsController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _rememberMe = true;
  bool _obscurePassword = true;
  bool _shownInfo = false;
  bool _googleBusy = false;

  @override
  void initState() {
    super.initState();
    final message = widget.infoMessage;
    if (message != null && message.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_shownInfo && mounted) {
          _shownInfo = true;
          SimpleSnackbarService.showSuccess(message);
        }
      });
    }
  }

  @override
  void dispose() {
    _credentialsController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final email = _credentialsController.text.trim();
    context.read<AuthBloc>().add(
          AuthLoginRequested(
            email: email,
            password: _passwordController.text,
          ),
        );
  }

  Future<void> _loginWithGoogle() async {
    if (_googleBusy) return;
    setState(() => _googleBusy = true);
    try {
      const tasksScopes = <String>[
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ];
      final google = GoogleSignIn.instance;
      await google.initialize(
        serverClientId: EnvConfig.googleServerClientId.isEmpty
            ? null
            : EnvConfig.googleServerClientId,
        clientId: EnvConfig.googleIosClientId.isEmpty
            ? null
            : EnvConfig.googleIosClientId,
      );
      final account = await google.authenticate(scopeHint: tasksScopes);
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        SimpleSnackbarService.showError('Không lấy được Google idToken');
        return;
      }
      String? serverAuthCode;
      try {
        final serverAuth =
            await account.authorizationClient.authorizeServer(tasksScopes);
        serverAuthCode = serverAuth?.serverAuthCode;
      } catch (_) {
        // Đăng nhập vẫn tiếp tục; sync Tasks có thể chưa sẵn sàng
      }
      if (!mounted) return;
      context.read<AuthBloc>().add(
            AuthGoogleLoginRequested(
              idToken: idToken,
              serverAuthCode: serverAuthCode,
            ),
          );
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    } finally {
      if (mounted) setState(() => _googleBusy = false);
    }
  }

  Future<void> _onAuthFailure(AuthFailure state) async {
    if (state.code == 'EMAIL_NOT_VERIFIED') {
      final email = state.email ?? _credentialsController.text.trim();
      SimpleSnackbarService.showWarning(
        state.message.isNotEmpty ? state.message : 'Email chưa xác minh',
      );
      if (email.isNotEmpty) {
        try {
          await context.read<AuthRepository>().resendOtp(email);
        } catch (_) {}
        if (!mounted) return;
        context.push(
          AppRoutes.verifyOtp.path,
          extra: {'email': email},
        );
      }
      return;
    }
    SimpleSnackbarService.showError(state.message);
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AuthBloc, AuthState>(
      listenWhen: (previous, current) => current is AuthFailure,
      listener: (context, state) {
        if (state is AuthFailure) {
          _onAuthFailure(state);
        }
      },
      buildWhen: (previous, current) =>
          current is AuthLoading ||
          current is AuthFailure ||
          current is AuthUnauthenticated ||
          current is AuthAuthenticated,
      builder: (context, state) {
        final busy = state is AuthLoading || _googleBusy;
        return AuthResponsiveLayout(
          showMobileLogo: true,
          form: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Chào mừng trở lại',
                  textAlign: TextAlign.center,
                  style: TypoSkin.title1.copyWith(color: ColorSkin.title),
                ),
                const SizedBox(height: 8),
                Text(
                  'Đăng nhập để quản lý nhóm và dự án',
                  textAlign: TextAlign.center,
                  style: TypoSkin.bodyText2.copyWith(color: ColorSkin.subtitle),
                ),
                const SizedBox(height: 32),
                AuthTextField(
                  controller: _credentialsController,
                  label: 'Email',
                  hint: 'vd: admin@example.com',
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  prefixIcon: const Icon(
                    Icons.person_outline,
                    color: ColorSkin.primary,
                  ),
                  validator: (value) => value == null || value.trim().isEmpty
                      ? 'Vui lòng nhập email'
                      : null,
                ),
                const SizedBox(height: 16),
                AuthTextField(
                  controller: _passwordController,
                  label: 'Mật khẩu',
                  obscureText: _obscurePassword,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  prefixIcon: const Icon(
                    Icons.lock_outline,
                    color: ColorSkin.primary,
                  ),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscurePassword
                          ? Icons.visibility_off
                          : Icons.visibility,
                    ),
                    onPressed: () =>
                        setState(() => _obscurePassword = !_obscurePassword),
                  ),
                  validator: (value) => value == null || value.isEmpty
                      ? 'Vui lòng nhập mật khẩu'
                      : null,
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Checkbox(
                      value: _rememberMe,
                      onChanged: (v) =>
                          setState(() => _rememberMe = v ?? true),
                    ),
                    const Text('Ghi nhớ đăng nhập'),
                    const Spacer(),
                    TextButton(
                      onPressed: () =>
                          context.go(AppRoutes.forgotPassword.path),
                      child: const Text('Quên mật khẩu?'),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                AuthPrimaryButton(
                  label: busy ? 'Đang đăng nhập…' : 'Đăng nhập',
                  onPressed: busy ? null : _submit,
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: busy ? null : _loginWithGoogle,
                  icon: SvgPicture.asset(
                    'lib/assets/svg/google_logo.svg',
                    width: 18,
                    height: 18,
                  ),
                  label: const Text('Đăng nhập với Google'),
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => context.go(AppRoutes.register.path),
                  child: const Text('Chưa có tài khoản? Đăng ký'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
