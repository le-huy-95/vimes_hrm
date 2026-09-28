import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_state.dart';
import 'package:manage_teams/features/auth/widgets/app_logo.dart';

/// Branded splash — waits for AuthBloc bootstrap; router redirect handles next page.
class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      builder: (context, state) {
        return Scaffold(
          body: DecoratedBox(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  ColorSkin.primary,
                  ColorSkin.primarySub,
                  Color(0xFF084A50),
                ],
              ),
            ),
            child: SafeArea(
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 16,
                  ),
                  decoration: BoxDecoration(
                    color: ColorSkin.white,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const AppLogo(width: 240),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
