import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';

@immutable
class BrandTheme extends ThemeExtension<BrandTheme> {
  const BrandTheme({required this.brandGradient});

  final LinearGradient brandGradient;

  @override
  BrandTheme copyWith({LinearGradient? brandGradient}) {
    return BrandTheme(brandGradient: brandGradient ?? this.brandGradient);
  }

  @override
  BrandTheme lerp(ThemeExtension<BrandTheme>? other, double t) {
    if (other is! BrandTheme) return this;
    return BrandTheme(brandGradient: brandGradient);
  }
}

class AppTheme {
  AppTheme._();

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      fontFamily: 'BeVietnamPro',
      brightness: Brightness.light,
      extensions: const [BrandTheme(brandGradient: ColorSkin.brandGradient)],
      colorScheme: ColorScheme.fromSeed(
        seedColor: ColorSkin.primary,
        brightness: Brightness.light,
        primary: ColorSkin.primary,
        secondary: ColorSkin.secondary1,
        error: ColorSkin.error,
        surface: ColorSkin.white,
      ),
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        backgroundColor: ColorSkin.white,
        surfaceTintColor: ColorSkin.white,
      ),
      scaffoldBackgroundColor: ColorSkin.themeBackground,
      textTheme: TypoTheme.lightTextTheme,
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: ColorSkin.themeBackground,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: ColorSkin.primary,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(40),
          ),
          textStyle: TypoSkin.buttonText1,
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: ColorSkin.white,
        surfaceTintColor: ColorSkin.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      ),
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      fontFamily: 'BeVietnamPro',
      brightness: Brightness.dark,
      extensions: const [BrandTheme(brandGradient: ColorSkin.brandGradient)],
      colorScheme: ColorScheme.fromSeed(
        seedColor: ColorSkin.primary,
        brightness: Brightness.dark,
        primary: ColorSkin.primary,
      ),
      scaffoldBackgroundColor: ColorSkin.darkBackground,
      textTheme: TypoTheme.darkTextTheme,
    );
  }
}
