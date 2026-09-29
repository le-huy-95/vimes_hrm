import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_text_field.dart';

/// Compact single-field prompt. Avoids Material 3 [AlertDialog]'s Flexible
/// content slot, which stretches to near full-screen height on Flutter web.
Future<String?> showAppPromptDialog(
  BuildContext context, {
  required String title,
  required String hint,
  String? label,
  String confirmLabel = 'OK',
  String cancelLabel = 'Hủy',
  bool required = true,
  TextInputType? keyboardType,
}) {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) {
      return Dialog(
        backgroundColor: ColorSkin.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  title,
                  style: TypoSkin.title2.copyWith(color: ColorSkin.title),
                ),
                const SizedBox(height: 16),
                AppTextField(
                  label: label ?? hint,
                  controller: controller,
                  hintText: hint,
                  required: required,
                  keyboardType: keyboardType,
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    AppButton(
                      label: cancelLabel,
                      height: 40,
                      onPressed: () => Navigator.pop(ctx),
                    ),
                    const SizedBox(width: 8),
                    AppButton(
                      label: confirmLabel,
                      variant: AppButtonVariant.primary,
                      height: 40,
                      onPressed: () {
                        final value = controller.text.trim();
                        if (required && value.isEmpty) return;
                        Navigator.pop(ctx, controller.text);
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
    },
  ).whenComplete(controller.dispose);
}
