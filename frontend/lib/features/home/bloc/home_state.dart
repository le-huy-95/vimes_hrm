import 'package:equatable/equatable.dart';
import 'package:manage_teams/core/models/api_models.dart';

sealed class HomeState extends Equatable {
  const HomeState();
  @override
  List<Object?> get props => [];
}

class HomeInitial extends HomeState {
  const HomeInitial();
}

class HomeLoading extends HomeState {
  const HomeLoading();
}

class HomeReady extends HomeState {
  const HomeReady({
    required this.members,
    this.busy = false,
  });

  final List<GroupMember> members;
  final bool busy;

  HomeReady copyWith({
    List<GroupMember>? members,
    bool? busy,
  }) {
    return HomeReady(
      members: members ?? this.members,
      busy: busy ?? this.busy,
    );
  }

  @override
  List<Object?> get props => [members, busy];
}

class HomeFailure extends HomeState {
  const HomeFailure(this.message, {this.members = const []});
  final String message;
  final List<GroupMember> members;
  @override
  List<Object?> get props => [message, members];
}

class HomeActionSuccess extends HomeState {
  const HomeActionSuccess(this.message, {required this.members});
  final String message;
  final List<GroupMember> members;
  @override
  List<Object?> get props => [message, members];
}
