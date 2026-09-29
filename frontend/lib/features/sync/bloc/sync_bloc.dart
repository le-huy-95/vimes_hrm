import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams/core/models/api_models.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/home/data/sync_repository.dart';
import 'package:manage_teams/features/sync/bloc/sync_event.dart';
import 'package:manage_teams/features/sync/bloc/sync_state.dart';

class SyncBloc extends Bloc<SyncEvent, SyncState> {
  SyncBloc(this._sync) : super(const SyncInitial()) {
    on<SyncStarted>(_onStarted);
    on<SyncRefreshRequested>(_onRefresh);
    on<SyncPullRequested>(_onPull);
    on<SyncFullRequested>(_onFull);
    on<SyncGroupContextChanged>(_onGroupContext);
    on<SyncSheetEnsureRequested>(_onSheetEnsure);
    on<SyncOrgSheetsRefreshRequested>(_onOrgSheetsRefresh);
    on<SyncSheetPushRequested>(_onSheetPush);
    on<SyncSheetPullRequested>(_onSheetPull);
  }

  final SyncRepository _sync;
  String? _groupId;

  SyncReady? get _ready {
    final s = state;
    if (s is SyncReady) return s;
    if (s is SyncFailure) return s.previous;
    if (s is SyncActionSuccess) return s.ready;
    return null;
  }

  Future<void> _onStarted(SyncStarted event, Emitter<SyncState> emit) async {
    emit(const SyncLoading());
    try {
      final status = await _sync.status();
      emit(
        SyncReady(
          status: status,
          selectedGroupId: _groupId,
        ),
      );
    } catch (e) {
      emit(SyncFailure(_msg(e)));
    }
  }

  Future<void> _onRefresh(
    SyncRefreshRequested event,
    Emitter<SyncState> emit,
  ) async {
    final prev = _ready;
    if (prev != null) {
      emit(prev.copyWith(busy: true));
    } else {
      emit(const SyncLoading());
    }
    try {
      final status = await _sync.status();
      SheetStatusResponse? sheetStatus;
      final gid = _groupId;
      if (gid != null) {
        sheetStatus = await _sync.getSheetStatus(gid);
      }
      emit(
        SyncReady(
          status: status,
          selectedGroupId: gid,
          sheetStatus: sheetStatus,
        ),
      );
    } catch (e) {
      emit(SyncFailure(_msg(e), previous: prev));
      if (prev != null) emit(prev.copyWith(busy: false));
    }
  }

  Future<void> _onGroupContext(
    SyncGroupContextChanged event,
    Emitter<SyncState> emit,
  ) async {
    if (event.groupId == _groupId) {
      // Same group: only fetch sheet if we never loaded it while ready.
      final prev = _ready;
      if (prev != null &&
          event.groupId != null &&
          prev.sheetStatus == null &&
          !prev.sheetBusy) {
        await _loadSheet(emit, prev, event.groupId!);
      }
      return;
    }

    _groupId = event.groupId;
    final prev = _ready;
    if (prev == null) return;

    if (event.groupId == null) {
      emit(
        prev.copyWith(
          clearSelectedGroupId: true,
          clearSheetStatus: true,
          sheetBusy: false,
        ),
      );
      return;
    }

    await _loadSheet(
      emit,
      prev.copyWith(selectedGroupId: event.groupId, clearSheetStatus: true),
      event.groupId!,
    );
  }

  Future<void> _loadSheet(
    Emitter<SyncState> emit,
    SyncReady base,
    String groupId,
  ) async {
    emit(base.copyWith(selectedGroupId: groupId, sheetBusy: true));
    try {
      final sheetStatus = await _sync.getSheetStatus(groupId);
      final ready = _ready ?? base;
      emit(
        ready.copyWith(
          selectedGroupId: groupId,
          sheetStatus: sheetStatus,
          sheetBusy: false,
        ),
      );
    } catch (e) {
      final ready = _ready ?? base;
      emit(SyncFailure(_msg(e), previous: ready.copyWith(sheetBusy: false)));
      emit(ready.copyWith(sheetBusy: false));
    }
  }

  Future<void> _onPull(SyncPullRequested event, Emitter<SyncState> emit) async {
    final prev = _ready;
    if (prev != null) emit(prev.copyWith(busy: true));
    try {
      await _sync.pull(force: true);
      final status = await _sync.status();
      final next = (prev ?? SyncReady(status: status)).copyWith(
        status: status,
        busy: false,
      );
      emit(SyncActionSuccess('Đã enqueue pull', ready: next));
      emit(next);
    } catch (e) {
      emit(SyncFailure(_msg(e), previous: prev));
      if (prev != null) emit(prev.copyWith(busy: false));
    }
  }

