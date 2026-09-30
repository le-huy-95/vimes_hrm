import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_section_card.dart';

class HomeOrgCard extends StatelessWidget {
  const HomeOrgCard({
    super.key,
    required this.orgName,
    required this.orgId,
    required this.onCreateOrg,
    required this.onAcceptInvite,
  });

  final String orgName;
  final String orgId;
  final VoidCallback onCreateOrg;
  final VoidCallback onAcceptInvite;

  static String orgInitial(String name) {
    if (name.isEmpty) return '?';
    return name.characters.first.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final displayId = orgId.length > 8 ? '${orgId.substring(0, 8)}…' : orgId;
    return AppSectionCard(
      title: 'Tổ chức',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: ColorSkin.tealLight,
                child: Text(
                  orgInitial(orgName),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: ColorSkin.primary,
                    fontSize: 20,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      TextSpan(
                        style: const TextStyle(
                          fontSize: 15,
                          color: ColorSkin.title,
                        ),
                        children: [
                          const TextSpan(text: 'Tên tổ chức: '),
                          TextSpan(
                            text: orgName.isEmpty ? '—' : orgName,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'id: $displayId',
                      style: const TextStyle(
                        fontSize: 12,
                        color: ColorSkin.subtitle,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              AppButton(
                label: '+ Tạo tổ chức mới',
                onPressed: onCreateOrg,
                height: 40,
              ),
              AppButton(
                label: '+ Chấp nhận lời mời',
                onPressed: onAcceptInvite,
                height: 40,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
