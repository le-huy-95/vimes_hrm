import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/features/ai/data/ai_models.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_bloc.dart';
import 'package:manage_teams/features/chat/bloc/chat_list_event.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_bloc.dart';
import 'package:manage_teams/features/tasks/bloc/tasks_event.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_event.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';

void navigateAiLink(BuildContext context, AiLink link) {
  switch (link.type) {
    case 'task':
      context.go(AppRoutes.tasks.path);
      context.read<TasksBloc>().add(TasksFocusRequested(link.id));
    case 'group':
      final ws = context.read<WorkspaceBloc>().state;
      if (ws is WorkspaceReady &&
          ws.groups.any((g) => g.id == link.id)) {
        context.read<WorkspaceBloc>().add(WorkspaceGroupSelected(link.id));
        context.go(AppRoutes.home.path);
      } else {
        SimpleSnackbarService.showError('Không tìm thấy nhóm');
      }
    case 'conversation':
      context.go(AppRoutes.chat.path);
      context.read<ChatListBloc>().add(ChatListOpenByIdRequested(link.id));
    default:
      SimpleSnackbarService.showError('Loại liên kết chưa hỗ trợ: ${link.type}');
  }
}
