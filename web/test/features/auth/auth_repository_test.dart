import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:manage_teams_app/core/storage/token_store.dart';
import 'package:manage_teams_app/data/datasources/api_services/auth_api_service.dart';
import 'package:manage_teams_app/data/models/auth_models.dart';
import 'package:manage_teams_app/data/repositories/auth_repository_impl.dart';

class _MockApi extends Mock implements AuthApiService {}

class _MockStore extends Mock implements TokenStore {}

void main() {
  late _MockApi api;
  late _MockStore store;
  late AuthRepositoryImpl repo;

  final me = Me(
    id: 'u1',
    email: 'a@b.c',
    fullName: 'A',
    orgId: 'o1',
    status: 'active',
    org: const OrgBrief(id: 'o1', name: 'Org'),
  );

  setUp(() {
    api = _MockApi();
    store = _MockStore();
    repo = AuthRepositoryImpl(tokenStore: store, api: api);
    when(() => store.saveAccessToken(any())).thenAnswer((_) async {});
  });

  test('login saves token and returns me', () async {
    when(() => api.login(any())).thenAnswer(
      (_) async => const Session(accessToken: 'tok'),
    );
    when(() => api.me()).thenAnswer((_) async => me);

    final result = await repo.login(email: 'a@b.c', password: 'x');

    expect(result, me);
    verify(() => store.saveAccessToken('tok')).called(1);
  });
}
