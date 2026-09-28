import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:manage_teams/shared/validators/form_validators.dart';
import 'package:manage_teams/shared/widgets/app_field_styles.dart';

class AppFormField extends StatelessWidget {
  const AppFormField({
    super.key,
    required this.label,
    this.controller,
    this.focusNode,
    this.initialValue,
    this.hintText,
    this.prefixIcon,
    this.suffixIcon,
    this.suffixText,
    this.keyboardType,
    this.readOnly = false,
    this.onTap,
    this.onChanged,
    this.validator,
    this.inputFormatters,
    this.maxLines = 1,
    this.enabled = true,
    this.helperText,
    this.required = false,
  });

  final String label;
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final String? initialValue;
  final String? hintText;
  final Widget? prefixIcon;
  final Widget? suffixIcon;
  final String? suffixText;
  final TextInputType? keyboardType;
  final bool readOnly;
  final VoidCallback? onTap;
  final ValueChanged<String>? onChanged;
  final FormFieldValidator<String>? validator;
  final List<TextInputFormatter>? inputFormatters;
  final int maxLines;
  final bool enabled;
  final String? helperText;
  final bool required;

  @override
  Widget build(BuildContext context) {
    return AppLabeledField(
      label: requiredFieldLabel(label, required: required),
      child: TextFormField(
        controller: controller,
        focusNode: focusNode,
        initialValue: initialValue,
        keyboardType: keyboardType,
        readOnly: readOnly,
        onTap: onTap,
        onChanged: onChanged,
        validator: composeRequiredValidator(
          required: required,
          label: label,
          validator: validator,
        ),
        inputFormatters: inputFormatters,
        maxLines: maxLines,
        enabled: enabled,
        decoration: appFieldDecoration(
          hintText: hintText,
          prefixIcon: prefixIcon,
          suffixIcon: suffixIcon,
          suffixText: suffixText,
          helperText: helperText,
          enabled: enabled,
        ),
      ),
    );
  }
}
