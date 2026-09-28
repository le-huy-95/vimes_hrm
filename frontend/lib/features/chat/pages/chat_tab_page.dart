import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/data/chat_repository.dart';
import 'package:manage_teams/features/home/data/chat_socket_service.dart';
import 'package:manage_teams/features/home/data/core_repository.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';

class ChatTabPage extends StatefulWidget {
  const ChatTabPage({super.key});

  @override
  State<ChatTabPage> createState() => _ChatTabPageState();
}

class _ChatTabPageState extends State<ChatTabPage> {
  List<ConversationItem> _groupConvs = [];
  List<ConversationItem> _taskConvs = [];
  ConversationItem? _selected;
  List<ChatMessage> _messages = [];
  final _body = TextEditingController();
  StreamSubscription<Map<String, dynamic>>? _sub;
  bool _loading = false;

  ChatRepository get _chat => context.read<ChatRepository>();
  ChatSocketService get _socket => context.read<ChatSocketService>();
  CoreRepository get _core => context.read<CoreRepository>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _socket.connect();
      _sub = _socket.messages.listen(_onSocket);
      await _loadList();
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    if (_selected != null) {
      unawaited(_socket.leave(_selected!.id));
    }
    _body.dispose();
    super.dispose();
  }

  void _onSocket(Map<String, dynamic> raw) {
    final event = raw['_event']?.toString();
    if (event == 'reaction' || event == 'mention') return;
    final convId = raw['conversationId']?.toString();
    if (_selected == null || convId != _selected!.id) return;
    final msg = ChatMessage.fromJson({
      ...raw,
      'conversationId': convId,
    });
    setState(() {
      if (event == 'deleted') {
        _messages = _messages
            .map((m) => m.id == msg.id
                ? ChatMessage(
                    id: m.id,
                    seq: m.seq,
                    senderUserId: m.senderUserId,
                    body: '',
                    fileIds: m.fileIds,
                    mentions: m.mentions,
                    reactions: m.reactions,
                    createdAt: m.createdAt,
                    deleted: true,
                    clientMsgId: m.clientMsgId,
                    conversationId: m.conversationId,
                  )
                : m)
            .toList();
        return;
      }
      if (event == 'edited') {
        _messages = _messages
            .map((m) => m.id == msg.id ? msg : m)
            .toList();
        return;
      }
      final exists = _messages.any(
        (m) => m.id == msg.id || (msg.clientMsgId != null && m.clientMsgId == msg.clientMsgId),
      );
      if (!exists) _messages = [..._messages, msg];
    });
  }

  Future<void> _loadList() async {
    final ws = context.read<WorkspaceBloc>().state;
    if (ws is! WorkspaceReady || ws.selectedGroupId == null) {
      setState(() {
        _groupConvs = [];
        _taskConvs = [];
      });
      return;
    }
    setState(() => _loading = true);
    try {
      final all = await _chat.listConversations();
      final groupId = ws.selectedGroupId!;
      final tasks = await _core.listTasks(groupId);
      final taskIds = tasks.map((t) => t.id).toSet();
      final groupConvs =
          all.where((c) => c.type == 'GROUP' && c.groupId == groupId).toList();
      final taskConvs = all.where((c) {
        if (c.type != 'TASK') return false;
        if (c.groupId == groupId) return true;
        return c.taskId != null && taskIds.contains(c.taskId);
      }).toList();
      if (mounted) {
        setState(() {
          _groupConvs = groupConvs;
          _taskConvs = taskConvs;
        });
      }
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(ConversationItem conv) async {
    if (_selected != null) await _socket.leave(_selected!.id);
    setState(() {
      _selected = conv;
      _messages = [];
    });
    try {
      final msgs = await _chat.listMessages(conv.id);
      await _socket.join(conv.id);
      if (!mounted) return;
      setState(() => _messages = msgs);
      if (msgs.isNotEmpty) {
        unawaited(_chat.markRead(conv.id, msgs.last.seq));
      }
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  Future<void> _send() async {
    final text = _body.text.trim();
    final conv = _selected;
    if (text.isEmpty || conv == null) return;
    _body.clear();
    try {
      final sent = await _chat.sendMessage(conv.id, body: text);
      setState(() {
        if (!_messages.any((m) => m.id == sent.id)) {
          _messages = [..._messages, sent];
        }
      });
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 800;
    return BlocListener<WorkspaceBloc, WorkspaceState>(
      listener: (_, __) {
        _loadList();
        setState(() => _selected = null);
      },
      child: wide
          ? Row(
              children: [
                SizedBox(width: 300, child: _buildList()),
                const VerticalDivider(width: 1),
                Expanded(child: _buildThread()),
              ],
            )
          : _selected == null
              ? _buildList()
              : Column(
                  children: [
                    ListTile(
                      leading: IconButton(
                        icon: const Icon(Icons.arrow_back),
                        onPressed: () => setState(() => _selected = null),
                      ),
                      title: Text(_selected?.title ?? 'Chat'),
                    ),
                    Expanded(child: _buildThread()),
                  ],
                ),
    );
  }

  Widget _buildList() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return ListView(
      children: [
        const ListTile(
          title: Text('NHÓM', style: TextStyle(fontSize: 12, color: ColorSkin.subtitle)),
        ),
        if (_groupConvs.isEmpty)
          const ListTile(title: Text('Chưa có chat nhóm')),
        for (final c in _groupConvs)
          ListTile(
            selected: _selected?.id == c.id,
            selectedTileColor: ColorSkin.tealLight,
            title: Text(c.title ?? '# Group', style: const TextStyle(fontWeight: FontWeight.w700)),
            onTap: () => _open(c),
          ),
        const ListTile(
          title: Text('THEO TASK', style: TextStyle(fontSize: 12, color: ColorSkin.subtitle)),
        ),
        if (_taskConvs.isEmpty)
          const ListTile(title: Text('Chưa có chat task')),
        for (final c in _taskConvs)
          ListTile(
            selected: _selected?.id == c.id,
            title: Text(c.title ?? 'Task'),
            onTap: () => _open(c),
          ),
      ],
    );
  }

  Widget _buildThread() {
    if (_selected == null) {
      return const Center(
        child: Text('Chọn hội thoại', style: TextStyle(color: ColorSkin.subtitle)),
      );
    }
    return Column(
      children: [
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: _messages.length,
            itemBuilder: (context, i) {
              final m = _messages[i];
              return Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: ColorSkin.tealLight,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    m.deleted ? '(đã xóa)' : m.body,
                    style: TextStyle(
                      fontStyle: m.deleted ? FontStyle.italic : FontStyle.normal,
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
                  onSubmitted: (_) => _send(),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.send, color: ColorSkin.primary),
                onPressed: _send,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
