import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';

const double kAppFieldBorderRadius = 12;
const EdgeInsets kAppFieldContentPadding = EdgeInsets.symmetric(
  horizontal: 16,
  vertical: 14,
);

TextStyle appFieldLabelStyle() {
  return TypoSkin.bodyText2.copyWith(
    color: ColorSkin.title,
    fontWeight: FontWeight.w600,
  );
}

Color appFieldFillColor({required bool enabled}) {
  return enabled ? ColorSkin.white : ColorSkin.grey3.withValues(alpha: 0.35);
}

OutlineInputBorder appFieldBorder({
  required BorderSide side,
  double radius = kAppFieldBorderRadius,
}) {
  return OutlineInputBorder(
    borderRadius: BorderRadius.circular(radius),
    borderSide: side,
  );
}

InputDecoration appFieldDecoration({
  String? hintText,
  Widget? prefixIcon,
  Widget? suffixIcon,
  String? suffixText,
  String? helperText,
  String? errorText,
  bool enabled = true,
  double borderRadius = kAppFieldBorderRadius,
  EdgeInsetsGeometry contentPadding = kAppFieldContentPadding,
  Color? fillColor,
  BorderSide borderSide = const BorderSide(color: ColorSkin.border1),
  BorderSide focusedBorderSide = const BorderSide(
    color: ColorSkin.primary,
    width: 1.5,
  ),
}) {
  return InputDecoration(
    hintText: hintText,
    prefixIcon: prefixIcon,
    suffixIcon: suffixIcon,
    suffixText: suffixText,
    helperText: helperText,
    errorText: errorText,
    filled: true,
    fillColor: fillColor ?? appFieldFillColor(enabled: enabled),
    contentPadding: contentPadding,
    border: appFieldBorder(side: borderSide, radius: borderRadius),
    enabledBorder: appFieldBorder(side: borderSide, radius: borderRadius),
    focusedBorder: appFieldBorder(
      side: focusedBorderSide,
      radius: borderRadius,
    ),
    disabledBorder: appFieldBorder(
      side: const BorderSide(color: ColorSkin.grey3),
      radius: borderRadius,
    ),
    errorBorder: appFieldBorder(
      side: const BorderSide(color: ColorSkin.error),
      radius: borderRadius,
    ),
    focusedErrorBorder: appFieldBorder(
      side: const BorderSide(color: ColorSkin.error, width: 1.5),
      radius: borderRadius,
    ),
  );
}

class AppLabeledField extends StatelessWidget {
  const AppLabeledField({
    super.key,
    required this.label,
    required this.child,
    this.subtitle,
    this.spacing = 8,
    this.trailing,
  });

  final String label;
  final String? subtitle;
  final Widget child;
  final double spacing;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: appFieldLabelStyle())),
            ?trailing,
          ],
        ),
        if (subtitle != null) ...[
          SizedBox(height: spacing),
          Text(
            subtitle!,
            style: TypoSkin.caption.copyWith(color: ColorSkin.subtitle),
          ),
        ],
        SizedBox(height: spacing),
        child,
      ],
    );
  }
}
