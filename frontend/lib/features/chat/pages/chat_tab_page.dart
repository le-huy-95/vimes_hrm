import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_bloc.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_state.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_bloc.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_state.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/home/data/google_chat_repository.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:url_launcher/url_launcher.dart';

class ChatTabPage extends StatelessWidget {
  const ChatTabPage({super.key});

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 800;

    return MultiBlocListener(
      listeners: [
        BlocListener<ChatListBloc, ChatListState>(
          listenWhen: (prev, next) {
            final prevId = prev is ChatListReady ? prev.selected?.id : null;
            final nextId = next is ChatListReady ? next.selected?.id : null;
            return prevId != nextId || next is ChatListFailure;
          },
          listener: (context, state) {
            if (state is ChatListFailure) {
              SimpleSnackbarService.showError(state.message);
            } else if (state is ChatListReady && state.selected != null) {
              final link = state.selected!;
              context.read<ChatThreadBloc>().add(ChatThreadOpened(
                    groupId: state.groupId,
                    spaceName: link.spaceName,
                    title: link.title,
                  ));
            } else if (state is ChatListReady && state.selected == null) {
              context.read<ChatThreadBloc>().add(const ChatThreadClosed());
            }
          },
        ),
        BlocListener<ChatThreadBloc, ChatThreadState>(
          listener: (context, state) {
            if (state is ChatThreadFailure) {
              SimpleSnackbarService.showError(state.message);
            } else if (state is ChatThreadReady && state.taskWarning != null) {
              SimpleSnackbarService.showError(state.taskWarning!);
            }
          },
        ),
      ],
      child: BlocBuilder<ChatListBloc, ChatListState>(
        builder: (context, listState) {
          final selected =
              listState is ChatListReady ? listState.selected : null;

          if (wide) {
            return Row(
              children: [
                SizedBox(width: 320, child: _LinkList(listState)),
                const VerticalDivider(width: 1),
                const Expanded(child: _ThreadPane()),
              ],
            );
          }

          if (selected == null) {
            return _LinkList(listState);
          }

          return Column(
            children: [
              ListTile(
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () => context
                      .read<ChatListBloc>()
                      .add(const ChatListClearSelection()),
                ),
                title: Text(selected.title),
                subtitle: const Text('Google Chat'),
              ),
              const Expanded(child: _ThreadPane()),
            ],
          );
        },
      ),
    );
  }
}

class _LinkList extends StatelessWidget {
  const _LinkList(this.state);
  final ChatListState state;

  @override
  Widget build(BuildContext context) {
    if (state is ChatListLoading || state is ChatListInitial) {
      final ws = context.watch<WorkspaceBloc>().state;
      if (ws is WorkspaceReady && ws.selectedGroupId == null) {
        return const Center(child: Text('Chọn nhóm để xem Google Chat'));
      }
      if (state is ChatListInitial) {
        return const Center(child: Text('Chọn nhóm để xem Google Chat'));
      }
      return const Center(child: CircularProgressIndicator());
    }
    if (state is ChatListFailure) {
      return Center(
        child: TextButton(
          onPressed: () =>
              context.read<ChatListBloc>().add(const ChatListStarted()),
          child: Text('Thử lại: ${(state as ChatListFailure).message}'),
        ),
      );
    }
    if (state is! ChatListReady) return const SizedBox.shrink();
    final ready = state as ChatListReady;

    if (!ready.readiness.isReady) {
      return _ReadinessGate(ready);
    }

    return Column(
      children: [
        ListTile(
          title: const Text('Google Chat'),
          subtitle: Text(
            ready.links.isEmpty
                ? 'Chưa liên kết space'
                : '${ready.links.length} cuộc trò chuyện',
          ),
          trailing: ready.busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : IconButton(
                  tooltip: 'Làm mới',
                  onPressed: () => context
                      .read<ChatListBloc>()
                      .add(const ChatListRefreshRequested()),
                  icon: const Icon(Icons.refresh),
                ),
        ),
        if (ready.links.isEmpty)
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      ready.isAdmin
                          ? 'Liên kết Google Chat space với nhóm này'
                          : 'Chờ admin liên kết Google Chat',
                      textAlign: TextAlign.center,
                    ),
                    if (ready.isAdmin) ...[
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: () => _openLinkPicker(context, ready),
                        icon: const Icon(Icons.link),
                        label: const Text('Liên kết Google Chat'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          )
        else
          Expanded(
            child: ListView(
              children: [
                if (ready.isAdmin)
                  ListTile(
                    leading: const Icon(Icons.add_link),
                    title: const Text('Thêm liên kết…'),
                    onTap: () => _openLinkPicker(context, ready),
                  ),
                ...ready.links.map((link) {
                  final selected = ready.selected?.id == link.id;
                  return ListTile(
                    selected: selected,
                    leading: const Icon(Icons.chat_bubble_outline),
                    title: Text(link.title),
                    subtitle: Text(link.spaceType ?? 'SPACE'),
                    trailing: ready.isAdmin
                        ? IconButton(
                            tooltip: 'Gỡ liên kết',
                            icon: const Icon(Icons.link_off),
                            onPressed: () => context
                                .read<ChatListBloc>()
                                .add(ChatListUnlinkRequested(link.id)),
                          )
                        : null,
                    onTap: () => context
                        .read<ChatListBloc>()
                        .add(ChatListSelectLinkRequested(link)),
                  );
                }),
              ],
            ),
          ),
      ],
    );
  }

