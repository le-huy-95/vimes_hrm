import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams_app/domain/repositories/auth_repository.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_event.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_state.dart';
import 'package:manage_teams_app/shared/widgets/password_field.dart';
import 'package:url_launcher/url_launcher.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool? _googleEnabled;

  @override
  void initState() {
    super.initState();
    context.read<AuthRepository>().isGoogleLoginEnabled().then((v) {
      if (mounted) setState(() => _googleEnabled = v);
    });
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Card(
            margin: const EdgeInsets.all(24),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: BlocConsumer<AuthBloc, AuthState>(
                listener: (context, state) {
                  if (state is AuthAuthenticated) context.go('/');
                },
                builder: (context, state) {
                  final loading = state is AuthLoading;
                  final message =
                      state is AuthUnauthenticated ? state.message : null;
                  return Form(
                    key: _formKey,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'Manage Teams',
                          style: Theme.of(context).textTheme.headlineSmall,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Đăng nhập',
                          style: Theme.of(context).textTheme.titleMedium,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 24),
                        TextFormField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            border: OutlineInputBorder(),
                          ),
                          validator: (v) =>
                              (v == null || v.isEmpty) ? 'Bắt buộc' : null,
                        ),
                        const SizedBox(height: 12),
                        PasswordField(
                          controller: _password,
                          validator: (v) =>
                              (v == null || v.isEmpty) ? 'Bắt buộc' : null,
                        ),
                        if (message != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            message,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ],
                        const SizedBox(height: 20),
                        FilledButton(
                          onPressed: loading
                              ? null
                              : () {
                                  if (!_formKey.currentState!.validate()) {
                                    return;
                                  }
                                  context.read<AuthBloc>().add(
                                        AuthLoginSubmitted(
                                          email: _email.text.trim(),
                                          password: _password.text,
                                        ),
                                      );
                                },
                          child: loading
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Text('Đăng nhập'),
                        ),
                        if (_googleEnabled == true) ...[
                          const SizedBox(height: 12),
                          OutlinedButton.icon(
                            onPressed: loading
                                ? null
                                : () async {
                                    final url = Uri.parse(
                                      context
                                          .read<AuthRepository>()
                                          .googleLoginUrl,
                                    );
                                    await launchUrl(
                                      url,
                                      mode: LaunchMode.platformDefault,
                                      webOnlyWindowName: '_self',
                                    );
                                  },
                            icon: const Icon(Icons.login),
                            label: const Text('Đăng nhập Google'),
                          ),
                        ],
                        const SizedBox(height: 12),
                        TextButton(
                          onPressed: () => context.go('/register'),
                          child: const Text('Tạo tài khoản'),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}
