import 'package:manage_teams/core/constants/snackbar_types.dart';
import 'package:flutter/material.dart';

class SimpleSnackbarService {
  static final GlobalKey<ScaffoldMessengerState> scaffoldMessengerKey =
      GlobalKey<ScaffoldMessengerState>();

  static void showSuccess(String message) => _show(message: message, type: SnackbarType.success);

  static void showError(String message) => _show(message: message, type: SnackbarType.error);

  static void showWarning(String message) => _show(message: message, type: SnackbarType.warning);

  static void showInfo(String message) => _show(message: message, type: SnackbarType.info);

  static void _show({required String message, required SnackbarType type}) {
    final messenger = scaffoldMessengerKey.currentState;
    if (messenger == null) return;

    final color = switch (type) {
      SnackbarType.success => Colors.green,
      SnackbarType.error => Colors.red,
      SnackbarType.warning => Colors.orange,
      SnackbarType.info => Colors.blue,
    };

    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