  Future<void> _openLinkPicker(BuildContext context, ChatListReady ready) async {
    final repo = context.read<GoogleChatRepository>();
    SimpleSnackbarService.showInfo('Đang tải danh sách Google Chat…');
    try {
      final result = await repo.listSpaces();
      if (!context.mounted) return;
      if (!result.readiness.isReady) {
        SimpleSnackbarService.showError(
          result.readiness.reason ?? 'Google Chat chưa sẵn sàng',
        );
        return;
      }
      final linked = ready.links.map((l) => l.spaceName).toSet();
      final picked = await showModalBottomSheet<List<GoogleChatSpaceItem>>(
        context: context,
        isScrollControlled: true,
        builder: (ctx) => _SpacePickerSheet(
          spaces: result.spaces,
          alreadyLinked: linked,
        ),
      );
      if (picked == null || picked.isEmpty || !context.mounted) return;
      context.read<ChatListBloc>().add(ChatListLinkSpacesRequested(picked));
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }
}

class _ReadinessGate extends StatelessWidget {
  const _ReadinessGate(this.ready);
  final ChatListReady ready;

  @override
  Widget build(BuildContext context) {
    final status = ready.readiness.status;
    final reason = ready.readiness.reason ?? '';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              status == 'needs_reconsent'
                  ? Icons.lock_outline
                  : Icons.chat_bubble_outline,
              size: 48,
              color: ColorSkin.subtitle,
            ),
            const SizedBox(height: 16),
            Text(
              status == 'needs_reconsent'
                  ? 'Cần đăng nhập Google lại để cấp quyền Chat'
                  : status == 'chat_disabled'
                      ? 'Tài khoản chưa bật Google Chat'
                      : 'Không kiểm tra được Google Chat',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (reason.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(reason, textAlign: TextAlign.center),
            ],
            const SizedBox(height: 20),
            if (status == 'needs_reconsent')
              FilledButton(
                onPressed: () => context.push(AppRoutes.linkGoogle.path),
                child: const Text('Liên kết Google lại'),
              )
            else if (status == 'chat_disabled') ...[
              FilledButton(
                onPressed: () => launchUrl(
                  Uri.parse('https://chat.google.com'),
                  mode: LaunchMode.externalApplication,
                ),
                child: const Text('Mở Google Chat'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => context
                    .read<ChatListBloc>()
                    .add(const ChatListRefreshRequested()),
                child: const Text('Đã bật, thử lại'),
              ),
            ] else
              TextButton(
                onPressed: () => context
                    .read<ChatListBloc>()
                    .add(const ChatListRefreshRequested()),
                child: const Text('Thử lại'),
              ),
          ],
        ),
      ),
    );
  }
}

class _SpacePickerSheet extends StatefulWidget {
  const _SpacePickerSheet({
    required this.spaces,
    required this.alreadyLinked,
  });
  final List<GoogleChatSpaceItem> spaces;
  final Set<String> alreadyLinked;

  @override
  State<_SpacePickerSheet> createState() => _SpacePickerSheetState();
}

