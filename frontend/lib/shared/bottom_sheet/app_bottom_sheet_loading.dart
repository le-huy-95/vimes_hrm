import 'package:flutter/material.dart';

/// Dispatched by data-display bottom sheet content to request a full-sheet
/// loading overlay on the enclosing [AppBottomSheet].
class AppBottomSheetLoadingNotification extends Notification {
  const AppBottomSheetLoadingNotification(this.isLoading);

  final bool isLoading;
}

/// Reports [isLoading] to [AppBottomSheet] and builds [child] when not loading.
///
/// Use only for data-display sheets (detail / preview / attachments), not forms.
class AppBottomSheetLoading extends StatefulWidget {
  const AppBottomSheetLoading({
    super.key,
    required this.isLoading,
    required this.child,
  });

  final bool isLoading;
  final Widget child;

  @override
  State<AppBottomSheetLoading> createState() => _AppBottomSheetLoadingState();
}

class _AppBottomSheetLoadingState extends State<AppBottomSheetLoading> {
  @override
  void initState() {
    super.initState();
    _scheduleDispatch();
  }

  @override
  void didUpdateWidget(covariant AppBottomSheetLoading oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isLoading != widget.isLoading) {
      _scheduleDispatch();
    }
  }

  void _scheduleDispatch() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      AppBottomSheetLoadingNotification(widget.isLoading).dispatch(context);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isLoading) return const SizedBox.shrink();
    return widget.child;
  }
}
