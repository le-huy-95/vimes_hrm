import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';

class AuthTextField extends StatelessWidget {
  const AuthTextField({
    super.key,
    required this.controller,
    required this.label,
    this.hint,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.validator,
    this.onFieldSubmitted,
    this.prefixIcon,
    this.suffixIcon,
    this.enabled = true,
  });

  final TextEditingController controller;
  final String label;
  final String? hint;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;
  final void Function(String)? onFieldSubmitted;
  final Widget? prefixIcon;
  final Widget? suffixIcon;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TypoSkin.bodyText2.copyWith(
            color: ColorSkin.title,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller,
          obscureText: obscureText,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          enabled: enabled,
          validator: validator,
          onFieldSubmitted: onFieldSubmitted,
          onTapOutside: (_) =>
              FocusScope.of(context, createDependency: false).unfocus(),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TypoSkin.placeholder2.copyWith(
              color: ColorSkin.subtitle,
            ),
            filled: true,
            fillColor: ColorSkin.tealLight.withValues(alpha: 0.45),
            prefixIcon: prefixIcon,
            suffixIcon: suffixIcon,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 14,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: ColorSkin.border1),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: ColorSkin.border1),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(
                color: ColorSkin.primary,
                width: 1.6,
              ),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: ColorSkin.error),
            ),
          ),
        ),
      ],
    );
  }
}
