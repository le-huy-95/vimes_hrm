import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:manage_teams/app/router/app_router.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams/features/auth/bloc/auth_event.dart';
import 'package:manage_teams/features/auth/data/auth_repository.dart';
import 'package:manage_teams/features/auth/data/google_sign_in_helper.dart';
import 'package:manage_teams/features/sync/bloc/sync_bloc.dart';
import 'package:manage_teams/features/sync/bloc/sync_event.dart';
import 'package:manage_teams/features/sync/bloc/sync_state.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_bloc.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_event.dart';
import 'package:manage_teams/features/workspace/bloc/workspace_state.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_section_card.dart';
import 'package:url_launcher/url_launcher.dart';

class SyncTabPage extends StatefulWidget {
  const SyncTabPage({super.key});

  @override
  State<SyncTabPage> createState() => _SyncTabPageState();
}

class _SyncTabPageState extends State<SyncTabPage> {
  bool _sheetArmed = false;
  bool _googleLinkBusy = false;
  String? _lastOrgSheetsKey;

  bool get _isSyncRoute {
    final loc = GoRouterState.of(context).matchedLocation;
    return loc == AppRoutes.sync.path;
  }

  void _armSheetIfVisible() {
    if (!_isSyncRoute || !mounted) return;
    final ws = context.read<WorkspaceBloc>().state;
    final groupId = ws is WorkspaceReady ? ws.selectedGroupId : null;
    context.read<SyncBloc>().add(SyncGroupContextChanged(groupId));
    _sheetArmed = true;
    _refreshOrgSheetsIfNeeded(ws);
  }

  void _refreshOrgSheetsIfNeeded(WorkspaceState ws) {
    if (ws is! WorkspaceReady || !_isSyncRoute) return;
    final ids = ws.groups.map((g) => g.id).toList();
    final key = '${ws.selectedOrgId ?? ''}:${ids.join(',')}';
    if (key == _lastOrgSheetsKey) return;
    _lastOrgSheetsKey = key;
    context.read<SyncBloc>().add(SyncOrgSheetsRefreshRequested(ids));
  }

  Future<void> _applyGoogleLink(GoogleSignInTokens tokens) async {
    final repo = context.read<AuthRepository>();
    final result = await repo.linkGoogleWithIdToken(
      tokens.idToken,
      serverAuthCode: tokens.serverAuthCode,
      redirectUri: tokens.redirectUri,
    );
    final user = await repo.fetchMe();
    if (!mounted) return;
    SimpleSnackbarService.showSuccess(result.message);
    context.read<AuthBloc>().add(AuthGoogleLinked(user));
    context.read<SyncBloc>().add(const SyncRefreshRequested());
  }

  Future<void> _linkGoogle() async {
    if (_googleLinkBusy) return;
    setState(() => _googleLinkBusy = true);
    try {
      final tokens = await requestGoogleSignInTokens();
      if (!mounted) return;
      await _applyGoogleLink(tokens);
    } catch (e) {
      final message = e is ApiException ? e.message : e.toString();
      SimpleSnackbarService.showError(message);
    } finally {
      if (mounted) setState(() => _googleLinkBusy = false);
    }
  }

  void _createSheetForSelected(SyncReady ready, WorkspaceReady? ws) {
    final gid = ready.selectedGroupId ?? ws?.selectedGroupId;
    if (gid == null) {
      SimpleSnackbarService.showError('Chọn nhóm trên header trước.');
      return;
    }
    final existing = ready.orgSheetsByGroupId[gid] ?? ready.sheetStatus?.sheet;
    if (existing != null) {
      SimpleSnackbarService.showError('Nhóm đã có sheet.');
      return;
    }
    if (!ready.status.googleLinked) {
      SimpleSnackbarService.showError(
        'Liên kết Google ở menu tài khoản trên header trước.',
      );
      return;
    }
    context.read<SyncBloc>().add(const SyncSheetEnsureRequested());
  }

