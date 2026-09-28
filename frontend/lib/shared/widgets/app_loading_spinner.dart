import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';

/// Branded loading indicator: app icon with a primary-color spinner ring.
///
/// Use inline (e.g. inside lists/sheets) or via [AppLoadingView] for full-area states.
class AppLoadingSpinner extends StatelessWidget {
  const AppLoadingSpinner({super.key, this.size = 72});

  static const _iconAsset = 'lib/assets/image/app_icon.png';

  /// Outer diameter of the spinner ring.
  final double size;

  @override
  Widget build(BuildContext context) {
    final logoSize = size * 0.58;
    final stroke = (size * 0.04).clamp(2.5, 3.5);

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: CircularProgressIndicator(
              strokeWidth: stroke,
              color: ColorSkin.primary,
            ),
          ),
          ClipOval(
            child: Image.asset(
              _iconAsset,
              width: logoSize,
              height: logoSize,
              fit: BoxFit.cover,
              filterQuality: FilterQuality.high,
              semanticLabel: 'Manage Teams',
            ),
          ),
        ],
      ),
    );
  }
}

/// Centered [AppLoadingSpinner] for full-page / main-area loading states.
///
/// Fills available space with a light gray background.
class AppLoadingView extends StatelessWidget {
  const AppLoadingView({super.key, this.size = 72});

  final double size;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: ColorSkin.grey3,
      child: Center(child: AppLoadingSpinner(size: size)),
    );
  }
}