class _SpacePickerSheetState extends State<_SpacePickerSheet> {
  final _selected = <String>{};

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.7,
        child: Column(
          children: [
            const ListTile(title: Text('Chọn Google Chat space')),
            Expanded(
              child: ListView.builder(
                itemCount: widget.spaces.length,
                itemBuilder: (context, i) {
                  final s = widget.spaces[i];
                  final linked = widget.alreadyLinked.contains(s.name);
                  final checked = _selected.contains(s.name);
                  return CheckboxListTile(
                    value: linked || checked,
                    onChanged: linked
                        ? null
                        : (v) => setState(() {
                              if (v == true) {
                                _selected.add(s.name);
                              } else {
                                _selected.remove(s.name);
                              }
                            }),
                    title: Text(s.displayName),
                    subtitle: Text(linked ? 'Đã liên kết · ${s.spaceType}' : s.spaceType),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: FilledButton(
                onPressed: _selected.isEmpty
                    ? null
                    : () {
                        final picked = widget.spaces
                            .where((s) => _selected.contains(s.name))
                            .toList();
                        Navigator.pop(context, picked);
                      },
                child: Text('Liên kết (${_selected.length})'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ThreadPane extends StatelessWidget {
  const _ThreadPane();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ChatThreadBloc, ChatThreadState>(
      builder: (context, state) {
        if (state is ChatThreadInitial) {
          return const Center(
            child: Text('Chọn một cuộc trò chuyện Google Chat'),
          );
        }
        if (state is ChatThreadLoading) {
          return const Center(child: CircularProgressIndicator());
        }
        final ready = state is ChatThreadReady
            ? state
            : (state is ChatThreadFailure ? state.previous : null);
        if (ready == null) {
          final msg = state is ChatThreadFailure ? state.message : 'Lỗi';
          return Center(child: Text(msg));
        }

        return Column(
          children: [
            if (MediaQuery.sizeOf(context).width >= 800)
              ListTile(
                title: Text(ready.title ?? ready.spaceName),
                subtitle: const Text('Google Chat'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: 'Thêm công việc',
                      icon: const Icon(Icons.task_alt),
                      onPressed: ready.busy
                          ? null
                          : () => _openCreateTask(context, ready),
                    ),
                    IconButton(
                      tooltip: 'Làm mới',
                      icon: const Icon(Icons.refresh),
                      onPressed: () => context
                          .read<ChatThreadBloc>()
                          .add(const ChatThreadRefreshRequested()),
                    ),
                  ],
                ),
              ),
            if (MediaQuery.sizeOf(context).width < 800)
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  tooltip: 'Thêm công việc',
                  icon: const Icon(Icons.task_alt),
                  onPressed: ready.busy
                      ? null
                      : () => _openCreateTask(context, ready),
                ),
              ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: ready.messages.length,
                itemBuilder: (context, i) {
                  final m = ready.messages[i];
                  return Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: ColorSkin.tealLight,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            m.sender.isEmpty ? '—' : m.sender,
                            style: Theme.of(context).textTheme.labelMedium,
                          ),
                          const SizedBox(height: 4),
                          Text(m.text),
                          if (m.createTime != null) ...[
                            const SizedBox(height: 4),
                            Text(
                              m.createTime!.toLocal().toString(),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            if (ready.busy) const LinearProgressIndicator(minHeight: 2),
            _Composer(enabled: !ready.busy),
          ],
        );
      },
    );
  }

  Future<void> _openCreateTask(
    BuildContext context,
    ChatThreadReady ready,
  ) async {
    final core = context.read<CoreRepository>();
    final detail = await core.getGroup(ready.groupId);
    if (!context.mounted) return;
    final result = await showDialog<_CreateTaskResult>(
      context: context,
      builder: (ctx) => _CreateTaskDialog(members: detail.members),
    );
    if (result == null || !context.mounted) return;
    context.read<ChatThreadBloc>().add(ChatThreadCreateTaskRequested(
          title: result.title,
          assigneeIds: result.assigneeIds,
          dueDate: result.dueDate,
        ));
  }
}

class _Composer extends StatefulWidget {
  const _Composer({required this.enabled});
  final bool enabled;

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    context.read<ChatThreadBloc>().add(ChatThreadSendRequested(text));
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                enabled: widget.enabled,
                minLines: 1,
                maxLines: 4,
                decoration: const InputDecoration(
                  hintText: 'Nhắn trên Google Chat…',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                onSubmitted: (_) => _send(),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: widget.enabled ? _send : null,
              icon: const Icon(Icons.send),
            ),
          ],
        ),
      ),
    );
  }
}

class _CreateTaskResult {
  const _CreateTaskResult({
    required this.title,
    required this.assigneeIds,
    this.dueDate,
  });
  final String title;
  final List<String> assigneeIds;
  final String? dueDate;
}

class _CreateTaskDialog extends StatefulWidget {
  const _CreateTaskDialog({required this.members});
  final List<GroupMember> members;

  @override
  State<_CreateTaskDialog> createState() => _CreateTaskDialogState();
}

class _CreateTaskDialogState extends State<_CreateTaskDialog> {
  final _title = TextEditingController();
  final _selected = <String>{};
  DateTime? _due;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Thêm công việc'),
      content: SizedBox(
        width: 400,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _title,
                decoration: const InputDecoration(
                  labelText: 'Tiêu đề',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  _due == null
                      ? 'Hạn (tuỳ chọn)'
                      : 'Hạn: ${_due!.toIso8601String().substring(0, 10)}',
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.calendar_today),
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: DateTime.now(),
                      firstDate: DateTime.now().subtract(const Duration(days: 1)),
                      lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
                    );
                    if (picked != null) setState(() => _due = picked);
                  },
                ),
              ),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('Giao cho'),
              ),
              ...widget.members.map((m) {
                final label = (m.displayName?.trim().isNotEmpty == true)
                    ? m.displayName!
                    : (m.email.isNotEmpty ? m.email : m.userId);
                return CheckboxListTile(
                  dense: true,
                  value: _selected.contains(m.userId),
                  onChanged: (v) => setState(() {
                    if (v == true) {
                      _selected.add(m.userId);
                    } else {
                      _selected.remove(m.userId);
                    }
                  }),
                  title: Text(label),
                );
              }),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Huỷ'),
        ),
        FilledButton(
          onPressed: () {
            final title = _title.text.trim();
            if (title.isEmpty) return;
            Navigator.pop(
              context,
              _CreateTaskResult(
                title: title,
                assigneeIds: _selected.toList(),
                dueDate: _due?.toIso8601String().substring(0, 10),
              ),
            );
          },
          child: const Text('Tạo'),
        ),
      ],
    );
  }
}