  @override
  Widget build(BuildContext context) {
    // IndexedStack may keep this page alive — only fetch sheet on /sync.
    if (_isSyncRoute && !_sheetArmed) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _armSheetIfVisible());
    } else if (!_isSyncRoute) {
      _sheetArmed = false;
      _lastOrgSheetsKey = null;
    }

    return BlocListener<WorkspaceBloc, WorkspaceState>(
      listenWhen: (prev, next) {
        if (!_isSyncRoute) return false;
        if (prev is! WorkspaceReady || next is! WorkspaceReady) return true;
        return prev.selectedGroupId != next.selectedGroupId ||
            prev.selectedOrgId != next.selectedOrgId ||
            prev.groups.map((g) => g.id).join() !=
                next.groups.map((g) => g.id).join();
      },
      listener: (context, state) {
        final groupId =
            state is WorkspaceReady ? state.selectedGroupId : null;
        context.read<SyncBloc>().add(SyncGroupContextChanged(groupId));
        _refreshOrgSheetsIfNeeded(state);
      },
      child: BlocConsumer<SyncBloc, SyncState>(
        listenWhen: (prev, next) {
          if (next is SyncFailure || next is SyncActionSuccess) return true;
          // After shell SyncStarted → Ready, load sheet if tab visible.
          return _isSyncRoute &&
              next is SyncReady &&
              (prev is SyncLoading || prev is SyncInitial);
        },
        listener: (context, state) {
          if (state is SyncFailure) {
            SimpleSnackbarService.showError(state.message);
          } else if (state is SyncActionSuccess) {
            SimpleSnackbarService.showSuccess(state.message);
          } else if (state is SyncReady) {
            _armSheetIfVisible();
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
          final ws = context.watch<WorkspaceBloc>().state;
          final wsReady = ws is WorkspaceReady ? ws : null;

          return RefreshIndicator(
            onRefresh: () async {
              _lastOrgSheetsKey = null;
              context.read<SyncBloc>().add(const SyncRefreshRequested());
              if (wsReady != null) _refreshOrgSheetsIfNeeded(wsReady);
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Sheets',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Sheet gắn nhóm trong org đang chọn · tạo cho nhóm header',
                            style: TextStyle(
                              color: ColorSkin.subtitle,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                    AppButton(
                      label: '+ Tạo sheet',
                      variant: AppButtonVariant.primary,
                      isLoading: ready.sheetBusy,
                      onPressed: ready.sheetBusy
                          ? null
                          : () => _createSheetForSelected(ready, wsReady),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                _OrgSheetsList(
                  ready: ready,
                  groups: wsReady?.groups ?? const [],
                  orgName: wsReady?.selectedOrg?.name,
                  onSelectGroup: (groupId) {
                    context
                        .read<WorkspaceBloc>()
                        .add(WorkspaceGroupSelected(groupId));
                  },
                ),
                if (!s.googleLinked) ...[
                  const SizedBox(height: 12),
                  _GoogleLinkCard(
                    busy: _googleLinkBusy,
                    onLink: _linkGoogle,
                  ),
                ] else ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: AppSectionCard(
                          title: 'Đồng bộ Tasks',
                          child: Text(
                            'linkedTasks: ${s.linkedTasks}',
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
                  const SizedBox(height: 16),
                  AppSectionCard(
                    title: 'Gắn Google Task list',
                    child: ready.mapsBusy && ready.tasklistMaps.isEmpty
                        ? const Padding(
                            padding: EdgeInsets.symmetric(vertical: 8),
                            child: Center(
                              child: SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            ),
                          )
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (ready.tasklistMaps.isEmpty)
                                const Text(
                                  'Không có nhóm để gắn.',
                                  style: TextStyle(color: Colors.black54),
                                ),
                              for (final row in ready.tasklistMaps) ...[
                                if (row != ready.tasklistMaps.first)
                                  const Divider(height: 20),
                                Text(
                                  row.groupName,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                DropdownButtonFormField<String?>(
                                  value: row.googleTasklistId,
                                  isExpanded: true,
                                  decoration: const InputDecoration(
                                    isDense: true,
                                    border: OutlineInputBorder(),
                                    contentPadding: EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 10,
                                    ),
                                  ),
                                  items: [
                                    const DropdownMenuItem<String?>(
                                      value: null,
                                      child: Text('Chưa gắn'),
                                    ),
                                    for (final list in ready.googleTasklists)
                                      DropdownMenuItem<String?>(
                                        value: list.id,
                                        enabled: !_listUsedByOtherGroup(
                                          ready.tasklistMaps,
                                          list.id,
                                          row.groupId,
                                        ),
                                        child: Text(
                                          list.title.isEmpty
                                              ? list.id
                                              : list.title,
                                        ),
                                      ),
                                  ],
                                  onChanged: ready.mapsBusy
                                      ? null
                                      : (id) {
                                          if (id == null) {
                                            context.read<SyncBloc>().add(
                                              SyncTasklistMapClearRequested(
                                                row.groupId,
                                              ),
                                            );
                                            return;
                                          }
                                          String? title;
                                          for (final l in ready.googleTasklists) {
                                            if (l.id == id) {
                                              title = l.title;
                                              break;
                                            }
                                          }
                                          context.read<SyncBloc>().add(
                                            SyncTasklistMapSetRequested(
                                              groupId: row.groupId,
                                              googleTasklistId: id,
                                              googleTasklistTitle: title,
                                            ),
                                          );
                                        },
                                ),
                                if (!row.mapped)
                                  const Padding(
                                    padding: EdgeInsets.only(top: 4),
                                    child: Text(
                                      'Chưa gắn — Tasks của nhóm này sẽ không sync Google.',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Color(0xFFB45309),
                                      ),
                                    ),
                                  ),
                              ],
                            ],
                          ),
                  ),
                  if (s.backlog.authRequired > 0) ...[
                    const SizedBox(height: 12),
                    _GoogleReauthCard(
                      busy: _googleLinkBusy,
                      onRelink: _linkGoogle,
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
                        _pill(
                          'authRequired ${s.backlog.authRequired}',
                          danger: s.backlog.authRequired > 0,
                        ),
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
                const SizedBox(height: 24),
                _SheetSection(ready: ready, df: df),
              ],
            ),
          );
        },
      ),
    );
  }

  bool _listUsedByOtherGroup(
    List<TasklistMapRow> maps,
    String listId,
    String currentGroupId,
  ) {
    for (final m in maps) {
      if (m.groupId != currentGroupId && m.googleTasklistId == listId) {
        return true;
      }
    }
    return false;
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

class _OrgSheetsList extends StatelessWidget {
  const _OrgSheetsList({
    required this.ready,
    required this.groups,
    required this.onSelectGroup,
    this.orgName,
  });

  final SyncReady ready;
  final List<GroupSummary> groups;
  final String? orgName;
  final void Function(String groupId) onSelectGroup;

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      title: orgName == null ? 'Sheet theo nhóm' : 'Sheet · $orgName',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (ready.orgSheetsBusy)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (groups.isEmpty)
            const Text(
              'Chọn tổ chức trên header (hoặc tạo nhóm ở Home).',
              style: TextStyle(color: ColorSkin.subtitle, fontSize: 13),
            )
          else
            for (final g in groups) ...[
              Material(
                color: g.id == ready.selectedGroupId
                    ? ColorSkin.tealLight.withValues(alpha: 0.55)
                    : const Color(0xFFF8FAFA),
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => onSelectGroup(g.id),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                g.name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: ColorSkin.title,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                ready.orgSheetsByGroupId[g.id]?.sheetTitle ??
                                    'Chưa có sheet',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: ColorSkin.subtitle,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (g.id == ready.selectedGroupId)
                          const Text(
                            'Nhóm hiện tại',
                            style: TextStyle(
                              fontSize: 11,
                              color: ColorSkin.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
        ],
      ),
    );
  }
}

class _GoogleLinkCard extends StatelessWidget {
  const _GoogleLinkCard({required this.busy, required this.onLink});

  final bool busy;
  final VoidCallback onLink;

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      title: 'Chưa liên kết Google',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: ColorSkin.tealLight.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: ColorSkin.border1.withValues(alpha: 0.6),
                    ),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(
                    Icons.cloud_sync_outlined,
                    color: ColorSkin.primary,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Kết nối để đồng bộ Tasks, Sheets và Drive',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: ColorSkin.title,
                          height: 1.3,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Dùng cùng email Google với tài khoản Vimes. '
                        'Cấp quyền Tasks + Sheets + Drive.file.',
                        style: TextStyle(
                          color: ColorSkin.subtitle,
                          fontSize: 13,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppButton(
            label: busy ? 'Đang liên kết…' : 'Liên kết Google',
            variant: AppButtonVariant.primary,
            expand: true,
            isLoading: busy,
            onPressed: busy ? null : onLink,
            icon: busy
                ? null
                : SvgPicture.asset(
                    'lib/assets/svg/google_logo.svg',
                    width: 18,
                    height: 18,
                  ),
          ),
        ],
      ),
    );
  }
}

