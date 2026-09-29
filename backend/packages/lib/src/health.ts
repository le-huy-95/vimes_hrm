export type HealthStatus = {
  status: "ok" | "degraded";
  service: string;
  time: string;
};

/** Payload chuẩn cho `GET /health` của từng service. */
export function buildHealth(service: string): HealthStatus {
  return {
    status: "ok",
    service,
    time: new Date().toISOString(),
  };
}
