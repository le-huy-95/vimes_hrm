import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/sync/bloc/sync_bloc.dart';
import 'package:manage_teams/features/sync/bloc/sync_event.dart';
import 'package:manage_teams/features/sync/bloc/sync_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_section_card.dart';

class SyncTabPage extends StatelessWidget {
  const SyncTabPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<SyncBloc, SyncState>(
      listener: (context, state) {
        if (state is SyncFailure) {
          SimpleSnackbarService.showError(state.message);
        } else if (state is SyncActionSuccess) {
          SimpleSnackbarService.showSuccess(state.message);
        }
      },
      builder: (context, state) {
        if (state is SyncLoading || state is SyncInitial) {
          return const Center(child: CircularProgressIndicator());
        }

        final ready = switch (state) {
          SyncReady() => state,
          SyncFailure(:final previous) => previous,
          SyncActionSuccess(:final ready) => ready,
          _ => null,
        };

        if (ready == null) {
          return Center(
            child: AppButton(
              label: 'Tải lại',
              variant: AppButtonVariant.primary,
              onPressed: () =>
                  context.read<SyncBloc>().add(const SyncStarted()),
            ),
          );
        }

        final s = ready.status;
        final df = DateFormat('dd/MM HH:mm');

        return RefreshIndicator(
          onRefresh: () async {
            context.read<SyncBloc>().add(const SyncRefreshRequested());
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Đồng bộ Google',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              const Text(
                'Trạng thái từ GET /sync/status',
                style: TextStyle(color: ColorSkin.subtitle, fontSize: 13),
              ),
              const SizedBox(height: 16),
              if (!s.googleLinked)
                const AppSectionCard(
                  title: 'Chưa liên kết Google',
                  child: Text(
                    'Đăng nhập Google (kèm Tasks scope) từ màn Auth để đồng bộ.',
                  ),
                )
              else ...[
                Row(
                  children: [
                    Expanded(
                      child: AppSectionCard(
                        title: 'Google',
                        child: Text(
                          'Đã liên kết · linkedTasks: ${s.linkedTasks}',
                          style: const TextStyle(
                            color: ColorSkin.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: AppSectionCard(
                        title: 'Lần pull gần nhất',
                        child: Text(
                          s.tasksLastPullAt == null
                              ? '—'
                              : df.format(s.tasksLastPullAt!.toLocal()),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    AppButton(
                      label: 'Đồng bộ (pull)',
                      variant: AppButtonVariant.primary,
                      isLoading: ready.busy,
                      onPressed: ready.busy
                          ? null
                          : () => context
                              .read<SyncBloc>()
                              .add(const SyncPullRequested()),
                    ),
                    const SizedBox(width: 8),
                    AppButton(
                      label: 'Full sync',
                      isLoading: ready.busy,
                      onPressed: ready.busy
                          ? null
                          : () => context
                              .read<SyncBloc>()
                              .add(const SyncFullRequested()),
                    ),
                  ],
                ),
                if (s.backlog.authRequired > 0) ...[
                  const SizedBox(height: 12),
                  const Text(
                    'Cần đăng nhập Google lại (authRequired > 0)',
                    style: TextStyle(
                      color: ColorSkin.error,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                AppSectionCard(
                  title: 'Backlog',
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _pill('pending ${s.backlog.pending}'),
                      _pill('retry ${s.backlog.retry}'),
                      _pill(
                        'failed ${s.backlog.failed}',
                        danger: s.backlog.failed > 0,
                      ),
                      _pill('authRequired ${s.backlog.authRequired}'),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                AppSectionCard(
                  title: 'Job gần đây',
                  child: Column(
                    children: [
                      if (s.recentJobs.isEmpty)
                        const Text(
                          'Không có job',
                          style: TextStyle(color: ColorSkin.subtitle),
                        ),
                      for (final j in s.recentJobs.take(8))
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text('${j['jobType']} · ${j['status']}'),
                          subtitle: Text(
                            'attempts ${j['attempts']}${j['lastError'] != null ? ' · ${j['lastError']}' : ''}',
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _pill(String text, {bool danger = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: danger ? const Color(0xFFFFEEEE) : ColorSkin.tealLight,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: danger ? ColorSkin.error : ColorSkin.primarySub,
          fontSize: 12,
        ),
      ),
    );
  }
}
