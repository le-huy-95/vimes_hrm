import 'dart:async';

import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/shared/widgets/app_field_styles.dart';

typedef SearchApi<T> = Future<List<T>> Function(String query);

class AppSearchField<T> extends StatefulWidget {
  const AppSearchField({
    super.key,
    required this.hintText,
    this.searchApi,
    this.onResultsChanged,
    this.controller,
    this.focusNode,
    this.onChanged,
    this.onSubmitted,
    this.prefixIcon = Icons.search,
    this.prefix,
    this.suffixIcon,
    this.showClearButton = false,
    this.onClear,
    this.loading = false,
    this.autofocus = false,
    this.enabled = true,
    this.fillColor = Colors.white,
    this.borderRadius = 12,
    this.contentPadding,
    this.borderSide,
    this.focusedBorderSide,
    this.textInputAction,
    this.keyboardType,
    this.minimumQueryLength = 1,
    this.debounceDuration = const Duration(milliseconds: 350),
  });

  final String hintText;
  final SearchApi<T>? searchApi;
  final ValueChanged<List<T>>? onResultsChanged;
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final IconData prefixIcon;
  final Widget? prefix;
  final Widget? suffixIcon;
  final bool showClearButton;
  final VoidCallback? onClear;
  final bool loading;
  final bool autofocus;
  final bool enabled;
  final Color fillColor;
  final double borderRadius;
  final EdgeInsetsGeometry? contentPadding;
  final BorderSide? borderSide;
  final BorderSide? focusedBorderSide;
  final TextInputAction? textInputAction;
  final TextInputType? keyboardType;
  final int minimumQueryLength;
  final Duration debounceDuration;

  @override
  State<AppSearchField<T>> createState() => _AppSearchFieldState<T>();
}

class _AppSearchFieldState<T> extends State<AppSearchField<T>> {
  late final TextEditingController _internalController;
  late final bool _ownsController;
  late final FocusNode _internalFocusNode;
  late final bool _ownsFocusNode;
  Timer? _debounceTimer;
  int _requestToken = 0;
  bool _searching = false;

  TextEditingController get _controller =>
      widget.controller ?? _internalController;
  FocusNode get _focusNode => widget.focusNode ?? _internalFocusNode;

  @override
  void initState() {
    super.initState();
    _ownsController = widget.controller == null;
    _ownsFocusNode = widget.focusNode == null;
    _internalController = TextEditingController();
    _internalFocusNode = FocusNode();
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    if (_ownsController) {
      _internalController.dispose();
    }
    if (_ownsFocusNode) {
      _internalFocusNode.dispose();
    }
    super.dispose();
  }

  void _clear() {
    _controller.clear();
    widget.onChanged?.call('');
    widget.onClear?.call();
    _clearResults();
  }

  void _clearResults() {
    if (widget.onResultsChanged != null) {
      widget.onResultsChanged!(const []);
    }
  }

  Future<void> _search(String query) async {
    if (widget.searchApi == null || widget.onResultsChanged == null) return;

    final trimmed = query.trim();
    if (trimmed.length < widget.minimumQueryLength) {
      if (mounted) {
        setState(() => _searching = false);
      }
      _clearResults();
      return;
    }

    final token = ++_requestToken;
    if (mounted) {
      setState(() => _searching = true);
    }

    try {
      final results = await widget.searchApi!(trimmed);
      if (!mounted || token != _requestToken) return;
      widget.onResultsChanged!(results);
    } catch (_) {
      if (!mounted || token != _requestToken) return;
      _clearResults();
    } finally {
      if (mounted && token == _requestToken) {
        setState(() => _searching = false);
      }
    }
  }

  void _handleChanged(String query) {
    widget.onChanged?.call(query);
    _debounceTimer?.cancel();
    if (widget.searchApi != null && widget.onResultsChanged != null) {
      if (query.trim().length < widget.minimumQueryLength) {
        if (mounted) {
          setState(() => _searching = false);
        }
        _clearResults();
        return;
      }
      _debounceTimer = Timer(widget.debounceDuration, () {
        _search(query);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final borderSide =
        widget.borderSide ?? const BorderSide(color: ColorSkin.border1);
    final focusedBorderSide =
        widget.focusedBorderSide ??
        const BorderSide(color: ColorSkin.primary, width: 1.5);

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final hasText = _controller.text.isNotEmpty;
        Widget? effectiveSuffix;
        if (widget.loading || _searching) {
          effectiveSuffix = const Padding(
            padding: EdgeInsets.all(12),
            child: SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          );
        } else if (widget.showClearButton && hasText) {
          effectiveSuffix = IconButton(
            icon: const Icon(Icons.close, size: 20),
            onPressed: _clear,
          );
        } else {
          effectiveSuffix = widget.suffixIcon;
        }

        return TextField(
          controller: _controller,
          focusNode: _focusNode,
          autofocus: widget.autofocus,
          enabled: widget.enabled,
          keyboardType: widget.keyboardType,
          textInputAction: widget.textInputAction,
          onChanged: _handleChanged,
          onSubmitted: widget.onSubmitted,
          onTapOutside: (_) =>
              FocusScope.of(context, createDependency: false).unfocus(),
          decoration: appFieldDecoration(
            hintText: widget.hintText,
            prefixIcon: widget.prefix ?? Icon(widget.prefixIcon),
            suffixIcon: effectiveSuffix,
            enabled: widget.enabled,
            fillColor: widget.fillColor,
            borderRadius: widget.borderRadius,
            contentPadding:
                widget.contentPadding ??
                const EdgeInsets.symmetric(vertical: 12),
            borderSide: borderSide,
            focusedBorderSide: focusedBorderSide,
          ),
        );
      },
    );
  }
}
