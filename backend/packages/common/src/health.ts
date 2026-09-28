export type HealthStatus = {
  status: "ok" | "degraded";
  service: string;
  time: string;
};

export function buildHealth(service: string): HealthStatus {
  return {
    status: "ok",
    service,
    time: new Date().toISOString(),
  };
}
