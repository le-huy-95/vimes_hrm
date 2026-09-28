import 'package:flutter/material.dart';
import 'package:manage_teams/shared/bottom_sheet/app_bottom_sheet.dart';
import 'package:manage_teams/shared/bottom_sheet/app_bottom_sheet_action.dart';

class AppBottomSheetService {
  AppBottomSheetService._();

  static Future<T?> show<T>({
    required BuildContext context,
    String? title,
    String? message,
    Widget? content,
    required List<AppBottomSheetAction> actions,
    bool isDismissible = true,
    bool useRootNavigator = false,
    bool scrollableContent = true,
    bool showHandle = true,
    bool showCloseButton = false,
    VoidCallback? onClose,
    // Data-display sheets only: full-sheet loading until content reports ready.
    bool initialContentLoading = false,
    EdgeInsetsGeometry contentPadding = const EdgeInsets.fromLTRB(
      20,
      12,
      20,
      0,
    ),
    EdgeInsetsGeometry actionsPadding = const EdgeInsets.fromLTRB(
      20,
      20,
      20,
      16,
    ),
  }) {
    // Close any keyboard from the underlying page before presenting the sheet.
    FocusManager.instance.primaryFocus?.unfocus();

    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      isDismissible: isDismissible,
      enableDrag: isDismissible,
      useRootNavigator: useRootNavigator,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return AppBottomSheet(
          title: title,
          message: message,
          content: content,
          actions: actions,
          scrollableContent: scrollableContent,
          showHandle: showHandle,
          showCloseButton: showCloseButton,
          onClose: onClose,
          initialContentLoading: initialContentLoading,
          contentPadding: contentPadding,
          actionsPadding: actionsPadding,
        );
      },
    );
  }

  static Future<bool?> showConfirm({
    required BuildContext context,
    required String title,
    String? message,
    String confirmLabel = 'Xác nhận',
    String cancelLabel = 'Huỷ',
    AppBottomSheetActionStyle confirmStyle = AppBottomSheetActionStyle.primary,
  }) {
    return show<bool>(
      context: context,
      title: title,
      message: message,
      actions: [
        AppBottomSheetAction(label: cancelLabel, returnValue: false),
        AppBottomSheetAction(
          label: confirmLabel,
          style: confirmStyle,
          returnValue: true,
        ),
      ],
    );
  }

  static Future<void> showLogoutConfirm({
    required BuildContext context,
    required VoidCallback onConfirm,
  }) async {
    final confirmed = await showConfirm(
      context: context,
      title: 'Đăng xuất?',
      message: 'Bạn có chắc muốn đăng xuất khỏi tài khoản?',
      confirmLabel: 'Đăng xuất',
      cancelLabel: 'Huỷ',
      confirmStyle: AppBottomSheetActionStyle.destructive,
    );
    if (confirmed == true) {
      onConfirm();
    }
  }
}
