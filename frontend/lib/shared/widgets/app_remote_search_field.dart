import 'dart:async';

import 'package:flutter/material.dart';
import 'package:manage_teams/shared/widgets/app_search_field.dart';

typedef RemoteSearchApi<T> = Future<List<T>> Function(String query);

class AppRemoteSearchField<T> extends StatefulWidget {
  const AppRemoteSearchField({
    super.key,
    required this.hintText,
    required this.searchApi,
    required this.onResultsChanged,
    this.controller,
    this.focusNode,
    this.onChanged,
    this.onSubmitted,
    this.onClear,
    this.onError,
    this.prefixIcon = Icons.search,
    this.prefix,
    this.suffixIcon,
    this.showClearButton = false,
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
  final RemoteSearchApi<T> searchApi;
  final ValueChanged<List<T>> onResultsChanged;
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onClear;
  final ValueChanged<Object>? onError;
  final IconData prefixIcon;
  final Widget? prefix;
  final Widget? suffixIcon;
  final bool showClearButton;
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
  State<AppRemoteSearchField<T>> createState() => _AppRemoteSearchFieldState<T>();
}

class _AppRemoteSearchFieldState<T> extends State<AppRemoteSearchField<T>> {
  late final TextEditingController _internalController;
  late final bool _ownsController;
  late final FocusNode _internalFocusNode;
  late final bool _ownsFocusNode;
  Timer? _debounceTimer;
  int _requestToken = 0;
  bool _searching = false;

  TextEditingController get _controller => widget.controller ?? _internalController;
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

  void _clearResults() {
    widget.onResultsChanged(const []);
  }

  Future<void> _search(String query) async {
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
      final results = await widget.searchApi(trimmed);
      if (!mounted || token != _requestToken) return;
      widget.onResultsChanged(results);
    } catch (error) {
      if (!mounted || token != _requestToken) return;
      widget.onError?.call(error);
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

  void _handleClear() {
    _debounceTimer?.cancel();
    if (mounted) {
      setState(() => _searching = false);
    }
    _clearResults();
    widget.onClear?.call();
  }

  @override
  Widget build(BuildContext context) {
    return AppSearchField(
      hintText: widget.hintText,
      controller: _controller,
      focusNode: _focusNode,
      onChanged: _handleChanged,
      onSubmitted: widget.onSubmitted,
      prefixIcon: widget.prefixIcon,
      prefix: widget.prefix,
      suffixIcon: widget.suffixIcon,
      showClearButton: widget.showClearButton,
      onClear: _handleClear,
      loading: widget.loading || _searching,
      autofocus: widget.autofocus,
      enabled: widget.enabled,
      fillColor: widget.fillColor,
      borderRadius: widget.borderRadius,
      contentPadding: widget.contentPadding,
      borderSide: widget.borderSide,
      focusedBorderSide: widget.focusedBorderSide,
      textInputAction: widget.textInputAction,
      keyboardType: widget.keyboardType,
    );
  }
}
