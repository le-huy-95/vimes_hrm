/**
 * Load-test mock Google Tasks quota (Phase 5).
 * Không gọi Google thật — mô phỏng N user × ops/ngày vs trần 50k.
 *
 *   pnpm --filter @manage-teams/google-sync-service exec tsx scripts/load-test-google-mock.ts
 */
const DAILY_QUOTA = Number(process.env.MOCK_TASKS_DAILY_QUOTA ?? 50_000);
const USERS = Number(process.env.MOCK_USERS ?? 800);
const OPS_PER_USER = Number(process.env.MOCK_OPS_PER_USER_DAY ?? 60);
/** push + pull + reconcile ước lượng */
const OPS = ["push", "pull", "list"] as const;

function simulate(): {
  totalOps: number;
  quota: number;
  utilization: number;
  ok: boolean;
  maxUsersAt60ops: number;
} {
  const totalOps = USERS * OPS_PER_USER;
  const utilization = totalOps / DAILY_QUOTA;
  return {
    totalOps,
    quota: DAILY_QUOTA,
    utilization,
    ok: totalOps <= DAILY_QUOTA,
    maxUsersAt60ops: Math.floor(DAILY_QUOTA / OPS_PER_USER),
  };
}

const result = simulate();
console.log(
  JSON.stringify(
    {
      scenario: { USERS, OPS_PER_USER, opsKinds: OPS },
      ...result,
      alert70: result.utilization >= 0.7,
      alert80: result.utilization >= 0.8,
      note: "Ước lượng Phase 5 — đo thật với mock HTTP server khi gắn integration test",
    },
    null,
    2,
  ),
);
process.exit(result.ok ? 0 : 2);
