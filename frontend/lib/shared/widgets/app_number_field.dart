import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:manage_teams/core/constants/env_config.dart';
import 'package:manage_teams/shared/formatters/money_formatters.dart';
import 'package:manage_teams/shared/validators/form_validators.dart';
import 'package:manage_teams/shared/widgets/app_form_field.dart';

/// Field số dùng chung cho mọi form.
///
/// Hỗ trợ validate bắt buộc ([required]), không âm ([nonNegative]) và giới hạn
/// khoảng giá trị ([min]/[max]) thông qua [numberValidator].
class AppNumberField extends StatelessWidget {
  const AppNumberField({
    super.key,
    required this.label,
    this.controller,
    this.initialValue,
    this.hintText,
    this.onChanged,
    this.required = false,
    this.nonNegative = true,
    this.min,
    this.max,
    this.enabled = true,
    this.focusNode,
    this.suffixText,
  });

  final String label;
  final TextEditingController? controller;
  final String? initialValue;
  final String? hintText;
  final ValueChanged<String>? onChanged;
  final bool required;
  final bool nonNegative;
  final double? min;
  final double? max;
  final bool enabled;
  final FocusNode? focusNode;
  final String? suffixText;

  @override
  Widget build(BuildContext context) {
    return AppFormField(
      label: label,
      controller: controller,
      initialValue: initialValue,
      hintText: hintText,
      onChanged: onChanged,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [
        FilteringTextInputFormatter.allow(
          nonNegative
              ? RegExp(r'^\d*\.?\d{0,2}$')
              : RegExp(r'^-?\d*\.?\d{0,2}$'),
        ),
      ],
      enabled: enabled,
      focusNode: focusNode,
      suffixText: suffixText,
      required: required,
      validator: (v) => numberValidator(
        v,
        required: false,
        nonNegative: nonNegative,
        min: min,
        max: max,
        label: stripRequiredMark(label),
      ),
    );
  }
}

/// Field số tiền (định dạng VND, dấu chấm ngăn nghìn, không thập phân).
///
/// [initialValue] và [onChanged] dùng chuỗi số thô (không dấu ngăn cách).
class AppPriceField extends StatefulWidget {
  const AppPriceField({
    super.key,
    required this.label,
    this.initialValue,
    this.hintText,
    this.onChanged,
    this.required = false,
    this.nonNegative = true,
    this.focusNode,
    this.suffixText,
    this.enabled = true,
  });

  final String label;
  final String? initialValue;
  final String? hintText;
  final ValueChanged<String>? onChanged;
  final bool required;
  final bool nonNegative;
  final FocusNode? focusNode;
  final String? suffixText;
  final bool enabled;

  @override
  State<AppPriceField> createState() => _AppPriceFieldState();
}

class _AppPriceFieldState extends State<AppPriceField> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(
      text: formatMoneyRaw(widget.initialValue ?? ''),
    );
  }

  @override
  void didUpdateWidget(covariant AppPriceField oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Defer text writes: syncing here notifies FormField → Form.setState during build.
    if (widget.initialValue == oldWidget.initialValue) return;
    final next = formatMoneyRaw(widget.initialValue ?? '');
    if (parseMoneyRaw(_controller.text) == parseMoneyRaw(next)) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (parseMoneyRaw(_controller.text) == parseMoneyRaw(next)) return;
      _controller.text = next;
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleChanged(String formatted) {
    widget.onChanged?.call(parseMoneyRaw(formatted));
  }

  @override
  Widget build(BuildContext context) {
    final cleanLabel = stripRequiredMark(widget.label);
    return AppFormField(
      label: widget.label,
      controller: _controller,
      hintText: widget.hintText,
      onChanged: _handleChanged,
      keyboardType: TextInputType.number,
      inputFormatters: const [MoneyInputFormatter()],
      enabled: widget.enabled,
      focusNode: widget.focusNode,
      suffixText: widget.suffixText ?? EnvConfig.currency,
      required: widget.required,
      validator: (value) {
        final raw = parseMoneyRaw(value ?? '');
        if (raw.isEmpty) return null;
        return numberValidator(
          raw,
          required: false,
          nonNegative: widget.nonNegative,
          label: cleanLabel,
        );
      },
    );
  }
}
