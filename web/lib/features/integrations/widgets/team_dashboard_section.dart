import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams_app/data/models/dashboard_models.dart';
import 'package:manage_teams_app/domain/repositories/dashboard_repository.dart';
import 'package:manage_teams_app/domain/repositories/integration_repository.dart';
import 'package:manage_teams_app/features/integrations/bloc/dashboard_bloc.dart';
import 'package:manage_teams_app/features/integrations/widgets/tasks_bar_chart.dart';
import 'package:url_launcher/url_launcher.dart';

class TeamDashboardSection extends StatelessWidget {
  const TeamDashboardSection({
    super.key,
    required this.teamId,
    required this.canManage,
  });

  final String teamId;
  final bool canManage;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => DashboardBloc(
        repository: context.read<DashboardRepository>(),
      )..add(DashboardStarted(teamId)),
      child: _DashboardBody(teamId: teamId, canManage: canManage),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({required this.teamId, required this.canManage});

  final String teamId;
  final bool canManage;

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<DashboardBloc, DashboardState>(
      listener: (context, state) {
        if (state is DashboardReady && state.message != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(state.message!)),
          );
        }
        if (state is DashboardFailure) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(state.message)),
          );
        }
      },
      builder: (context, state) {
        if (state is DashboardLoading || state is DashboardInitial) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (state is DashboardFailure) {
          return Column(
            children: [
              Text(state.message),
              FilledButton(
                onPressed: () => context
                    .read<DashboardBloc>()
                    .add(const DashboardRefreshed()),
                child: const Text('Thử lại'),
              ),
            ],
          );
        }
        if (state is! DashboardReady) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TasksBarChart(
              counts: state.dashboard.chart,
              actions: canManage
                  ? Wrap(
                      spacing: 8,
                      children: [
                        OutlinedButton(
                          onPressed: () async {
                            try {
                              final url = await context
                                  .read<IntegrationRepository>()
                                  .googleTasksConnectUrl(teamId);
                              await launchUrl(
                                Uri.parse(url),
                                webOnlyWindowName: '_self',
                              );
                            } catch (e) {
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('$e')),
                              );
                            }
                          },
                          child: const Text('Kết nối Tasks'),
                        ),
                        if (state.tasksStatus.oauthConnected)
                          FilledButton(
                            onPressed: state.busy
                                ? null
                                : () => _openBindSheet(context, state),
                            child: const Text('Gắn list & sync'),
                          ),
                      ],
                    )
                  : null,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _ServiceCard(
                    title: 'Google',
                    subtitle:
                        '${state.dashboard.googleLinked} thành viên đã liên kết',
                    onTap: () {
                      context
                          .read<DashboardBloc>()
                          .add(const DashboardLoadMembers('google'));
                      _openMembersSheet(context, 'Google');
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _ServiceCard(
                    title: 'GitHub',
                    subtitle:
                        '${state.dashboard.githubLinked} linked · ${state.dashboard.githubRepoCount} repos',
                    onTap: () {
                      context
                          .read<DashboardBloc>()
                          .add(const DashboardLoadMembers('github'));
                      _openMembersSheet(context, 'GitHub');
                    },
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Future<void> _openBindSheet(BuildContext context, DashboardReady state) async {
    var todo = state.tasksStatus.todoListId;
    var doing = state.tasksStatus.doingListId;
    var done = state.tasksStatus.doneListId;
    final lists = state.remoteLists;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return BlocProvider.value(
          value: context.read<DashboardBloc>(),
          child: StatefulBuilder(
            builder: (ctx, setLocal) {
              DropdownMenuItem<String?> item(String label, String? id) =>
                  DropdownMenuItem(value: id, child: Text(label));
              final options = [
                item('—', null),
                ...lists.map((l) => item(l.title, l.id)),
              ];
              return Padding(
                padding: EdgeInsets.only(
                  left: 16,
                  right: 16,
                  top: 16,
                  bottom: MediaQuery.viewInsetsOf(ctx).bottom + 16,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Gắn Google Task lists',
                        style: Theme.of(ctx).textTheme.titleMedium),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String?>(
                      initialValue: todo,
                      decoration: const InputDecoration(labelText: 'Todo'),
                      items: options,
                      onChanged: (v) => setLocal(() => todo = v),
                    ),
                    DropdownButtonFormField<String?>(
                      initialValue: doing,
                      decoration: const InputDecoration(labelText: 'Doing'),
                      items: options,
                      onChanged: (v) => setLocal(() => doing = v),
                    ),
                    DropdownButtonFormField<String?>(
                      initialValue: done,
                      decoration: const InputDecoration(labelText: 'Done'),
                      items: options,
                      onChanged: (v) => setLocal(() => done = v),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () {
                        context.read<DashboardBloc>().add(
                              DashboardBindAndSync(
                                todoListId: todo,
                                doingListId: doing,
                                doneListId: done,
                              ),
                            );
                        Navigator.pop(ctx);
                      },
                      child: const Text('Lưu & sync'),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }

  Future<void> _openMembersSheet(BuildContext context, String title) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return BlocProvider.value(
          value: context.read<DashboardBloc>(),
          child: DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.6,
            builder: (_, controller) {
              return BlocBuilder<DashboardBloc, DashboardState>(
                builder: (context, state) {
                  final ready = state is DashboardReady ? state : null;
                  final members = ready?.members ?? const <MemberIntegration>[];
                  return Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          'Thành viên $title',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      Expanded(
                        child: ListView.builder(
                          controller: controller,
                          itemCount: members.length,
                          itemBuilder: (_, i) {
                            final m = members[i];
                            return ListTile(
                              title: Text(m.fullName),
                              subtitle: Text(
                                m.linked
                                    ? (m.handle ?? m.githubLogin ?? 'đã liên kết')
                                    : 'chưa liên kết',
                              ),
                              trailing: title == 'GitHub' && m.linked
                                  ? TextButton(
                                      onPressed: () async {
                                        context.read<DashboardBloc>().add(
                                              DashboardLoadCommits(m.userId),
                                            );
                                        await _openCommitsSheet(context);
                                      },
                                      child: const Text('Commits'),
                                    )
                                  : null,
                            );
                          },
                        ),
                      ),
                    ],
                  );
                },
              );
            },
          ),
        );
      },
    );
  }

  Future<void> _openCommitsSheet(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return BlocProvider.value(
          value: context.read<DashboardBloc>(),
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.7,
            child: BlocBuilder<DashboardBloc, DashboardState>(
              builder: (context, state) {
                final page =
                    state is DashboardReady ? state.commits : null;
                if (page == null) {
                  return const Center(child: CircularProgressIndicator());
                }
                return Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'Commits @${page.githubLogin}',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    Expanded(
                      child: ListView.builder(
                        itemCount: page.items.length,
                        itemBuilder: (_, i) {
                          final c = page.items[i];
                          return ListTile(
                            title: Text(c.title),
                            subtitle: Text(
                              [
                                if (c.repoFullName != null) c.repoFullName!,
                                c.occurredAt,
                              ].join(' · '),
                            ),
                            onTap: c.externalUrl == null
                                ? null
                                : () => launchUrl(Uri.parse(c.externalUrl!)),
                          );
                        },
                      ),
                    ),
                    if (page.nextCursor != null)
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: OutlinedButton(
                          onPressed: () => context
                              .read<DashboardBloc>()
                              .add(const DashboardLoadMoreCommits()),
                          child: const Text('Tải thêm'),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        );
      },
    );
  }
}

class _ServiceCard extends StatelessWidget {
  const _ServiceCard({
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 4),
              Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 8),
              const Text('Xem thành viên ›'),
            ],
          ),
        ),
      ),
    );
  }
}
