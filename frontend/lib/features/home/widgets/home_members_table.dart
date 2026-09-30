import 'package:characters/characters.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/widgets/home_member_actions.dart';
import 'package:manage_teams/features/home/widgets/role_label.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';

class HomeMembersTable extends StatelessWidget {
  const HomeMembersTable({
    super.key,
    required this.members,
    required this.groupAdmin,
    required this.currentUserId,
    required this.onRemove,
  });

  final List<GroupMember> members;
  final bool groupAdmin;
  final String? currentUserId;
  final ValueChanged<String> onRemove;

  static String memberInitial(String? displayName, String email) {
    final label = (displayName?.isNotEmpty ?? false) ? displayName! : email;
    if (label.isEmpty) return '?';
    return label.characters.first.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minWidth: 640),
        child: DataTable(
          columns: const [
            DataColumn(label: Text('Avatar')),
            DataColumn(label: Text('Họ & Tên')),
            DataColumn(label: Text('Email')),
            DataColumn(label: Text('Vai trò')),
            DataColumn(label: Text('Hành động')),
          ],
          rows: [
            for (final m in members)
              DataRow(
                cells: [
                  DataCell(
                    CircleAvatar(
                      backgroundColor: ColorSkin.tealLight,
                      child: Text(
                        memberInitial(m.displayName, m.email),
                        style: const TextStyle(color: ColorSkin.primary),
                      ),
                    ),
                  ),
                  DataCell(
                    Text(
                      (m.displayName?.isNotEmpty ?? false)
                          ? m.displayName!
                          : m.email,
                    ),
                  ),
                  DataCell(
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(
                          child: Text(
                            m.email,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.copy_outlined, size: 18),
                          tooltip: 'Sao chép email',
                          onPressed: () async {
                            await Clipboard.setData(
                              ClipboardData(text: m.email),
                            );
                            SimpleSnackbarService.showSuccess('Đã sao chép email');
                          },
                        ),
                      ],
                    ),
                  ),
                  DataCell(RolePill(role: m.role)),
                  DataCell(
                    canShowRemoveMember(
                      groupAdmin: groupAdmin,
                      currentUserId: currentUserId,
                      memberUserId: m.userId,
                    )
                        ? IconButton(
                            icon: const Icon(
                              Icons.delete_outline,
                              color: ColorSkin.error,
                            ),
                            tooltip: 'Xóa thành viên',
                            onPressed: () => onRemove(m.userId),
                          )
                        : const Text(
                            '—',
                            style: TextStyle(color: ColorSkin.subtitle),
                          ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
