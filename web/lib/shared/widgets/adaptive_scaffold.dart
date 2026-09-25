import 'package:flutter/material.dart';

/// Breakpoint for persistent sidebar vs drawer (Material adaptive).
const double kShellBreakpoint = 900;

class AdaptiveScaffold extends StatelessWidget {
  const AdaptiveScaffold({
    super.key,
    required this.sidebar,
    required this.body,
    this.title,
    this.actions,
  });

  final Widget sidebar;
  final Widget body;
  final Widget? title;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= kShellBreakpoint;

    if (wide) {
      return Scaffold(
        body: Row(
          children: [
            Material(
              elevation: 1,
              child: SizedBox(
                width: 280,
                child: sidebar,
              ),
            ),
            const VerticalDivider(width: 1),
            Expanded(
              child: Scaffold(
                appBar: AppBar(title: title, actions: actions),
                body: body,
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: title, actions: actions),
      drawer: Drawer(child: sidebar),
      body: body,
    );
  }
}
