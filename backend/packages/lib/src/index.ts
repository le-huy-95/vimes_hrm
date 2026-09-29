/** Gói dùng chung (@manage-teams/lib) — HTTP, JWT, crypto, logger, lỗi. */
export { loadEnv } from "./env.js";
export type { AppEnv } from "./env.js";
export { ensureBackendEnvLoaded } from "./load-backend-env.js";
export { createLogger } from "./logger.js";
export type { Logger } from "./logger.js";
export { AppError, isAppError } from "./errors.js";
export { buildHealth } from "./health.js";
export type { HealthStatus } from "./health.js";
export { sha256, randomToken } from "./crypto.js";
export { sendError, asyncHandler } from "./http.js";
export { getJwtSecret, verifyAccessToken, requireUser } from "./auth.js";
export type { AuthUser, HeaderCarrier } from "./auth.js";
export {
  startSpan,
  endSpan,
  withSpan,
  getOtelSnapshot,
  otelPrometheusLines,
  resetOtelLite,
} from "./otel-lite.js";
export type { SpanHandle } from "./otel-lite.js";
export { parseCorsOrigins, isCorsOriginAllowed } from "./cors.js";
