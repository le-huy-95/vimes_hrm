import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';

String roleLabelVi(String? role) {
  if (role == null || role.isEmpty) return '—';
  return switch (role) {
    'OWNER' => 'Chủ sở hữu',
    'ADMIN' => 'Quản trị',
    'MEMBER' => 'Thành viên',
    _ => role,
  };
}

class RolePill extends StatelessWidget {
  const RolePill({super.key, required this.role});

  final String role;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: ColorSkin.tealLight,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        roleLabelVi(role),
        style: const TextStyle(fontSize: 11, color: ColorSkin.primarySub),
      ),
    );
  }
}
