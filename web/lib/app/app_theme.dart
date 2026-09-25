import 'package:flutter/material.dart';

class AppTheme {
  static ThemeData get lightTheme {
    final base = ColorScheme.fromSeed(
      seedColor: const Color(0xFF0F766E),
      brightness: Brightness.light,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: base,
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
      ),
    );
  }
}
