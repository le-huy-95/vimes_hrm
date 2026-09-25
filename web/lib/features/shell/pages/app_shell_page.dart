import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:manage_teams_app/data/models/auth_models.dart';
import 'package:manage_teams_app/domain/repositories/org_repository.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_event.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_state.dart';
import 'package:manage_teams_app/features/shell/bloc/shell_cubit.dart';
import 'package:manage_teams_app/shared/widgets/adaptive_scaffold.dart';
import 'package:manage_teams_app/shared/widgets/service_link_tile.dart';
import 'package:manage_teams_app/shared/widgets/teams_picker.dart';

class AppShellPage extends StatefulWidget {
  const AppShellPage({super.key, required this.child});

  final Widget child;

  @override
  State<AppShellPage> createState() => _AppShellPageState();
}

class _AppShellPageState extends State<AppShellPage> {
  @override
  void initState() {
    super.initState();
    context.read<ShellCubit>().load();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthBloc>().state;
    final Me? user = auth is AuthAuthenticated ? auth.user : null;

    return AdaptiveScaffold(
      title: const Text('Manage Teams'),
      actions: [
        if (user != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Center(child: Text(user.email)),
          ),
        IconButton(
          tooltip: 'Đăng xuất',
          onPressed: () =>
              context.read<AuthBloc>().add(const AuthLogoutRequested()),
          icon: const Icon(Icons.logout),
        ),
      ],
      sidebar: _Sidebar(
        orgName: user?.org.name ?? 'Org',
        onPickTeam: (id) {
          Navigator.of(context).maybePop();
          context.go('/teams/$id');
        },
      ),
      body: widget.child,
    );
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({required this.orgName, required this.onPickTeam});

  final String orgName;
  final void Function(String teamId) onPickTeam;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          ListTile(
            title: Text(
              'Manage Teams',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            subtitle: Text(orgName),
          ),
          const Divider(),
          BlocBuilder<ShellCubit, ShellState>(
            builder: (context, state) {
              return ListTile(
                leading: const Icon(Icons.groups_outlined),
                title: const Text('Nhóm của bạn'),
                onTap: () async {
                  if (state is! ShellLoaded) {
                    await context.read<ShellCubit>().load();
                  }
                  if (!context.mounted) return;
                  final loaded = context.read<ShellCubit>().state;
                  if (loaded is! ShellLoaded) return;
                  final picked = await showTeamsPicker(
                    context: context,
                    tree: loaded.teams,
                  );
                  if (picked != null) onPickTeam(picked.id);
                },
                trailing: state is ShellLoading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : null,
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.add),
            title: const Text('Tạo nhóm'),
            onTap: () {
              Navigator.of(context).maybePop();
              context.go('/teams/new');
            },
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Text('Google', style: Theme.of(context).textTheme.labelLarge),
          ),
          const ServiceLinkTile(label: 'Đăng nhập Google', linked: false),
          const ServiceLinkTile(label: 'Google Tasks', linked: false),
          const ServiceLinkTile(label: 'Workspace Directory', linked: false),
          const ServiceLinkTile(label: 'Google Chat', linked: false),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Text('GitHub', style: Theme.of(context).textTheme.labelLarge),
          ),
          const ServiceLinkTile(label: 'GitHub App', linked: false),
          const ServiceLinkTile(label: 'Repos nhóm', linked: false),
          const Divider(),
          const _AddOrgUserForm(),
        ],
      ),
    );
  }
}

class _AddOrgUserForm extends StatefulWidget {
  const _AddOrgUserForm();

  @override
  State<_AddOrgUserForm> createState() => _AddOrgUserFormState();
}

class _AddOrgUserFormState extends State<_AddOrgUserForm> {
  final _email = TextEditingController();
  final _fullName = TextEditingController();
  String? _msg;
  String? _err;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _fullName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _msg = null;
      _err = null;
    });
    try {
      await context.read<OrgRepository>().createOrgUser(
            email: _email.text.trim(),
            fullName: _fullName.text.trim(),
          );
      setState(() {
        _msg = 'Đã thêm ${_email.text.trim()}';
        _email.clear();
        _fullName.clear();
      });
    } catch (e) {
      setState(() => _err = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Thêm người dùng tổ chức',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _fullName,
            decoration: const InputDecoration(
              labelText: 'Họ tên',
              isDense: true,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _email,
            decoration: const InputDecoration(
              labelText: 'Email',
              isDense: true,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Thêm'),
          ),
          if (_msg != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_msg!, style: const TextStyle(color: Colors.green)),
            ),
          if (_err != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _err!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
        ],
      ),
    );
  }
}
