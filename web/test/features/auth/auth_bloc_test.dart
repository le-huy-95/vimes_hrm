import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:manage_teams_app/data/models/auth_models.dart';
import 'package:manage_teams_app/domain/repositories/auth_repository.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_event.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_state.dart';

class _MockAuthRepo extends Mock implements AuthRepository {}

void main() {
  late _MockAuthRepo repo;
  final me = Me(
    id: 'u1',
    email: 'a@b.c',
    fullName: 'A',
    orgId: 'o1',
    status: 'active',
    org: const OrgBrief(id: 'o1', name: 'Org'),
  );

  setUp(() => repo = _MockAuthRepo());

  blocTest<AuthBloc, AuthState>(
    'emits authenticated on login success',
    build: () {
      when(
        () => repo.login(
          email: any(named: 'email'),
          password: any(named: 'password'),
        ),
      ).thenAnswer((_) async => me);
      return AuthBloc(authRepository: repo);
    },
    act: (b) =>
        b.add(const AuthLoginSubmitted(email: 'a@b.c', password: 'x')),
    expect: () => [
      const AuthLoading(),
      AuthAuthenticated(me),
    ],
  );
}
