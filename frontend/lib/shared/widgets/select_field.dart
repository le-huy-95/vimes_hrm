import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/core/skin/typo_skin.dart';
import 'package:manage_teams/shared/bottom_sheet/app_bottom_sheet_service.dart';
import 'package:manage_teams/shared/validators/form_validators.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_field_styles.dart';
import 'package:manage_teams/shared/widgets/app_search_field.dart';

class AppSelectItem {
  const AppSelectItem({required this.id, required this.title, this.subtitle});

  final String id;
  final String title;
  final String? subtitle;
}

class AppSelectField<T extends AppSelectItem> extends StatelessWidget {
  const AppSelectField({
    super.key,
    required this.label,
    required this.value,
    required this.hint,
    required this.items,
    required this.onChanged,
    this.bottomSheetTitle,
    this.searchHint,
    this.emptyText = 'Không tìm thấy kết quả',
    this.enabled = true,
    this.required = false,
    this.validator,
    this.helperText,
    this.actionLabel,
    this.onAction,
    this.labelTrailing,
    this.onBeforeOpen,
  });

  final String label;
  final String? value;
  final String hint;
  final List<T> items;
  final ValueChanged<String?> onChanged;
  final String? bottomSheetTitle;
  final String? searchHint;
  final String emptyText;
  final bool enabled;
  final bool required;
  final FormFieldValidator<String>? validator;
  final String? helperText;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Widget? labelTrailing;
  final Future<List<T>> Function()? onBeforeOpen;

  T? _currentItem(String? selected) {
    if (selected == null) return null;
    for (final item in items) {
      if (item.id == selected) return item;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final displayLabel = requiredFieldLabel(label, required: required);
    return FormField<String>(
      key: ValueKey<String>('$displayLabel:${value ?? ''}'),
      initialValue: value,
      validator: composeRequiredValidator(
        required: required,
        label: label,
        validator: validator,
      ),
      builder: (field) {
        final current = _currentItem(field.value);

        return AppLabeledField(
          label: displayLabel,
          trailing: labelTrailing,
          child: InkWell(
            onTap: enabled
                ? () async {
                    final refreshedItems = await onBeforeOpen?.call() ?? items;
                    if (!field.context.mounted) return;
                    final selectedItem = await AppSelectBottomSheet.show<T>(
                      context,
                      title: bottomSheetTitle ?? stripRequiredMark(label),
                      searchHint: searchHint ?? 'Tìm kiếm',
                      emptyText: emptyText,
                      items: refreshedItems,
                      actionLabel: actionLabel,
                      onAction: onAction,
                    );
                    field.didChange(selectedItem?.id);
                    onChanged(selectedItem?.id);
                  }
                : null,
            borderRadius: BorderRadius.circular(kAppFieldBorderRadius),
            child: InputDecorator(
              decoration: appFieldDecoration(
                hintText: hint,
                helperText: helperText,
                errorText: field.errorText,
                enabled: enabled,
              ),
              child: Text(
                current?.title ?? hint,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: current == null ? ColorSkin.subtitle : ColorSkin.title,
                  fontSize: 15,
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class AppSelectBottomSheet<T extends AppSelectItem> extends StatefulWidget {
  const AppSelectBottomSheet({
    super.key,
    required this.items,
    required this.searchHint,
    required this.emptyText,
    this.actionLabel,
    this.onAction,
  });

  final List<T> items;
  final String searchHint;
  final String emptyText;
  final String? actionLabel;
  final VoidCallback? onAction;

  static Future<T?> show<T extends AppSelectItem>(
    BuildContext context, {
    required String title,
    required List<T> items,
    required String searchHint,
    required String emptyText,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    return AppBottomSheetService.show<T>(
      context: context,
      title: title,
      useRootNavigator: true,
      // List owns Expanded/ListView — needs bounded height without nested
      // SingleChildScrollView from AppBottomSheet.
      scrollableContent: false,
      contentPadding: EdgeInsets.zero,
      content: AppSelectBottomSheet<T>(
        items: items,
        searchHint: searchHint,
        emptyText: emptyText,
        actionLabel: actionLabel,
        onAction: onAction,
      ),
      actions: const [],
    );
  }

  @override
  State<AppSelectBottomSheet<T>> createState() =>
      _AppSelectBottomSheetState<T>();
}

class _AppSelectBottomSheetState<T extends AppSelectItem>
    extends State<AppSelectBottomSheet<T>> {
  final _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  List<T> get _filtered {
    final q = _query.text.trim().toLowerCase();
    if (q.isEmpty) return widget.items;
    return widget.items.where((item) {
      return item.title.toLowerCase().contains(q) ||
          (item.subtitle?.toLowerCase().contains(q) ?? false);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: AppSearchField<void>(
            controller: _query,
            hintText: widget.searchHint,
            showClearButton: true,
            textInputAction: TextInputAction.search,
            onChanged: (_) => setState(() {}),
            onClear: () => setState(() {}),
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: _filtered.isEmpty
              ? GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.emptyText,
                          style: TypoSkin.bodyText2.copyWith(
                            color: ColorSkin.subtitle,
                          ),
                        ),
                        if (widget.onAction != null &&
                            widget.actionLabel != null) ...[
                          const SizedBox(height: 16),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            child: AppButton(
                              label: widget.actionLabel!,
                              onPressed: () {
                                FocusManager.instance.primaryFocus?.unfocus();
                                Navigator.of(context).pop();
                                widget.onAction?.call();
                              },
                              variant: AppButtonVariant.primary,
                              expand: true,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                )
              : Column(
                  children: [
                    Expanded(
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        keyboardDismissBehavior:
                            ScrollViewKeyboardDismissBehavior.onDrag,
                        itemCount: _filtered.length,
                        separatorBuilder: (_, _) => const Divider(
                          height: 1,
                          indent: 20,
                          endIndent: 20,
                        ),
                        itemBuilder: (context, index) {
                          final item = _filtered[index];
                          return ListTile(
                            title: Text(item.title),
                            subtitle: item.subtitle == null
                                ? null
                                : Text(item.subtitle!),
                            onTap: () {
                              FocusManager.instance.primaryFocus?.unfocus();
                              Navigator.of(context).pop(item);
                            },
                          );
                        },
                      ),
                    ),
                    if (widget.onAction != null &&
                        widget.actionLabel != null) ...[
                      const Divider(height: 1),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                        child: AppButton(
                          label: widget.actionLabel!,
                          onPressed: () {
                            FocusManager.instance.primaryFocus?.unfocus();
                            Navigator.of(context).pop();
                            widget.onAction?.call();
                          },
                          variant: AppButtonVariant.primary,
                          expand: true,
                        ),
                      ),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}
