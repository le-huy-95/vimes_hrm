import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:manage_teams_app/data/models/team_models.dart';
import 'package:manage_teams_app/domain/repositories/team_repository.dart';
import 'package:manage_teams_app/features/teams/bloc/team_detail_bloc.dart';

class _MockTeams extends Mock implements TeamRepository {}

void main() {
  late _MockTeams repo;

  final team = Team(
    id: 't1',
    orgId: 'o1',
    name: 'Eng',
    createdAt: '2026-01-01',
  );
  final member = TeamMember(
    id: 'm1',
    teamId: 't1',
    userId: 'u1',
    role: 'lead',
    joinedAt: '2026-01-01',
    user: const TeamMemberUser(
      id: 'u1',
      email: 'a@b.c',
      fullName: 'A',
      status: 'active',
    ),
  );

  setUp(() {
    repo = _MockTeams();
    when(() => repo.getById('t1')).thenAnswer((_) async => team);
    when(() => repo.listMembers('t1')).thenAnswer((_) async => [member]);
  });

  blocTest<TeamDetailBloc, TeamDetailState>(
    'loads team and members on start',
    build: () =>
        TeamDetailBloc(teamRepository: repo, currentUserId: 'u1'),
    act: (b) => b.add(const TeamDetailStarted('t1')),
    expect: () => [
      const TeamDetailLoading(),
      isA<TeamDetailReady>()
          .having((s) => s.team.name, 'name', 'Eng')
          .having((s) => s.myRole, 'role', 'lead')
          .having((s) => s.members.length, 'members', 1),
    ],
  );

  blocTest<TeamDetailBloc, TeamDetailState>(
    'invite success reloads with message',
    build: () {
      when(
        () => repo.invite(
          't1',
          email: any(named: 'email'),
          role: any(named: 'role'),
        ),
      ).thenAnswer((_) async {});
      return TeamDetailBloc(teamRepository: repo, currentUserId: 'u1');
    },
    act: (b) async {
      b.add(const TeamDetailStarted('t1'));
      await b.stream.firstWhere((s) => s is TeamDetailReady);
      b.add(
        const TeamDetailMemberInvited(email: 'x@y.z', role: 'member'),
      );
    },
    expect: () => [
      const TeamDetailLoading(),
      isA<TeamDetailReady>(),
      const TeamDetailLoading(),
      isA<TeamDetailReady>().having(
        (s) => s.message,
        'message',
        'Đã mời x@y.z',
      ),
    ],
  );
}