class _GoogleReauthCard extends StatelessWidget {
  const _GoogleReauthCard({required this.busy, required this.onRelink});

  final bool busy;
  final VoidCallback onRelink;

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      title: 'Cần đăng nhập Google lại',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF1F0),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Text(
              'Token Google hết hạn hoặc thiếu quyền Sheets. '
              'Liên kết lại để tiếp tục đồng bộ.',
              style: TextStyle(
                color: ColorSkin.error,
                fontWeight: FontWeight.w600,
                fontSize: 13,
                height: 1.35,
              ),
            ),
          ),
          const SizedBox(height: 12),
          AppButton(
            label: busy ? 'Đang xác thực…' : 'Đăng nhập Google lại',
            variant: AppButtonVariant.primary,
            expand: true,
            isLoading: busy,
            onPressed: busy ? null : onRelink,
            icon: busy
                ? null
                : SvgPicture.asset(
                    'lib/assets/svg/google_logo.svg',
                    width: 18,
                    height: 18,
                  ),
          ),
        ],
      ),
    );
  }
}

class _SheetSection extends StatelessWidget {
  const _SheetSection({required this.ready, required this.df});

  final SyncReady ready;
  final DateFormat df;

  @override
  Widget build(BuildContext context) {
    final groupId = ready.selectedGroupId;
    final sheetBusy = ready.sheetBusy;
    final sheet = ready.sheetStatus?.sheet;
    final watches = ready.sheetStatus?.watches ?? const <DriveWatchDto>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Sheet nhóm',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 4),
        const Text(
          'Đồng bộ task nhóm ↔ Google Spreadsheet (Phase 4)',
          style: TextStyle(color: ColorSkin.subtitle, fontSize: 13),
        ),
        const SizedBox(height: 12),
        if (groupId == null)
          AppSectionCard(
            title: 'Chưa chọn nhóm',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: ColorSkin.orangeLight.withValues(alpha: 0.7),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    children: [
                      Icon(
                        Icons.groups_outlined,
                        color: ColorSkin.secondary1,
                        size: 22,
                      ),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Chọn nhóm trên header để đồng bộ Sheet.',
                          style: TextStyle(
                            color: ColorSkin.title,
                            fontSize: 13,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          )
        else if (sheetBusy && ready.sheetStatus == null)
          const AppSectionCard(
            title: 'Sheet nhóm',
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Center(child: CircularProgressIndicator()),
            ),
          )
        else if (sheet == null)
          AppSectionCard(
            title: 'Chưa có Sheet',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Nhóm này chưa ensure Sheet. Bấm tạo để chuẩn bị đồng bộ.',
                ),
                const SizedBox(height: 12),
                AppButton(
                  label: 'Tạo Sheet nhóm',
                  variant: AppButtonVariant.primary,
                  isLoading: sheetBusy,
                  onPressed: sheetBusy
                      ? null
                      : () => context
                          .read<SyncBloc>()
                          .add(const SyncSheetEnsureRequested()),
                ),
              ],
            ),
          )
        else ...[
          AppSectionCard(
            title: sheet.sheetTitle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _badge(sheet.status),
                    _badge(
                      sheet.isLocalMatrix ? 'Local (dev)' : 'LIVE',
                      highlight: !sheet.isLocalMatrix,
                    ),
                    if (watches.isNotEmpty) _badge('Đang theo dõi Drive'),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'Push: ${sheet.lastPushAt == null ? '—' : df.format(sheet.lastPushAt!.toLocal())}',
                ),
                Text(
                  'Pull: ${sheet.lastPullAt == null ? '—' : df.format(sheet.lastPullAt!.toLocal())}',
                ),
                if (watches.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Watch ACTIVE: ${watches.length}'
                    '${_watchExpiryHint(watches, df)}',
                    style: const TextStyle(
                      color: ColorSkin.subtitle,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              AppButton(
                label: 'Đẩy lên Sheet',
                variant: AppButtonVariant.primary,
                isLoading: sheetBusy,
                onPressed: sheetBusy
                    ? null
                    : () => context
                        .read<SyncBloc>()
                        .add(const SyncSheetPushRequested()),
              ),
              AppButton(
                label: 'Kéo từ Sheet',
                isLoading: sheetBusy,
                onPressed: sheetBusy
                    ? null
                    : () => context
                        .read<SyncBloc>()
                        .add(const SyncSheetPullRequested()),
              ),
              if (sheet.googleSheetUrl != null)
                AppButton(
                  label: 'Mở trên Google Sheets',
                  onPressed: () => _openSheet(sheet.googleSheetUrl!),
                ),
            ],
          ),
        ],
      ],
    );
  }

  static String _watchExpiryHint(List<DriveWatchDto> watches, DateFormat df) {
    DriveWatchDto? soonest;
    for (final w in watches) {
      if (soonest == null || w.expiresAt.isBefore(soonest.expiresAt)) {
        soonest = w;
      }
    }
    if (soonest == null) return '';
    final hours = soonest.expiresAt.difference(DateTime.now().toUtc()).inHours;
    if (hours < 24) {
      return ' · sắp hết hạn (${df.format(soonest.expiresAt.toLocal())})';
    }
    return '';
  }

  static Future<void> _openSheet(String url) async {
    final uri = Uri.parse(url);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) {
      SimpleSnackbarService.showError('Không mở được Google Sheets');
    }
  }

  static Widget _badge(String text, {bool highlight = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: highlight ? ColorSkin.tealLight : const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: highlight ? ColorSkin.primarySub : ColorSkin.subtitle,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
