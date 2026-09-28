import 'package:flutter/material.dart';

/// Brand logo for auth screens. Asset can be replaced later without changing call sites.
class AppLogo extends StatelessWidget {
  const AppLogo({
    super.key,
    this.width = 240,
    this.height,
  });

  static const assetPath = 'lib/assets/image/vimes_logo.png';

  final double width;
  final double? height;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      assetPath,
      width: width,
      height: height,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
      semanticLabel: 'Manage Teams',
    );
  }
}
