import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_bloc.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_state.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_bloc.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_event.dart';
import 'package:manage_teams/features/chat/bloc/chat_thread_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';

class ChatTabPage extends StatelessWidget {
  const ChatTabPage({super.key});

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 800;

    return MultiBlocListener(
      listeners: [
        BlocListener<ChatListBloc, ChatListState>(
          listenWhen: (prev, next) {
            final prevId =
                prev is ChatListReady ? prev.selected?.id : null;
            final nextId =
                next is ChatListReady ? next.selected?.id : null;
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

  @override
  void dispose() {
    _body.dispose();
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
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: ColorSkin.tealLight,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        m.deleted ? '(đã xóa)' : m.body,
                        style: TextStyle(
                          fontStyle:
                              m.deleted ? FontStyle.italic : FontStyle.normal,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
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
}
