import 'package:flutter/material.dart';
import 'package:manage_teams/shared/validators/form_validators.dart';
import 'package:manage_teams/shared/widgets/app_form_field.dart';

/// Field số điện thoại dùng chung, có sẵn validate số điện thoại Việt Nam.
class AppPhoneField extends StatelessWidget {
  const AppPhoneField({
    super.key,
    this.label = 'Số điện thoại',
    this.controller,
    this.hintText,
    this.required = false,
    this.enabled = true,
    this.onChanged,
  });

  final String label;
  final TextEditingController? controller;
  final String? hintText;
  final bool required;
  final bool enabled;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return AppFormField(
      label: label,
      controller: controller,
      hintText: hintText ?? '0123 456 789',
      keyboardType: TextInputType.phone,
      enabled: enabled,
      onChanged: onChanged,
      required: required,
      validator: (value) =>
          phoneValidator(value, required: false, label: stripRequiredMark(label)),
    );
  }
}
