import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';

enum AppButtonVariant { outlined, primary, destructive }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.outlined,
    this.isLoading = false,
    this.height = 48,
    this.expand = false,
    this.borderRadius = 12,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool isLoading;
  final double height;
  final bool expand;
  final double borderRadius;
  final Widget? icon;

  @override
  Widget build(BuildContext context) {
    final button = switch (variant) {
      AppButtonVariant.primary => _buildPrimary(),
      AppButtonVariant.destructive => _buildDestructive(),
      AppButtonVariant.outlined => _buildOutlined(),
    };

    if (expand) {
      return SizedBox(height: height, width: double.infinity, child: button);
    }

    return SizedBox(height: height, child: button);
  }

  Widget _buildOutlined() {
    return OutlinedButton(
      onPressed: isLoading ? null : onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: ColorSkin.title,
        side: const BorderSide(color: ColorSkin.border1),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(borderRadius),
        ),
        textStyle: TypoSkin.buttonText1,
      ),
      child: _buildChild(ColorSkin.title),
    );
  }

  Widget _buildPrimary() {
    return FilledButton(
      onPressed: isLoading ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: ColorSkin.primary,
        foregroundColor: ColorSkin.white,
        disabledBackgroundColor: ColorSkin.primary.withValues(alpha: 0.5),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(borderRadius),
        ),
        textStyle: TypoSkin.buttonText1,
      ),
      child: _buildChild(ColorSkin.white),
    );
  }

  Widget _buildDestructive() {
    return FilledButton(
      onPressed: isLoading ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: ColorSkin.error,
        foregroundColor: ColorSkin.white,
        disabledBackgroundColor: ColorSkin.error.withValues(alpha: 0.5),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(borderRadius),
        ),
        textStyle: TypoSkin.buttonText1,
      ),
      child: _buildChild(ColorSkin.white),
    );
  }

  Widget _buildChild(Color textColor) {
    if (isLoading) {
      return SizedBox(
        height: 22,
        width: 22,
        child: CircularProgressIndicator(strokeWidth: 2.4, color: textColor),
      );
    }

    if (icon == null) return Text(label);
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconTheme.merge(
          data: IconThemeData(color: textColor, size: 18),
          child: icon!,
        ),
        const SizedBox(width: 8),
        Text(label),
      ],
    );
  }
}
