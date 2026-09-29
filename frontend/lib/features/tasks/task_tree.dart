import 'package:manage_teams/core/models/api_models.dart';

extension TaskTree on List<TaskListItem> {
  List<TaskListItem> get roots =>
      where((t) => t.parentId == null || t.parentId!.isEmpty).toList();

  List<TaskListItem> childrenOf(String parentId) {
    final kids = where((t) => t.parentId == parentId).toList();
    kids.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return kids;
  }

  /// Google Tasks–like flat list: root then its children.
  List<TaskListItem> get nestedForList {
    final out = <TaskListItem>[];
    final rootsSorted = roots.toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    for (final r in rootsSorted) {
      out.add(r);
      out.addAll(childrenOf(r.id));
    }
    return out;
  }
}
