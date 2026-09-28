import 'package:flutter/material.dart';
import 'package:manage_teams/shared/widgets/app_form_field.dart';

class AppMultilineField extends StatelessWidget {
  const AppMultilineField({
    super.key,
    required this.label,
    required this.controller,
    this.hintText,
    this.enabled = true,
    this.maxLines = 3,
    this.required = false,
    this.validator,
  });

  final String label;
  final TextEditingController controller;
  final String? hintText;
  final bool enabled;
  final int maxLines;
  final bool required;
  final FormFieldValidator<String>? validator;

  @override
  Widget build(BuildContext context) {
    return AppFormField(
      label: label,
      controller: controller,
      hintText: hintText,
      enabled: enabled,
      maxLines: maxLines,
      required: required,
      validator: validator,
    );
  }
}
