import 'package:flutter/material.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';

class AuthPrimaryButton extends StatelessWidget {
  const AuthPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return AppButton(
      label: label,
      onPressed: onPressed,
      variant: AppButtonVariant.primary,
      isLoading: isLoading,
      height: 52,
      borderRadius: 16,
      expand: true,
    );
  }
}
