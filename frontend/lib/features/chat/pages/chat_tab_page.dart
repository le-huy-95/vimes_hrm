import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_bloc.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_state.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_bloc.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_state.dart';
import 'package:manage_teams/features/home/data/file_repository.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:url_launcher/url_launcher.dart';

const _quickEmojis = ['👍', '❤️', '😂', '🎉', '👀'];

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
              context
                  .read<ChatThreadBloc>()
                  .add(ChatThreadOpened(state.selected!.id));
            } else if (state is ChatListReady && state.selected == null) {
              context.read<ChatThreadBloc>().add(const ChatThreadClosed());
            }
          },
        ),
        BlocListener<ChatThreadBloc, ChatThreadState>(
          listener: (context, state) {
            if (state is ChatThreadFailure) {
              SimpleSnackbarService.showError(state.message);
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
                SizedBox(width: 300, child: _ConversationList(listState)),
                const VerticalDivider(width: 1),
                const Expanded(child: _ThreadPane()),
              ],
            );
          }

          if (selected == null) {
            return _ConversationList(listState);
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
                title: Text(selected.title ?? 'Chat'),
              ),
              const Expanded(child: _ThreadPane()),
            ],
          );
        },
      ),
    );
  }
}

class _ConversationList extends StatelessWidget {
  const _ConversationList(this.state);
  final ChatListState state;

