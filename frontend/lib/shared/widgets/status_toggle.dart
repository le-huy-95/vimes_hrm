import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';

class StatusToggle extends StatelessWidget {
  const StatusToggle({
    super.key,
    required this.isActive,
    required this.onToggle,
    this.activeLabel,
    this.inactiveLabel,
    this.confirmTitle,
    this.confirmMessage,
    this.confirmActiveText,
    this.confirmInactiveText,
    this.cancelText,
    this.confirmBeforeToggle = true,
  });

  final bool isActive;
  final ValueChanged<bool> onToggle;
  final String? activeLabel;
  final String? inactiveLabel;
  final String? confirmTitle;
  final String? confirmMessage;
  final String? confirmActiveText;
  final String? confirmInactiveText;
  final String? cancelText;
  final bool confirmBeforeToggle;

  Future<void> _handleToggle(BuildContext context) async {
    if (!confirmBeforeToggle) {
      onToggle(!isActive);
      return;
    }

    final title =
        confirmTitle ?? (isActive ? 'Ngừng hoạt động?' : 'Kích hoạt lại?');
    final message =
        confirmMessage ??
        (isActive
            ? 'Bạn có chắc muốn ngừng hoạt động?'
            : 'Bạn có chắc muốn kích hoạt lại?');
    final confirmText = isActive
        ? (confirmInactiveText ?? 'Ngừng')
        : (confirmActiveText ?? 'Kích hoạt');

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(cancelText ?? 'Huỷ'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: isActive ? ColorSkin.error : ColorSkin.primary,
            ),
            child: Text(confirmText),
          ),
        ],
      ),
    );

    if (confirmed == true) onToggle(!isActive);
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CupertinoSwitch(
          value: isActive,
          activeTrackColor: ColorSkin.primary,
          onChanged: (_) => _handleToggle(context),
        ),
      ],
    );
  }
}
