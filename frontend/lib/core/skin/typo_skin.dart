import 'package:flutter/material.dart';

import 'color_skin.dart';

class TypoSkin {
  static const TextStyle title1 = TextStyle(
    fontSize: 24,
    height: 32 / 24,
    fontWeight: FontWeight.w600,
  );

  static const TextStyle title2 = TextStyle(
    fontSize: 20,
    height: 28 / 20,
    fontWeight: FontWeight.w600,
  );

  static const TextStyle bodyText1 = TextStyle(
    fontSize: 16,
    height: 24 / 16,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle bodyText2 = TextStyle(
    fontSize: 14,
    height: 22 / 14,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle buttonText1 = TextStyle(
    fontSize: 16,
    height: 24 / 16,
    fontWeight: FontWeight.w600,
  );

  static const TextStyle caption = TextStyle(
    fontSize: 12,
    height: 16 / 12,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle placeholder2 = TextStyle(
    fontSize: 14,
    height: 22 / 14,
    fontWeight: FontWeight.w400,
  );
}

class TypoTheme {
  static TextTheme get lightTextTheme => const TextTheme(
        displayLarge: TypoSkin.title1,
        titleLarge: TypoSkin.title2,
        bodyLarge: TypoSkin.bodyText1,
        bodyMedium: TypoSkin.bodyText2,
      );

  static TextTheme get darkTextTheme => lightTextTheme.apply(
        bodyColor: ColorSkin.darkTextPrimary,
        displayColor: ColorSkin.darkTextPrimary,
      );
}
