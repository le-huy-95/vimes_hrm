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
    this.selectedGroupId,
    this.sheetStatus,
    this.orgSheetsByGroupId = const {},
  });

  final SyncStatus status;
  final bool busy;
  final bool sheetBusy;
  final bool orgSheetsBusy;
  final String? selectedGroupId;
  final SheetStatusResponse? sheetStatus;

  /// groupId → sheet (null = group has no sheet yet).
  final Map<String, GroupSheetDto?> orgSheetsByGroupId;

  SyncReady copyWith({
    SyncStatus? status,
    bool? busy,
    bool? sheetBusy,
    bool? orgSheetsBusy,
    String? selectedGroupId,
    SheetStatusResponse? sheetStatus,
    Map<String, GroupSheetDto?>? orgSheetsByGroupId,
    bool clearSheetStatus = false,
    bool clearSelectedGroupId = false,
    bool clearOrgSheets = false,
  }) {
    return SyncReady(
      status: status ?? this.status,
      busy: busy ?? this.busy,
      sheetBusy: sheetBusy ?? this.sheetBusy,
      orgSheetsBusy: orgSheetsBusy ?? this.orgSheetsBusy,
      selectedGroupId:
          clearSelectedGroupId ? null : (selectedGroupId ?? this.selectedGroupId),
      sheetStatus:
          clearSheetStatus ? null : (sheetStatus ?? this.sheetStatus),
      orgSheetsByGroupId: clearOrgSheets
          ? const {}
          : (orgSheetsByGroupId ?? this.orgSheetsByGroupId),
    );
  }

  @override
  List<Object?> get props => [
        status,
        busy,
        sheetBusy,
        orgSheetsBusy,
        selectedGroupId,
        sheetStatus,
        orgSheetsByGroupId,
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
