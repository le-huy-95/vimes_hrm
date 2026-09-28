import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';
import 'package:manage_teams/shared/bottom_sheet/app_bottom_sheet_action.dart';
import 'package:manage_teams/shared/bottom_sheet/app_bottom_sheet_loading.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_loading_spinner.dart';

class AppBottomSheet extends StatefulWidget {
  /// Fixed sheet height: 70% of the screen.
  static const double heightFactor = 0.7;

  /// @Deprecated Use [heightFactor]. Kept for call-site compatibility.
  static const double minHeightFactor = heightFactor;

  /// @Deprecated Use [heightFactor]. Kept for call-site compatibility.
  static const double maxHeightFactor = heightFactor;

  /// @Deprecated Use [heightFactor]. Kept for call-site compatibility.
  static const double defaultHeightFactor = heightFactor;

  /// @Deprecated Use [heightFactor]. Kept for call-site compatibility.
  static const double maxAllowedHeightFactor = heightFactor;

  const AppBottomSheet({
    super.key,
    this.title,
    this.message,
    this.content,
    required this.actions,
    this.scrollableContent = true,
    this.showHandle = true,
    this.showCloseButton = false,
    this.onClose,
    this.initialContentLoading = false,
    this.contentPadding = const EdgeInsets.fromLTRB(20, 12, 20, 0),
    this.actionsPadding = const EdgeInsets.fromLTRB(20, 20, 20, 16),
  });

  final String? title;
  final String? message;
  final Widget? content;
  final List<AppBottomSheetAction> actions;

  /// When true, body scrolls inside the fixed 70% viewport. When false, the
  /// body is a bounded [Expanded] so children can use [Expanded] / [ListView].
  final bool scrollableContent;
  final bool showHandle;
  final bool showCloseButton;
  final VoidCallback? onClose;

  /// When true, opens with a full-sheet white loading overlay until content
  /// reports ready via [AppBottomSheetLoadingNotification]. Data-display sheets only.
  final bool initialContentLoading;
  final EdgeInsetsGeometry contentPadding;
  final EdgeInsetsGeometry actionsPadding;

  @override
  State<AppBottomSheet> createState() => _AppBottomSheetState();
}

class _AppBottomSheetState extends State<AppBottomSheet> {
  late bool _contentLoading = widget.initialContentLoading;

  @override
  void didUpdateWidget(covariant AppBottomSheet oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialContentLoading != widget.initialContentLoading &&
        widget.initialContentLoading) {
      _contentLoading = true;
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final screenHeight = MediaQuery.sizeOf(context).height;
    final sheetHeight =
        (screenHeight * AppBottomSheet.heightFactor - bottomInset).clamp(
          120.0,
          screenHeight,
        );

    final header = _buildHeader(context);
    final messageWidget = widget.message == null
        ? null
        : Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: Text(
              widget.message!,
              style: TypoSkin.bodyText2.copyWith(color: ColorSkin.subtitle),
            ),
          );
    final actionsWidget = widget.actions.isEmpty
        ? null
        : Padding(
            padding: widget.actionsPadding,
            child: _AppBottomSheetActions(actions: widget.actions),
          );

    return NotificationListener<AppBottomSheetLoadingNotification>(
      onNotification: (notification) {
        if (_contentLoading != notification.isLoading) {
          setState(() => _contentLoading = notification.isLoading);
        }
        return true;
      },
      child: _wrap(
        bottomInset: bottomInset,
        child: SizedBox(
          height: sheetHeight,
          child: _sheetChrome(
            child: Stack(
              fit: StackFit.expand,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ?header,
                    ?messageWidget,
                    if (widget.content != null)
                      Expanded(
                        child: widget.scrollableContent
                            ? ListView(
                                padding: widget.contentPadding,
                                keyboardDismissBehavior:
                                    ScrollViewKeyboardDismissBehavior.onDrag,
                                children: [widget.content!],
                              )
                            : Padding(
                                padding: widget.contentPadding,
                                child: widget.content!,
                              ),
                      )
                    else
                      const Spacer(),
                    ?actionsWidget,
                  ],
                ),
                if (_contentLoading)
                  const ColoredBox(
                    color: ColorSkin.white,
                    child: Center(child: AppLoadingSpinner()),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _wrap({required double bottomInset, required Widget child}) {
    return GestureDetector(
      onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
      behavior: HitTestBehavior.deferToChild,
      child: Padding(
        padding: EdgeInsets.only(bottom: bottomInset),
        child: Align(alignment: Alignment.bottomCenter, child: child),
      ),
    );
  }

  Widget _sheetChrome({required Widget child}) {
    return Material(
      color: ColorSkin.white,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      clipBehavior: Clip.antiAlias,
      child: SafeArea(
        top: false,
        child: SizedBox(width: double.infinity, child: child),
      ),
    );
  }

  Widget? _buildHeader(BuildContext context) {
    if (!widget.showHandle && widget.title == null && !widget.showCloseButton) {
      return null;
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.showHandle)
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: ColorSkin.grey3,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
          if (widget.title != null || widget.showCloseButton) ...[
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                children: [
                  const SizedBox(width: 40),
                  Expanded(
                    child: Text(
                      widget.title ?? '',
                      textAlign: TextAlign.center,
                      style: TypoSkin.title2.copyWith(color: ColorSkin.title),
                    ),
                  ),
                  SizedBox(
                    width: 40,
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: widget.showCloseButton
                          ? IconButton(
                              onPressed:
                                  widget.onClose ??
                                  () => Navigator.of(context).maybePop(),
                              visualDensity: VisualDensity.compact,
                              icon: const Icon(
                                Icons.close,
                                size: 20,
                                color: ColorSkin.subtitle,
                              ),
                            )
                          : const SizedBox.shrink(),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AppBottomSheetActions extends StatelessWidget {
  const _AppBottomSheetActions({required this.actions});

  final List<AppBottomSheetAction> actions;

  @override
  Widget build(BuildContext context) {
    if (actions.length == 1) {
      return _buildActionButton(context, actions.first);
    }

    if (actions.length == 2) {
      return Row(
        children: [
          Expanded(child: _buildActionButton(context, actions[0])),
          const SizedBox(width: 12),
          Expanded(child: _buildActionButton(context, actions[1])),
        ],
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < actions.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: _buildActionButton(context, actions[i]),
          ),
        ],
      ],
    );
  }

  Widget _buildActionButton(BuildContext context, AppBottomSheetAction action) {
    void handleTap() {
      action.onPressed?.call();
      if (action.dismissOnTap) {
        Navigator.of(context).pop(action.returnValue);
      }
    }

    final variant = switch (action.style) {
      AppBottomSheetActionStyle.primary => AppButtonVariant.primary,
      AppBottomSheetActionStyle.destructive => AppButtonVariant.destructive,
      AppBottomSheetActionStyle.secondary => AppButtonVariant.outlined,
    };

    final enabled = action.onPressed != null || action.dismissOnTap;

    return AppButton(
      label: action.label,
      onPressed: enabled ? handleTap : null,
      variant: variant,
      expand: true,
    );
  }
}
