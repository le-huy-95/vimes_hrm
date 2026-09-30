import 'package:equatable/equatable.dart';

sealed class HomeEvent extends Equatable {
  const HomeEvent();
  @override
  List<Object?> get props => [];
}

class HomeStarted extends HomeEvent {
  const HomeStarted();
}

class HomeGroupChanged extends HomeEvent {
  const HomeGroupChanged(this.groupId);
  final String? groupId;
  @override
  List<Object?> get props => [groupId];
}

class HomeCreateOrgRequested extends HomeEvent {
  const HomeCreateOrgRequested(this.name);
  final String name;
  @override
  List<Object?> get props => [name];
}

class HomeCreateGroupRequested extends HomeEvent {
  const HomeCreateGroupRequested(this.name);
  final String name;
  @override
  List<Object?> get props => [name];
}

class HomeInviteRequested extends HomeEvent {
  const HomeInviteRequested(this.email, {this.role = 'MEMBER'});
  final String email;
  final String role;
  @override
  List<Object?> get props => [email, role];
}

class HomeAcceptInviteRequested extends HomeEvent {
  const HomeAcceptInviteRequested(this.token);
  final String token;
  @override
  List<Object?> get props => [token];
}

class HomeRemoveMemberRequested extends HomeEvent {
  const HomeRemoveMemberRequested(this.userId);
  final String userId;
  @override
  List<Object?> get props => [userId];
}

class HomeAddMemberRequested extends HomeEvent {
  const HomeAddMemberRequested(this.userId, {this.role = 'MEMBER'});
  final String userId;
  final String role;
  @override
  List<Object?> get props => [userId, role];
}

class HomeLeaveGroupRequested extends HomeEvent {
  const HomeLeaveGroupRequested();
}
