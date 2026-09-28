import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/auth/widgets/app_logo.dart';

/// Splits auth screens on wide viewports: logo 1/4 left, form 3/4 right.
/// Narrow / mobile keeps a single-column layout.
class AuthResponsiveLayout extends StatelessWidget {
  const AuthResponsiveLayout({
    super.key,
    required this.form,
    this.appBar,
    this.showMobileLogo = false,
    this.desktopBack,
    this.breakpoint = 900,
  });

  /// Form content (fields, CTAs). Same widget used on mobile and desktop.
  final Widget form;

  /// Shown only on mobile / narrow layouts.
  final PreferredSizeWidget? appBar;

  /// When true, shows [AppLogo] above the form on mobile (e.g. login).
  final bool showMobileLogo;

  /// Optional back control shown at the top of the desktop form panel.
  final Widget? desktopBack;

  /// Width at or above which the split layout is used.
  final double breakpoint;

  bool _isWide(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= breakpoint;

  @override
  Widget build(BuildContext context) {
    if (_isWide(context)) {
      return Scaffold(
        backgroundColor: ColorSkin.white,
        body: Row(
          children: [
            Expanded(
              flex: 1,
              child: _BrandPanel(),
            ),
            Expanded(
              flex: 3,
              child: ColoredBox(
                color: ColorSkin.white,
                child: SafeArea(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: SingleChildScrollView(
                        keyboardDismissBehavior:
                            ScrollViewKeyboardDismissBehavior.onDrag,
                        padding: const EdgeInsets.fromLTRB(48, 40, 48, 40),
                        child: GestureDetector(
                          onTap: () => FocusScope.of(
                            context,
                            createDependency: false,
                          ).unfocus(),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (desktopBack != null) ...[
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: desktopBack!,
                                ),
                                const SizedBox(height: 16),
                              ],
                              form,
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: ColorSkin.white,
      appBar: appBar,
      body: SafeArea(
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(
            24,
            showMobileLogo ? 32 : 8,
            24,
            24,
          ),
          child: GestureDetector(
            onTap: () =>
                FocusScope.of(context, createDependency: false).unfocus(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (showMobileLogo) ...[
                  const Center(child: AppLogo(width: 260)),
                  const SizedBox(height: 28),
                ],
                form,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BrandPanel extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            ColorSkin.tealLight,
            ColorSkin.white,
          ],
        ),
      ),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final logoWidth =
                  (constraints.maxWidth * 0.72).clamp(120.0, 280.0);
              return AppLogo(width: logoWidth);
            },
          ),
        ),
      ),
    );
  }
}
