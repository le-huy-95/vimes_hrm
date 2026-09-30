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
    required this.hasGroup,
    required this.busy,
    required this.onLeave,
    required this.onViewMembers,
  });

  final String groupName;
  final String? myRole;
  final int memberCount;
  final bool hasGroup;
  final bool busy;
  final VoidCallback onLeave;
  final VoidCallback onViewMembers;

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      title: 'Nhóm đang chọn',
      trailing: hasGroup
          ? IconButton(
              icon: const Icon(Icons.logout, color: ColorSkin.subtitle),
              tooltip: 'Rời nhóm',
              onPressed: busy ? null : onLeave,
            )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              style: const TextStyle(fontSize: 15, color: ColorSkin.title),
              children: [
                const TextSpan(text: 'Tên nhóm: '),
                TextSpan(
                  text: groupName,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Vai trò của tôi: ${roleLabelVi(myRole)} · $memberCount thành viên',
            style: const TextStyle(color: ColorSkin.subtitle, fontSize: 13),
          ),
          const SizedBox(height: 12),
          AppButton(
            label: 'Xem thành viên',
            onPressed: hasGroup ? onViewMembers : null,
            height: 40,
          ),
        ],
      ),
    );
  }
}
