import 'package:flutter/material.dart';

class ServiceLinkTile extends StatelessWidget {
  const ServiceLinkTile({
    super.key,
    required this.label,
    required this.linked,
    this.onTap,
  });

  final String label;
  final bool linked;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      dense: true,
      title: Text(label),
      subtitle: linked
          ? Text(
              'đã liên kết',
              style: TextStyle(color: scheme.primary, fontSize: 12),
            )
          : null,
      onTap: onTap,
    );
  }
}
