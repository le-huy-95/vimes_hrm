import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/widgets/role_label.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_section_card.dart';

class HomeGroupCard extends StatelessWidget {
  const HomeGroupCard({
    super.key,
    required this.groupName,
    required this.myRole,
    required this.memberCount,
    required this.onLeave,
    required this.onViewMembers,
  });

  final String groupName;
  final String? myRole;
  final int memberCount;
  final VoidCallback onLeave;
  final VoidCallback onViewMembers;

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      title: 'Nhóm đang chọn',
      trailing: IconButton(
        icon: const Icon(Icons.logout, color: ColorSkin.subtitle),
        tooltip: 'Rời nhóm',
        onPressed: onLeave,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            groupName,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: ColorSkin.title,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Vai trò của tôi: ${roleLabelVi(myRole)} · $memberCount thành viên',
            style: const TextStyle(color: ColorSkin.subtitle, fontSize: 13),
          ),
          const SizedBox(height: 12),
          AppButton(
            label: 'Xem thành viên',
            onPressed: onViewMembers,
            height: 40,
          ),
        ],
      ),
    );
  }
}
