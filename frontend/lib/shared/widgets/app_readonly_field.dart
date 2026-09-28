import 'package:flutter/material.dart';
import 'package:manage_teams/shared/widgets/app_form_field.dart';

class AppReadOnlyField extends StatelessWidget {
  const AppReadOnlyField({
    super.key,
    required this.label,
    required this.value,
    this.hintText,
    this.enabled = false,
  });

  final String label;
  final String? value;
  final String? hintText;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return AppFormField(
      label: label,
      initialValue: value,
      readOnly: true,
      enabled: enabled,
      hintText: hintText,
    );
  }
}
