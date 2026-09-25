import 'package:flutter/material.dart';
import 'package:manage_teams_app/data/models/team_models.dart';

Future<Team?> showTeamsPicker({
  required BuildContext context,
  required List<Team> tree,
}) {
  final flat = tree.expand((t) => t.flatten).toList();
  return showDialog<Team>(
    context: context,
    builder: (ctx) {
      return AlertDialog(
        title: const Text('Nhóm của bạn'),
        content: SizedBox(
          width: 360,
          child: flat.isEmpty
              ? const Text('Chưa có nhóm.')
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: flat.length,
                  itemBuilder: (_, i) {
                    final t = flat[i];
                    return ListTile(
                      title: Text(t.name),
                      subtitle: t.memberNames.isEmpty
                          ? null
                          : Text(t.memberNames.join(', ')),
                      onTap: () => Navigator.of(ctx).pop(t),
                    );
                  },
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Đóng'),
          ),
        ],
      );
    },
  );
}
