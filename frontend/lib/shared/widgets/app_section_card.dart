import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';

/// Card section dùng chung cho các màn form/detail (kiểu VIMES:
/// nền trắng, radius 18, viền border1 mờ, tiêu đề w800 15px).
class AppSectionCard extends StatelessWidget {
  const AppSectionCard({
    super.key,
    required this.title,
    required this.child,
    this.trailing,
  });

  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: ColorSkin.border1.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: ColorSkin.title,
                  ),
                ),
              ),
              trailing ?? const SizedBox.shrink(),
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}
