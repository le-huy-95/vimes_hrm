import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:manage_teams_app/data/models/dashboard_models.dart';

class TasksBarChart extends StatelessWidget {
  const TasksBarChart({
    super.key,
    required this.counts,
    this.emptyHint,
    this.actions,
  });

  final TasksChartCounts? counts;
  final String? emptyHint;
  final Widget? actions;

  @override
  Widget build(BuildContext context) {
    final c = counts ?? const TasksChartCounts();
    final hasData = c.hasData;
    final maxY = [c.todo, c.doing, c.done, 1].reduce((a, b) => a > b ? a : b).toDouble();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Tiến độ Google Tasks',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            if (!hasData)
              Text(
                emptyHint ??
                    'Chưa kết nối Google Tasks. Liên kết task list để xem biểu đồ.',
                style: Theme.of(context).textTheme.bodySmall,
              )
            else ...[
              if (c.lastSyncedAt != null)
                Text(
                  'Sync lần cuối: ${c.lastSyncedAt}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              SizedBox(
                height: 180,
                child: BarChart(
                  BarChartData(
                    maxY: maxY,
                    titlesData: FlTitlesData(
                      leftTitles: const AxisTitles(),
                      topTitles: const AxisTitles(),
                      rightTitles: const AxisTitles(),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          getTitlesWidget: (value, meta) {
                            const labels = ['Todo', 'Doing', 'Done'];
                            final i = value.toInt();
                            if (i < 0 || i > 2) return const SizedBox.shrink();
                            return Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text('${labels[i]}\n${[c.todo, c.doing, c.done][i]}',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(fontSize: 11)),
                            );
                          },
                        ),
                      ),
                    ),
                    borderData: FlBorderData(show: false),
                    gridData: const FlGridData(show: false),
                    barGroups: [
                      _bar(0, c.todo.toDouble(), Colors.blueGrey),
                      _bar(1, c.doing.toDouble(), Colors.orange),
                      _bar(2, c.done.toDouble(), Colors.teal),
                    ],
                  ),
                ),
              ),
            ],
            if (actions != null) ...[
              const SizedBox(height: 12),
              actions!,
            ],
          ],
        ),
      ),
    );
  }

  BarChartGroupData _bar(int x, double y, Color color) {
    return BarChartGroupData(
      x: x,
      barRods: [
        BarChartRodData(
          toY: y,
          color: color,
          width: 28,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
        ),
      ],
    );
  }
}
