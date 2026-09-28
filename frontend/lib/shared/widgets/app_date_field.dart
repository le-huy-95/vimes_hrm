import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:manage_teams/shared/widgets/app_form_field.dart';

class AppDateField extends StatefulWidget {
  const AppDateField({
    super.key,
    required this.label,
    this.controller,
    this.initialValue,
    this.hintText = 'dd/MM/yyyy',
    this.enabled = true,
    this.onTap,
    this.onChanged,
    this.required = false,
  });

  final String label;
  final TextEditingController? controller;
  final String? initialValue;
  final String hintText;
  final bool enabled;
  final VoidCallback? onTap;
  final ValueChanged<String>? onChanged;
  final bool required;

  @override
  State<AppDateField> createState() => _AppDateFieldState();
}

class _AppDateFieldState extends State<AppDateField> {
  static final _format = DateFormat('dd/MM/yyyy');
  TextEditingController? _ownedController;

  TextEditingController get _controller =>
      widget.controller ?? _ownedController!;

  @override
  void initState() {
    super.initState();
    if (widget.controller == null) {
      _ownedController = TextEditingController(text: widget.initialValue ?? '');
    }
  }

  @override
  void didUpdateWidget(covariant AppDateField oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Defer text writes: syncing here notifies FormField → Form.setState during build.
    if (widget.controller != null) return;
    if (widget.initialValue == oldWidget.initialValue) return;
    if (widget.initialValue == _controller.text) return;
    final next = widget.initialValue ?? '';
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_controller.text == next) return;
      _controller.text = next;
    });
  }

  @override
  void dispose() {
    _ownedController?.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    DateTime initial = DateTime.now();
    final raw = _controller.text.trim();
    if (raw.isNotEmpty) {
      try {
        initial = _format.parse(raw);
      } catch (_) {}
    }

    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );
    if (picked == null || !mounted) return;

    final formatted = _format.format(picked);
    _controller.text = formatted;
    widget.onChanged?.call(formatted);
  }

  @override
  Widget build(BuildContext context) {
    return AppFormField(
      label: widget.label,
      controller: _controller,
      readOnly: true,
      onTap: widget.enabled ? (widget.onTap ?? _pickDate) : null,
      hintText: widget.hintText,
      enabled: widget.enabled,
      suffixIcon: const Icon(Icons.calendar_today_outlined),
      required: widget.required,
    );
  }
}
