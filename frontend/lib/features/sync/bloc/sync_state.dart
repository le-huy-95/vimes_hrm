import 'package:equatable/equatable.dart';
import 'package:manage_teams/core/models/api_models.dart';

sealed class SyncState extends Equatable {
  const SyncState();
  @override
  List<Object?> get props => [];
}

class SyncInitial extends SyncState {
  const SyncInitial();
}

class SyncLoading extends SyncState {
  const SyncLoading();
}

class SyncReady extends SyncState {
  const SyncReady({
    required this.status,
    this.busy = false,
    this.sheetBusy = false,
    this.orgSheetsBusy = false,
    this.mapsBusy = false,
    this.selectedGroupId,
    this.sheetStatus,
    this.orgSheetsByGroupId = const {},
    this.tasklistMaps = const [],
    this.googleTasklists = const [],
  });

  final SyncStatus status;
  final bool busy;
  final bool sheetBusy;
  final bool orgSheetsBusy;
  final bool mapsBusy;
  final String? selectedGroupId;
  final SheetStatusResponse? sheetStatus;

  /// groupId → sheet (null = group has no sheet yet).
  final Map<String, GroupSheetDto?> orgSheetsByGroupId;
  final List<TasklistMapRow> tasklistMaps;
  final List<GoogleTasklistItem> googleTasklists;

  SyncReady copyWith({
    SyncStatus? status,
    bool? busy,
    bool? sheetBusy,
    bool? orgSheetsBusy,
    bool? mapsBusy,
    String? selectedGroupId,
    SheetStatusResponse? sheetStatus,
    Map<String, GroupSheetDto?>? orgSheetsByGroupId,
    List<TasklistMapRow>? tasklistMaps,
    List<GoogleTasklistItem>? googleTasklists,
    bool clearSheetStatus = false,
    bool clearSelectedGroupId = false,
    bool clearOrgSheets = false,
  }) {
    return SyncReady(
      status: status ?? this.status,
      busy: busy ?? this.busy,
      sheetBusy: sheetBusy ?? this.sheetBusy,
      orgSheetsBusy: orgSheetsBusy ?? this.orgSheetsBusy,
      mapsBusy: mapsBusy ?? this.mapsBusy,
      selectedGroupId:
          clearSelectedGroupId ? null : (selectedGroupId ?? this.selectedGroupId),
      sheetStatus:
          clearSheetStatus ? null : (sheetStatus ?? this.sheetStatus),
      orgSheetsByGroupId: clearOrgSheets
          ? const {}
          : (orgSheetsByGroupId ?? this.orgSheetsByGroupId),
      tasklistMaps: tasklistMaps ?? this.tasklistMaps,
      googleTasklists: googleTasklists ?? this.googleTasklists,
    );
  }

  @override
  List<Object?> get props => [
        status,
        busy,
        sheetBusy,
        orgSheetsBusy,
        mapsBusy,
        selectedGroupId,
        sheetStatus,
        orgSheetsByGroupId,
        tasklistMaps,
        googleTasklists,
      ];
}

class SyncFailure extends SyncState {
  const SyncFailure(this.message, {this.previous});
  final String message;
  final SyncReady? previous;
  @override
  List<Object?> get props => [message, previous];
}

class SyncActionSuccess extends SyncState {
  const SyncActionSuccess(this.message, {required this.ready});
  final String message;
  final SyncReady ready;
  @override
  List<Object?> get props => [message, ready];
}
