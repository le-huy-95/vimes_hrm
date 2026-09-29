import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/ai/data/ai_models.dart';

class AiLinkChip extends StatelessWidget {
  const AiLinkChip({super.key, required this.link, required this.onTap});

  final AiLink link;
  final VoidCallback onTap;

  IconData get _icon => switch (link.type) {
        'group' => Icons.groups_outlined,
        'conversation' => Icons.chat_bubble_outline,
        _ => Icons.task_alt_outlined,
      };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6, right: 6),
      child: ActionChip(
        avatar: Icon(_icon, size: 16, color: ColorSkin.primary),
        label: Text(
          link.label.isEmpty ? link.id : link.label,
          style: const TextStyle(
            color: ColorSkin.primary,
            fontWeight: FontWeight.w600,
            fontSize: 12,
          ),
        ),
        backgroundColor: ColorSkin.tealLight,
        side: BorderSide.none,
        onPressed: onTap,
      ),
    );
  }
}
