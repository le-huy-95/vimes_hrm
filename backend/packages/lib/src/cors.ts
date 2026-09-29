/** CORS helpers — parse allowlist + localhost-any-port in non-production (Flutter web). */

const DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://localhost:8080";

/** Parse `CORS_ORIGINS` env (comma-separated). */
export function parseCorsOrigins(raw?: string): string[] {
  return (raw ?? DEFAULT_CORS_ORIGINS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Whether `origin` may call the API.
 * - Missing origin (same-origin / curl / server-to-server) → allow
 * - Exact match in allowlist, or `*` in allowlist → allow
 * - Non-production: any `http(s)://localhost|127.0.0.1` (any port) → allow
 *   so Flutter web ephemeral ports work without editing env each run
 */
export function isCorsOriginAllowed(
  origin: string | undefined,
  allowlist: string[],
  opts?: { nodeEnv?: string },
): boolean {
  if (!origin) return true;
  if (allowlist.includes("*") || allowlist.includes(origin)) return true;

  const nodeEnv = opts?.nodeEnv ?? process.env.NODE_ENV ?? "development";
  if (nodeEnv !== "production" && isLocalDevOrigin(origin)) return true;

  return false;
}
