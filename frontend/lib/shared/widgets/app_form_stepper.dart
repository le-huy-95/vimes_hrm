import 'package:flutter/material.dart';
import 'package:manage_teams/core/skin/color_skin.dart';

/// Thanh stepper dùng chung cho các form nhập liệu theo từng bước
/// (thông tin chung -> Hàng hóa -> xác nhận).
class AppFormStepper extends StatelessWidget {
  const AppFormStepper({
    super.key,
    required this.steps,
    required this.currentIndex,
  });

  final List<String> steps;
  final int currentIndex;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < steps.length; i++)
          Expanded(
            child: _FormStepItem(
              index: i,
              total: steps.length,
              label: steps[i],
              state: i < currentIndex
                  ? _FormStepState.done
                  : i == currentIndex
                  ? _FormStepState.current
                  : _FormStepState.todo,
            ),
          ),
      ],
    );
  }
}

enum _FormStepState { done, current, todo }

class _FormStepItem extends StatelessWidget {
  const _FormStepItem({
    required this.index,
    required this.total,
    required this.label,
    required this.state,
  });

  final int index;
  final int total;
  final String label;
  final _FormStepState state;

  static const double _dotSize = 28;
  static const double _lineThickness = 2;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final center = width / 2;
        final isDone = state == _FormStepState.done;
        final isCurrent = state == _FormStepState.current;
        final color = isDone || isCurrent
            ? ColorSkin.primary
            : ColorSkin.border1;

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: 32,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  if (index > 0)
                    Positioned(
                      left: 0,
                      right: width - center + _dotSize / 2 + 2,
                      top: 0,
                      bottom: 0,
                      child: Center(
                        child: Container(
                          height: _lineThickness,
                          color: isDone || isCurrent
                              ? ColorSkin.primary
                              : ColorSkin.grey3,
                        ),
                      ),
                    ),
                  if (index < total - 1)
                    Positioned(
                      left: center + _dotSize / 2 + 2,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      child: Center(
                        child: Container(
                          height: _lineThickness,
                          color: isDone ? ColorSkin.primary : ColorSkin.grey3,
                        ),
                      ),
                    ),
                  Container(
                    width: _dotSize,
                    height: _dotSize,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isDone || isCurrent
                          ? ColorSkin.primary
                          : Colors.white,
                      border: Border.all(
                        color: color,
                        width: isCurrent ? 2 : 1.5,
                      ),
                    ),
                    child: Center(
                      child: isDone
                          ? const Icon(
                              Icons.check,
                              size: 16,
                              color: Colors.white,
                            )
                          : Text(
                              '${index + 1}',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: isDone || isCurrent
                                    ? Colors.white
                                    : ColorSkin.subtitle,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Text(
                label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w500,
                  color: isDone || isCurrent
                      ? ColorSkin.title
                      : ColorSkin.subtitle,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
