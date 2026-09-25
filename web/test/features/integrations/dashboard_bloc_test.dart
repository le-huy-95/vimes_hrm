import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:manage_teams_app/data/models/dashboard_models.dart';
import 'package:manage_teams_app/domain/repositories/dashboard_repository.dart';
import 'package:manage_teams_app/features/integrations/bloc/dashboard_bloc.dart';

class _MockDash extends Mock implements DashboardRepository {}

void main() {
  late _MockDash repo;

  setUp(() {
    repo = _MockDash();
    when(() => repo.loadDashboard('t1')).thenAnswer(
      (_) async => const TeamDashboard(
        chart: TasksChartCounts(todo: 1, doing: 2, done: 3, connected: true),
        googleLinked: 1,
        githubLinked: 0,
      ),
    );
    when(() => repo.googleTasksStatus('t1')).thenAnswer(
      (_) async => const GoogleTasksStatus(
        oauthConnected: true,
        chart: TasksChartCounts(todo: 1, doing: 2, done: 3, connected: true),
      ),
    );
    when(() => repo.googleTasksLists('t1'))
        .thenAnswer((_) async => const [TaskListOption(id: 'l1', title: 'Todo')]);
  });

  blocTest<DashboardBloc, DashboardState>(
    'loads dashboard on start',
    build: () => DashboardBloc(repository: repo),
    act: (b) => b.add(const DashboardStarted('t1')),
    expect: () => [
      const DashboardLoading(),
      isA<DashboardReady>()
          .having((s) => s.dashboard.chart.todo, 'todo', 1)
          .having((s) => s.tasksStatus.oauthConnected, 'oauth', true)
          .having((s) => s.remoteLists.length, 'lists', 1),
    ],
  );
}
