import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams_app/data/models/team_models.dart';
import 'package:manage_teams_app/domain/repositories/team_repository.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_state.dart';
import 'package:manage_teams_app/features/shell/bloc/shell_cubit.dart';
import 'package:manage_teams_app/features/teams/bloc/team_detail_bloc.dart';

const _roleLabels = {
  'lead': 'Trưởng nhóm',
  'member': 'Thành viên',
  'viewer': 'Chỉ xem',
};

class TeamDetailPage extends StatelessWidget {
  const TeamDetailPage({super.key, required this.teamId});

  final String teamId;

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthBloc>().state;
    final userId = auth is AuthAuthenticated ? auth.user.id : '';

    return BlocProvider(
      create: (context) => TeamDetailBloc(
        teamRepository: context.read<TeamRepository>(),
        currentUserId: userId,
      )..add(TeamDetailStarted(teamId)),
      child: const _TeamDetailView(),
    );
  }
}

class _TeamDetailView extends StatelessWidget {
  const _TeamDetailView();

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<TeamDetailBloc, TeamDetailState>(
      listener: (context, state) async {
        if (state is TeamDetailGone) {
          await context.read<ShellCubit>().reload();
          if (!context.mounted) return;
          context.go('/');
          return;
        }
        if (!context.mounted) return;
        if (state is TeamDetailReady && state.message != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(state.message!)),
          );
        }
        if (state is TeamDetailFailure) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(state.message)),
          );
        }
      },
      builder: (context, state) {
        if (state is TeamDetailLoading || state is TeamDetailInitial) {
          return const Center(child: CircularProgressIndicator());
        }
        if (state is TeamDetailFailure) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(state.message),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => context
                      .read<TeamDetailBloc>()
                      .add(const TeamDetailRefreshed()),
                  child: const Text('Thử lại'),
                ),
              ],
            ),
          );
        }
        if (state is! TeamDetailReady) {
          return const SizedBox.shrink();
        }
        return _ReadyBody(state: state);
      },
    );
  }
}

class _ReadyBody extends StatelessWidget {
  const _ReadyBody({required this.state});

  final TeamDetailReady state;

  @override
  Widget build(BuildContext context) {
    final team = state.team;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                team.name,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            if (state.isLead)
              PopupMenuButton<String>(
                onSelected: (value) async {
                  switch (value) {
                    case 'members':
                      await showModalBottomSheet<void>(
                        context: context,
                        isScrollControlled: true,
                        builder: (_) => BlocProvider.value(
                          value: context.read<TeamDetailBloc>(),
                          child: _MembersSheet(members: state.members),
                        ),
                      );
                    case 'invite':
                      await showModalBottomSheet<void>(
                        context: context,
                        builder: (_) => BlocProvider.value(
                          value: context.read<TeamDetailBloc>(),
                          child: const _InviteSheet(),
                        ),
                      );
                    case 'delete':
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: const Text('Xóa nhóm?'),
                          content: Text('Xóa «${team.name}» vĩnh viễn.'),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(ctx, false),
                              child: const Text('Hủy'),
                            ),
                            FilledButton(
                              onPressed: () => Navigator.pop(ctx, true),
                              child: const Text('Xóa'),
                            ),
                          ],
                        ),
                      );
                      if (ok == true && context.mounted) {
                        context
                            .read<TeamDetailBloc>()
                            .add(const TeamDetailDeleted());
                      }
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'members',
                    child: Text('Quản lý nhân sự'),
                  ),
                  PopupMenuItem(
                    value: 'invite',
                    child: Text('Thêm người vào nhóm'),
                  ),
                  PopupMenuItem(
                    value: 'delete',
                    child: Text('Xóa nhóm'),
                  ),
                ],
              ),
          ],
        ),
        if (team.description != null && team.description!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(team.description!),
        ],
        const SizedBox(height: 8),
        Text(
          'Vai trò của bạn: ${_roleLabels[state.myRole] ?? state.myRole ?? '—'}',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        if (state.isLead) ...[
          const SizedBox(height: 16),
          _EditTeamSection(team: team),
        ],
        const SizedBox(height: 24),
        Text('Bảng điều khiển', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        const Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'Google Tasks chart & integrations — Task 7–8',
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Thành viên (${state.members.length})',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        ...state.members.map(
          (m) => ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(m.user.fullName),
            subtitle: Text('${m.user.email} · ${_roleLabels[m.role] ?? m.role}'),
          ),
        ),
      ],
    );
  }
}

class _EditTeamSection extends StatefulWidget {
  const _EditTeamSection({required this.team});

  final Team team;

  @override
  State<_EditTeamSection> createState() => _EditTeamSectionState();
}

class _EditTeamSectionState extends State<_EditTeamSection> {
  late final TextEditingController _name;
  late final TextEditingController _desc;
  bool _open = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.team.name);
    _desc = TextEditingController(text: widget.team.description ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _desc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      initiallyExpanded: _open,
      onExpansionChanged: (v) => setState(() => _open = v),
      title: const Text('Sửa thông tin nhóm'),
      children: [
        TextField(
          controller: _name,
          decoration: const InputDecoration(
            labelText: 'Tên',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _desc,
          decoration: const InputDecoration(
            labelText: 'Mô tả',
            border: OutlineInputBorder(),
          ),
          maxLines: 2,
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton(
            onPressed: () {
              context.read<TeamDetailBloc>().add(
                    TeamDetailUpdated(
                      name: _name.text.trim(),
                      description: _desc.text.trim(),
                    ),
                  );
            },
            child: const Text('Lưu'),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _MembersSheet extends StatelessWidget {
  const _MembersSheet({required this.members});

  final List<TeamMember> members;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Quản lý nhân sự',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: members.length,
                itemBuilder: (_, i) {
                  final m = members[i];
                  return ListTile(
                    title: Text(m.user.fullName),
                    subtitle: Text(m.user.email),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        DropdownButton<String>(
                          value: m.role,
                          items: _roleLabels.entries
                              .map(
                                (e) => DropdownMenuItem(
                                  value: e.key,
                                  child: Text(e.value),
                                ),
                              )
                              .toList(),
                          onChanged: (role) {
                            if (role == null) return;
                            context.read<TeamDetailBloc>().add(
                                  TeamDetailMemberRoleChanged(
                                    userId: m.userId,
                                    role: role,
                                  ),
                                );
                            Navigator.pop(context);
                          },
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline),
                          onPressed: () {
                            context.read<TeamDetailBloc>().add(
                                  TeamDetailMemberRemoved(m.userId),
                                );
                            Navigator.pop(context);
                          },
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InviteSheet extends StatefulWidget {
  const _InviteSheet();

  @override
  State<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends State<_InviteSheet> {
  final _email = TextEditingController();
  String _role = 'member';

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Thêm người vào nhóm',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _email,
            decoration: const InputDecoration(
              labelText: 'Email',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _role,
            decoration: const InputDecoration(
              labelText: 'Vai trò',
              border: OutlineInputBorder(),
            ),
            items: _roleLabels.entries
                .map(
                  (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
                )
                .toList(),
            onChanged: (v) => setState(() => _role = v ?? 'member'),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () {
              context.read<TeamDetailBloc>().add(
                    TeamDetailMemberInvited(
                      email: _email.text.trim(),
                      role: _role,
                    ),
                  );
              Navigator.pop(context);
            },
            child: const Text('Mời'),
          ),
        ],
      ),
    );
  }
}
