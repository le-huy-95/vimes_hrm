import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/skin/color_skin.dart';
import 'package:manage_teams/features/home/data/sync_repository.dart';
import 'package:manage_teams/shared/snackbar/simple_snackbar_service.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';
import 'package:manage_teams/shared/widgets/app_section_card.dart';

class SyncTabPage extends StatefulWidget {
  const SyncTabPage({super.key});

  @override
  State<SyncTabPage> createState() => _SyncTabPageState();
}

class _SyncTabPageState extends State<SyncTabPage> {
  SyncStatus? _status;
  bool _loading = true;
  bool _busy = false;

  SyncRepository get _sync => context.read<SyncRepository>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final s = await _sync.status();
      if (mounted) setState(() => _status = s);
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pull() async {
    setState(() => _busy = true);
    try {
      await _sync.pull();
      SimpleSnackbarService.showSuccess('Đã enqueue pull');
      await _load();
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _full() async {
    setState(() => _busy = true);
    try {
      await _sync.fullSync();
      SimpleSnackbarService.showSuccess('Đã enqueue full sync');
      await _load();
    } catch (e) {
      SimpleSnackbarService.showError(e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final s = _status;
    if (s == null) {
      return Center(
        child: AppButton(
          label: 'Tải lại',
          variant: AppButtonVariant.primary,
          onPressed: _load,
        ),
      );
    }

    final df = DateFormat('dd/MM HH:mm');
    return RefreshIndicator(
      onRefresh: _load,
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
            AppSectionCard(
              title: 'Chưa liên kết Google',
              child: const Text(
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
                  isLoading: _busy,
                  onPressed: _busy ? null : _pull,
                ),
                const SizedBox(width: 8),
                AppButton(
                  label: 'Full sync',
                  isLoading: _busy,
                  onPressed: _busy ? null : _full,
                ),
              ],
            ),
            if (s.backlog.authRequired > 0) ...[
              const SizedBox(height: 12),
              const Text(
                'Cần đăng nhập Google lại (authRequired > 0)',
                style: TextStyle(color: ColorSkin.error, fontWeight: FontWeight.w600),
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
                  _pill('failed ${s.backlog.failed}', danger: s.backlog.failed > 0),
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
                    const Text('Không có job', style: TextStyle(color: ColorSkin.subtitle)),
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
