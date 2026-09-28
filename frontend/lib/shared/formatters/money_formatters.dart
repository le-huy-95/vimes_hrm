import 'package:flutter/services.dart';

/// Định dạng tiền tệ theo kiểu Việt Nam: 1.234.567 (bỏ phần thập phân = 0).
String formatMoney(num value) {
  final fixed = value.toStringAsFixed(2);
  final dot = fixed.indexOf('.');
  final intPart = fixed.substring(0, dot);
  final decPart = fixed.substring(dot + 1);

  final buffer = StringBuffer();
  for (var i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 == 0) buffer.write('.');
    buffer.write(intPart[i]);
  }
  final hasDecimals = decPart != '00';
  return '$buffer${hasDecimals ? ',$decPart' : ''}';
}

/// Chuyển chuỗi tiền hiển thị → số thô (bỏ dấu ngăn cách nghìn).
String parseMoneyRaw(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return '';

  final lastComma = trimmed.lastIndexOf(',');
  if (lastComma != -1) {
    final intPart = trimmed.substring(0, lastComma).replaceAll('.', '');
    final decPart = trimmed.substring(lastComma + 1);
    return '$intPart.$decPart';
  }
  return trimmed.replaceAll('.', '');
}

/// Định dạng chuỗi số thô thành chuỗi tiền hiển thị.
///
/// Chấp nhận số thô (`1234.56`) hoặc chuỗi đã format (`1.234,56`).
String formatMoneyRaw(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  // Ưu tiên parse số thô (dấu `.` thập phân) trước khi parse kiểu hiển thị VN.
  final parsed =
      double.tryParse(trimmed) ?? double.tryParse(parseMoneyRaw(trimmed));
  if (parsed == null) return trimmed;
  return formatMoney(parsed);
}

/// Input formatter cho field tiền VND (chỉ số nguyên, dấu chấm ngăn nghìn).
class MoneyInputFormatter extends TextInputFormatter {
  const MoneyInputFormatter();
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'[^\d]'), '');
    if (digits.isEmpty) {
      return const TextEditingValue(text: '');
    }

    final number = int.tryParse(digits);
    if (number == null) return oldValue;

    final formatted = formatMoney(number);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
