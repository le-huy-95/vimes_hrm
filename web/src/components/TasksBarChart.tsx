export type TasksChartCounts = {
  todo: number;
  doing: number;
  done: number;
  connected?: boolean;
  lastSyncedAt?: string | null;
};

export function TasksBarChart({
  counts,
  emptyHint,
}: {
  counts: TasksChartCounts | null;
  emptyHint?: string;
}) {
  const todo = counts?.todo ?? 0;
  const doing = counts?.doing ?? 0;
  const done = counts?.done ?? 0;
  const max = Math.max(todo, doing, done, 1);
  const connected = counts?.connected ?? false;
  const hasData = connected || todo + doing + done > 0;

  return (
    <section className="dash-card">
      <h2 className="dash-card-title">Tiến độ Google Tasks</h2>
      {!hasData ? (
        <p className="muted small">
          {emptyHint ??
            "Chưa kết nối Google Tasks. Liên kết task list để xem biểu đồ."}
        </p>
      ) : (
        <>
          {counts?.lastSyncedAt && (
            <p className="muted small">
              Sync lần cuối: {new Date(counts.lastSyncedAt).toLocaleString()}
            </p>
          )}
          <div className="bar-chart" role="img" aria-label="Biểu đồ Todo Doing Done">
            {(
              [
                ["Todo", todo, "bar-todo"],
                ["Doing", doing, "bar-doing"],
                ["Done", done, "bar-done"],
              ] as const
            ).map(([label, value, cls]) => (
              <div key={label} className="bar-col">
                <div className="bar-track">
                  <div
                    className={`bar-fill ${cls}`}
                    style={{ height: `${(value / max) * 100}%` }}
                  />
                </div>
                <div className="bar-label">
                  {label}
                  <strong>{value}</strong>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
