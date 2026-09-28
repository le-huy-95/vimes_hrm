import 'dart:async';

import 'package:manage_teams/core/constants/env_config.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

/// Client Socket.IO tới chat-service — join room, nhận message:new, bù seq.
class ChatSocketService {
  ChatSocketService(this._tokenStore);

  final TokenStore _tokenStore;
  io.Socket? _socket;
  final _messageController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _typingController =
      StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get messages => _messageController.stream;
  Stream<Map<String, dynamic>> get typing => _typingController.stream;

  bool get isConnected => _socket?.connected ?? false;

  /// Kết nối với JWT; gọi lại sau login.
  Future<void> connect() async {
    await disconnect();
    final token = await _tokenStore.getAccessToken();
    if (token == null || token.isEmpty) return;

    final url = EnvConfig.socketUrl;
    if (url.isEmpty) return;

    _socket = io.io(
      url,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setPath('/socket.io')
          .setAuth({'token': token})
          .enableAutoConnect()
          .enableReconnection()
          .build(),
    );

    _socket!
      ..onConnect((_) {})
      ..on('message:new', (data) {
        if (data is Map) {
          _messageController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('message:edited', (data) {
        if (data is Map) {
          _messageController.add({
            ...Map<String, dynamic>.from(data),
            '_event': 'edited',
          });
        }
      })
      ..on('message:deleted', (data) {
        if (data is Map) {
          _messageController.add({
            ...Map<String, dynamic>.from(data),
            '_event': 'deleted',
          });
        }
      })
      ..on('typing', (data) {
        if (data is Map) {
          _typingController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('reaction:changed', (data) {
        if (data is Map) {
          _messageController.add({
            ...Map<String, dynamic>.from(data),
            '_event': 'reaction',
          });
        }
      })
      ..on('mention:notify', (data) {
        if (data is Map) {
          _messageController.add({
            ...Map<String, dynamic>.from(data),
            '_event': 'mention',
          });
        }
      });
  }

  /// Join room conversation; ack qua callback.
  Future<bool> join(String conversationId) async {
    final socket = _socket;
    if (socket == null || !socket.connected) return false;
    final completer = Completer<bool>();
    socket.emitWithAck('join', {'conversationId': conversationId},
        ack: (dynamic res) {
      if (res is Map && res['ok'] == true) {
        completer.complete(true);
      } else {
        completer.complete(false);
      }
    });
    return completer.future.timeout(
      const Duration(seconds: 5),
      onTimeout: () => false,
    );
  }

  Future<void> leave(String conversationId) async {
    _socket?.emit('leave', {'conversationId': conversationId});
  }

  void emitTyping(String conversationId) {
    _socket?.emit('typing', {'conversationId': conversationId});
  }

  /// Làm mới JWT trên socket khi access token đổi.
  Future<void> refreshAuth() async {
    final token = await _tokenStore.getAccessToken();
    if (token == null || _socket == null) return;
    _socket!.emit('auth:refresh', {'token': token});
  }

  Future<void> disconnect() async {
    _socket?.dispose();
    _socket = null;
  }

  Future<void> dispose() async {
    await disconnect();
    await _messageController.close();
    await _typingController.close();
  }
}
