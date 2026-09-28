import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';

enum AppHeaderVariant {
  detail,
  auth,
}

class AppHeader extends StatelessWidget implements PreferredSizeWidget {
  const AppHeader({
    super.key,
    this.variant = AppHeaderVariant.detail,
    this.leading,
    this.title,
    this.actions,
    this.bottom,
    this.leadingWidth,
    this.titleSpacing,
    this.centerTitle,
    this.automaticallyImplyLeading,
    this.toolbarHeight,
    this.backgroundColor,
    this.foregroundColor,
    this.elevation,
    this.titlePadding,
    this.titleOverflow = TextOverflow.ellipsis,
    this.onTitleTap,
  });

  final AppHeaderVariant variant;
  final Widget? leading;
  final Widget? title;
  final List<Widget>? actions;
  final PreferredSizeWidget? bottom;
  final double? leadingWidth;
  final double? titleSpacing;
  final bool? centerTitle;
  final bool? automaticallyImplyLeading;
  final double? toolbarHeight;
  final Color? backgroundColor;
  final Color? foregroundColor;
  final double? elevation;
  final EdgeInsetsGeometry? titlePadding;
  final TextOverflow titleOverflow;
  final VoidCallback? onTitleTap;

  double get _defaultToolbarHeight => kToolbarHeight;

  double get _defaultLeadingWidth => 56;

  bool get _defaultCenterTitle => false;

  double get _defaultTitleSpacing => 0;

  @override
  Size get preferredSize {
    final bottomHeight = bottom?.preferredSize.height ?? 0;
    return Size.fromHeight(
      (toolbarHeight ?? _defaultToolbarHeight) + bottomHeight,
    );
  }

  @override
  Widget build(BuildContext context) {
    final effectiveForeground = foregroundColor ?? ColorSkin.title;
    final effectiveTitleStyle = TextStyle(
      color: effectiveForeground,
      fontSize: 16,
      fontWeight: FontWeight.w700,
    );
    final showsDefaultBackButton = leading == null &&
        automaticallyImplyLeading != false &&
        (ModalRoute.of(context)?.canPop ?? false);
    final effectiveTitleOnTap = onTitleTap ??
        (showsDefaultBackButton ? () => Navigator.of(context).maybePop() : null);
    final effectiveTitle = title == null
        ? null
        : Padding(
            padding: titlePadding ?? EdgeInsets.zero,
            child: _wrapTitleIfTappable(
              _truncatableTitle(title!, effectiveTitleStyle),
              effectiveTitleOnTap,
            ),
          );

    return AppBar(
      leading: leading,
      title: effectiveTitle,
      actions: actions,
      bottom: bottom,
      toolbarHeight: toolbarHeight ?? _defaultToolbarHeight,
      leadingWidth: leadingWidth ?? _defaultLeadingWidth,
      titleSpacing: titleSpacing ?? _defaultTitleSpacing,
      centerTitle: centerTitle ?? _defaultCenterTitle,
      automaticallyImplyLeading: automaticallyImplyLeading ?? true,
      backgroundColor: backgroundColor ?? ColorSkin.white,
      surfaceTintColor: backgroundColor ?? ColorSkin.white,
      shadowColor: Colors.transparent,
      elevation: elevation ?? 0,
      scrolledUnderElevation: 0,
      foregroundColor: effectiveForeground,
      iconTheme: IconThemeData(color: effectiveForeground),
      actionsIconTheme: IconThemeData(color: effectiveForeground),
      titleTextStyle: effectiveTitleStyle,
    );
  }

  Widget _wrapTitleIfTappable(Widget title, VoidCallback? onTap) {
    if (onTap == null) return title;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: title,
    );
  }

  Widget _truncatableTitle(Widget title, TextStyle baseStyle) {
    Widget resolved = title;
    if (title is Text && title.data != null) {
      resolved = Text(
        title.data!,
        key: title.key,
        style: baseStyle.merge(title.style),
        textAlign: title.textAlign,
        softWrap: false,
        overflow: titleOverflow,
        maxLines: 1,
      );
    }
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: double.infinity),
      child: resolved,
    );
  }
}