  @override
  Widget build(BuildContext context) {
    if (state is ChatListLoading || state is ChatListInitial) {
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

    return ListView(
      children: [
        const ListTile(
          title: Text(
            'NHÓM',
            style: TextStyle(fontSize: 12, color: ColorSkin.subtitle),
          ),
        ),
        if (ready.groupConversations.isEmpty)
          const ListTile(title: Text('Chưa có chat nhóm')),
        for (final c in ready.groupConversations)
          ListTile(
            selected: ready.selected?.id == c.id,
            selectedTileColor: ColorSkin.tealLight,
            title: Text(
              c.title ?? '# Group',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            onTap: () =>
                context.read<ChatListBloc>().add(ChatListSelectRequested(c)),
          ),
        const ListTile(
          title: Text(
            'THEO TASK',
            style: TextStyle(fontSize: 12, color: ColorSkin.subtitle),
          ),
        ),
        if (ready.taskConversations.isEmpty)
          const ListTile(title: Text('Chưa có chat task')),
        for (final c in ready.taskConversations)
          ListTile(
            selected: ready.selected?.id == c.id,
            title: Text(c.title ?? 'Task'),
            onTap: () =>
                context.read<ChatListBloc>().add(ChatListSelectRequested(c)),
          ),
      ],
    );
  }
}

class _ThreadPane extends StatefulWidget {
  const _ThreadPane();

  @override
  State<_ThreadPane> createState() => _ThreadPaneState();
}

class _ThreadPaneState extends State<_ThreadPane> {
  final _body = TextEditingController();
  final _search = TextEditingController();
  bool _searchOpen = false;

  @override
  void dispose() {
    _body.dispose();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ChatThreadBloc, ChatThreadState>(
      builder: (context, state) {
        if (state is ChatThreadInitial) {
          return const Center(
            child: Text(
              'Chọn hội thoại',
              style: TextStyle(color: ColorSkin.subtitle),
            ),
          );
        }
        if (state is ChatThreadLoading) {
          return const Center(child: CircularProgressIndicator());
        }

        final ready = switch (state) {
          ChatThreadReady() => state,
          ChatThreadFailure(:final previous) => previous,
          _ => null,
        };
        if (ready == null) {
          return const Center(child: Text('Không tải được tin nhắn'));
        }

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
              child: Row(
                children: [
                  if (_searchOpen)
                    Expanded(
                      child: TextField(
                        controller: _search,
                        autofocus: true,
                        decoration: InputDecoration(
                          hintText: 'Tìm tin (≥ 2 ký tự)…',
                          isDense: true,
                          border: const OutlineInputBorder(),
                          suffixIcon: IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _search.clear();
                              context
                                  .read<ChatThreadBloc>()
                                  .add(const ChatThreadClearSearch());
                              setState(() => _searchOpen = false);
                            },
                          ),
                        ),
                        onChanged: (v) {
                          context
                              .read<ChatThreadBloc>()
                              .add(ChatThreadSearchRequested(v));
                        },
                      ),
                    )
                  else
                    const Spacer(),
                  IconButton(
                    tooltip: 'Tìm tin',
                    icon: Icon(
                      _searchOpen ? Icons.search_off : Icons.search,
                      color: ColorSkin.primary,
                    ),
                    onPressed: () {
                      if (_searchOpen) {
                        _search.clear();
                        context
                            .read<ChatThreadBloc>()
                            .add(const ChatThreadClearSearch());
                      }
                      setState(() => _searchOpen = !_searchOpen);
                    },
                  ),
                ],
              ),
            ),
            if (ready.searching)
              const LinearProgressIndicator(minHeight: 2),
            if (ready.isSearching) ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '${ready.searchResults.length} kết quả cho “${ready.searchQuery}”',
                    style: const TextStyle(
                      color: ColorSkin.subtitle,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
              Expanded(
                child: ready.searchResults.isEmpty
                    ? const Center(
                        child: Text(
                          'Không tìm thấy tin phù hợp',
                          style: TextStyle(color: ColorSkin.subtitle),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: ready.searchResults.length,
                        itemBuilder: (context, i) {
                          return _MessageBubble(
                            message: ready.searchResults[i],
                          );
                        },
                      ),
              ),
            ] else
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: ready.messages.length,
                  itemBuilder: (context, i) {
                    return _MessageBubble(message: ready.messages[i]);
                  },
                ),
              ),
            if (ready.busy)
              const LinearProgressIndicator(minHeight: 2),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Đính kèm file',
                    icon: const Icon(Icons.attach_file, color: ColorSkin.primary),
                    onPressed: ready.busy ? null : () => _pickFile(context),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _body,
                      decoration: const InputDecoration(
                        hintText: 'Tin nhắn…',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _send(context),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.send, color: ColorSkin.primary),
                    onPressed: ready.busy ? null : () => _send(context),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  void _send(BuildContext context) {
    final text = _body.text.trim();
    if (text.isEmpty) return;
    _body.clear();
    context.read<ChatThreadBloc>().add(ChatThreadSendRequested(text));
  }

  Future<void> _pickFile(BuildContext context) async {
    final result = await FilePicker.platform.pickFiles(
      withData: true,
      type: FileType.any,
    );
    if (result == null || result.files.isEmpty || !context.mounted) return;
    final file = result.files.first;
    final bytes = file.bytes;
    if (bytes == null) {
      SimpleSnackbarService.showError('Không đọc được file');
      return;
    }
    final caption = _body.text.trim();
    _body.clear();
    context.read<ChatThreadBloc>().add(
          ChatThreadAttachRequested(
            bytes: bytes,
            fileName: file.name,
            contentType: file.extension != null
                ? _guessContentType(file.extension!)
                : null,
            caption: caption,
          ),
        );
  }

  String? _guessContentType(String ext) {
    final e = ext.toLowerCase();
    return switch (e) {
      'png' => 'image/png',
      'jpg' || 'jpeg' => 'image/jpeg',
      'gif' => 'image/gif',
      'webp' => 'image/webp',
      'pdf' => 'application/pdf',
      'txt' => 'text/plain',
      _ => null,
    };
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final m = message;
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.78,
        ),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: BoxDecoration(
          color: ColorSkin.tealLight,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (m.deleted)
              const Text(
                '(đã xóa)',
                style: TextStyle(fontStyle: FontStyle.italic),
              )
            else ...[
              if (m.body.isNotEmpty) Text(m.body),
              if (m.fileIds.isNotEmpty) ...[
                if (m.body.isNotEmpty) const SizedBox(height: 6),
                for (final fileId in m.fileIds)
                  _FileChip(fileId: fileId),
              ],
            ],
            if (!m.deleted) ...[
              const SizedBox(height: 6),
              Wrap(
                spacing: 4,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  for (final r in m.reactions)
                    InkWell(
                      onTap: () => context.read<ChatThreadBloc>().add(
                            ChatThreadReactionToggled(
                              messageId: m.id,
                              emoji: r.emoji,
                            ),
                          ),
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: r.me
                              ? ColorSkin.primary.withValues(alpha: 0.15)
                              : Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: r.me
                                ? ColorSkin.primary
                                : ColorSkin.border1,
                          ),
                        ),
                        child: Text(
                          '${r.emoji} ${r.count}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight:
                                r.me ? FontWeight.w700 : FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  InkWell(
                    onTap: () => _showReactionPicker(context, m.id),
                    borderRadius: BorderRadius.circular(12),
                    child: const Padding(
                      padding: EdgeInsets.all(4),
                      child: Icon(
                        Icons.add_reaction_outlined,
                        size: 18,
                        color: ColorSkin.subtitle,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _showReactionPicker(BuildContext context, String messageId) {
    return showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            for (final emoji in _quickEmojis)
              InkWell(
                onTap: () {
                  Navigator.pop(ctx);
                  context.read<ChatThreadBloc>().add(
                        ChatThreadReactionToggled(
                          messageId: messageId,
                          emoji: emoji,
                        ),
                      );
                },
                borderRadius: BorderRadius.circular(24),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(emoji, style: const TextStyle(fontSize: 28)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _FileChip extends StatelessWidget {
  const _FileChip({required this.fileId});
  final String fileId;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: InkWell(
        onTap: () => _open(context),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: ColorSkin.border1),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.insert_drive_file_outlined,
                  size: 16, color: ColorSkin.primary),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  'Tệp ${fileId.substring(0, fileId.length.clamp(0, 8))}…',
                  style: const TextStyle(
                    color: ColorSkin.primary,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context) async {
    try {
      final url = await context.read<FileRepository>().downloadUrl(fileId);
      if (url.isEmpty) {
        SimpleSnackbarService.showError('Không lấy được link tải');
        return;
      }
      final uri = Uri.parse(url);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) {
        SimpleSnackbarService.showError('Không mở được file');
      }
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }
}
