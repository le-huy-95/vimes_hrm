import 'package:flutter/material.dart';

class ColorSkin {
  static const Color primary = Color(0xFF0E7C86);
  static const Color primarySub = Color(0xFF0A5C64);
  static const Color secondary1 = Color(0xFFF5A028);
  static const Color error = Color(0xffFF4D4F);
  static const Color white = Color(0xFFFFFFFF);
  static const Color title = Color(0xFF132B2E);
  static const Color subtitle = Color(0xFF5C7478);
  static const Color tealLight = Color(0xFFE4F2F1);
  static const Color orangeLight = Color(0xFFFDF0DC);
  static const Color grey3 = Color(0xffE4E7EC);
  static const Color border1 = Color(0xffD0D5DD);

  static const Color themeBackground = white;
  static const Color themeSurface = white;
  static const Color themeCard = white;
  static const Color themeDivider = grey3;
  static const Color themeTextPrimary = title;
  static const Color themeTextSecondary = subtitle;

  static const Color darkBackground = Color(0xFF0A0E27);
  static const Color darkSurface = Color(0xFF1E1E1E);
  static const Color darkCard = Color(0xFF2D2D2D);
  static const Color darkDivider = Color(0xFF404040);
  static const Color darkTextPrimary = Color(0xFFFFFFFF);
  static const Color darkTextSecondary = Color(0xff667085);

  static const List<Color> brandGradientColors = [
    Color(0xffDA251D),
    Color(0xffFFC043),
    Color(0xff90C8FB),
  ];

  static const LinearGradient brandGradient = LinearGradient(
    colors: brandGradientColors,
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
  );
}
