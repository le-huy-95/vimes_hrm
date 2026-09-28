import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';

/// Icon action hiển thị trên dòng label của một field.
///
/// Dùng để thêm nhanh đối tượng liên quan bên cạnh field,
/// ví dụ nút "+" tạo khách hàng / người giao hàng ngay trên label.
class AppFieldLabelAction extends StatelessWidget {
  const AppFieldLabelAction({
    super.key,
    required this.onPressed,
    this.tooltip,
    this.icon = Icons.add_circle_outline,
    this.iconSize = 22,
  });

  final VoidCallback? onPressed;
  final String? tooltip;
  final IconData icon;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      tooltip: tooltip,
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
      icon: Icon(icon, size: iconSize, color: ColorSkin.primary),
    );
  }
}