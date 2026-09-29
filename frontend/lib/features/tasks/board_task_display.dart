/// Board card due text. Returns null when there is no due date to show.
String? formatBoardDueLabel(String? dueDate, {DateTime? now}) {
  if (dueDate == null || dueDate.trim().isEmpty) return null;
  final raw = dueDate.trim();
  DateTime? parsed;
  try {
    parsed = DateTime.parse(raw.length >= 10 ? raw.substring(0, 10) : raw);
  } catch (_) {
    return raw;
  }
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  final due = DateTime(parsed.year, parsed.month, parsed.day);
  if (due == today) return 'Hôm nay';
  return '${due.day} thg ${due.month}';
}

String _firstChar(String s) {
  final it = s.runes.iterator;
  if (!it.moveNext()) return '?';
  return String.fromCharCode(it.current).toUpperCase();
}

/// 1–2 letter initials from a display name or email local-part.
String assigneeInitials(String name) {
  final cleaned = name.trim();
  if (cleaned.isEmpty) return '?';
  final parts = cleaned
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.length == 1) return _firstChar(parts.first);
  return '${_firstChar(parts.first)}${_firstChar(parts.last)}';
}
