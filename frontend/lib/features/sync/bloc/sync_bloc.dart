import 'package:flutter_bloc/flutter_bloc.dart';
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
  }

  final SyncRepository _sync;

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
      emit(SyncReady(status: status));
    } catch (e) {
      emit(SyncFailure(_msg(e)));
    }
  }

  Future<void> _onRefresh(
    SyncRefreshRequested event,
    Emitter<SyncState> emit,
  ) async {
    add(const SyncStarted());
  }

  Future<void> _onPull(SyncPullRequested event, Emitter<SyncState> emit) async {
    final prev = _ready;
    if (prev != null) emit(prev.copyWith(busy: true));
    try {
      await _sync.pull();
      final status = await _sync.status();
      final next = SyncReady(status: status);
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
      final next = SyncReady(status: status);
      emit(SyncActionSuccess('Đã enqueue full sync', ready: next));
      emit(next);
    } catch (e) {
      emit(SyncFailure(_msg(e), previous: prev));
      if (prev != null) emit(prev.copyWith(busy: false));
    }
  }

  String _msg(Object e) => e is ApiException ? e.message : e.toString();
}
