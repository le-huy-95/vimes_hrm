import 'package:flutter/material.dart';

enum AppBottomSheetActionStyle { primary, secondary, destructive }

class AppBottomSheetAction {
  const AppBottomSheetAction({
    required this.label,
    this.style = AppBottomSheetActionStyle.secondary,
    this.returnValue,
    this.dismissOnTap = true,
    this.onPressed,
  });

  final String label;
  final AppBottomSheetActionStyle style;
  final Object? returnValue;
  final bool dismissOnTap;
  final VoidCallback? onPressed;
}