  Future<void> _onFull(SyncFullRequested event, Emitter<SyncState> emit) async {
    final prev = _ready;
    if (prev != null) emit(prev.copyWith(busy: true));
    try {
      await _sync.fullSync();
      final status = await _sync.status();
      final next = (prev ?? SyncReady(status: status)).copyWith(
        status: status,
        busy: false,
      );
      emit(SyncActionSuccess('Đã enqueue full sync', ready: next));
      emit(next);
    } catch (e) {
      emit(SyncFailure(_msg(e), previous: prev));
      if (prev != null) emit(prev.copyWith(busy: false));
    }
  }

  Future<void> _onSheetEnsure(
    SyncSheetEnsureRequested event,
    Emitter<SyncState> emit,
  ) async {
    final prev = _ready;
    final gid = _groupId;
    if (prev == null || gid == null) return;
    emit(prev.copyWith(sheetBusy: true));
    try {
      final sheet = await _sync.ensureSheet(gid);
      final watches = prev.sheetStatus?.watches ?? const <DriveWatchDto>[];
      final orgMap = Map<String, GroupSheetDto?>.from(prev.orgSheetsByGroupId);
      orgMap[gid] = sheet;
      final next = prev.copyWith(
        sheetBusy: false,
        sheetStatus: SheetStatusResponse(sheet: sheet, watches: watches),
        orgSheetsByGroupId: orgMap,
      );
      emit(SyncActionSuccess('Đã tạo / cập nhật Sheet nhóm', ready: next));
      emit(next);
    } catch (e) {
      emit(SyncFailure(_msg(e), previous: prev));
      emit(prev.copyWith(sheetBusy: false));
    }
  }

  Future<void> _onOrgSheetsRefresh(
    SyncOrgSheetsRefreshRequested event,
    Emitter<SyncState> emit,
  ) async {
    final prev = _ready;
    if (prev == null) return;
    final ids = event.groupIds;
    if (ids.isEmpty) {
      emit(prev.copyWith(clearOrgSheets: true, orgSheetsBusy: false));
      return;
    }
    emit(prev.copyWith(orgSheetsBusy: true));
    try {
      final entries = await Future.wait(
        ids.map((id) async {
          try {
            final status = await _sync.getSheetStatus(id);
            return MapEntry(id, status.sheet);
          } catch (_) {
            return MapEntry(id, null);
          }
        }),
      );
      final map = Map<String, GroupSheetDto?>.fromEntries(entries);
      final ready = _ready ?? prev;
      emit(
        ready.copyWith(
          orgSheetsByGroupId: map,
          orgSheetsBusy: false,
        ),
      );
    } catch (e) {
      final ready = _ready ?? prev;
      emit(SyncFailure(_msg(e), previous: ready.copyWith(orgSheetsBusy: false)));
      emit(ready.copyWith(orgSheetsBusy: false));
    }
  }

  Future<void> _onSheetPush(
    SyncSheetPushRequested event,
    Emitter<SyncState> emit,
  ) async {
    final prev = _ready;
    final gid = _groupId;
    if (prev == null || gid == null) return;
    emit(prev.copyWith(sheetBusy: true));
    try {
      final enq = await _sync.pushSheet(gid);
      final next = prev.copyWith(sheetBusy: false);
      final msg = enq.deduped
          ? 'Job đẩy Sheet đang chờ — không tạo thêm. Kéo xuống để xem.'
          : 'Đã xếp hàng đẩy Sheet'
              '${enq.debounceMs != null ? ' (~${(enq.debounceMs! / 1000).round()}s)' : ''}'
              '. Kéo xuống để cập nhật trạng thái.';
      emit(SyncActionSuccess(msg, ready: next));
      emit(next);
    } catch (e) {
      emit(SyncFailure(_msg(e), previous: prev));
      emit(prev.copyWith(sheetBusy: false));
    }
  }

  Future<void> _onSheetPull(
    SyncSheetPullRequested event,
    Emitter<SyncState> emit,
  ) async {
    final prev = _ready;
    final gid = _groupId;
    if (prev == null || gid == null) return;
    emit(prev.copyWith(sheetBusy: true));
    try {
      final enq = await _sync.pullSheet(gid);
      final next = prev.copyWith(sheetBusy: false);
      final msg = enq.deduped
          ? 'Job kéo Sheet đang chờ — không tạo thêm. Kéo xuống để xem.'
          : 'Đã xếp hàng kéo từ Sheet. Kéo xuống để cập nhật; mở tab Tasks nếu cần xem thay đổi.';
      emit(SyncActionSuccess(msg, ready: next));
      emit(next);
    } catch (e) {
      emit(SyncFailure(_msg(e), previous: prev));
      emit(prev.copyWith(sheetBusy: false));
    }
  }

  String _msg(Object e) => e is ApiException ? e.message : e.toString();
}
