/**
 * api-gateway — cổng vào duy nhất cho client (port 3200).
 * Chỉ CORS / JWT / rate-limit / proxy; không chứa nghiệp vụ domain.
 */
/**
 * API GATEWAY — cổng vào duy nhất (:3200)
 * ----------------------------------------
 * Mục đích: CORS, JWT, rate-limit, proxy tới identity/core/chat/ai.
 * Không chứa logic nghiệp vụ hay truy vấn DB.
 */
/**
 * API GATEWAY — cổng vào duy nhất (:3200)
 * -----------------------------------------
 * Mục đích: CORS, rate-limit, JWT, proxy tới identity/core/chat/ai.
 * Không chứa nghiệp vụ (org/task/auth logic nằm ở upstream).
 */
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import {
  AppError,
  buildHealth,
  createLogger,
  isAppError,
  isCorsOriginAllowed,
  parseCorsOrigins,
} from "@manage-teams/lib";
import { correlationIdMiddleware, CORRELATION_HEADER } from "./middlewares/correlation.js";
import { createJwtGuard } from "./middlewares/auth-guard.js";

const serviceName = "api-gateway";
const logger = createLogger(serviceName);
const port = Number(process.env.PORT ?? 3200);
const identityUrl = process.env.IDENTITY_URL ?? "http://localhost:3202";
const coreUrl = process.env.CORE_URL ?? "http://localhost:3203";
const chatUrl = process.env.CHAT_URL ?? "http://localhost:3204";
const aiUrl = process.env.AI_URL ?? "http://localhost:3205";
const googleSyncUrl = process.env.GOOGLE_SYNC_URL ?? "http://localhost:3207";
const jwtSecret = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";
const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

const app = express();
app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, cb) => {
      if (isCorsOriginAllowed(origin, corsOrigins)) {
        cb(null, true);
        return;
      }
      cb(new Error(`CORS blocked for origin ${origin}`));
    },
    credentials: true,
    exposedHeaders: [CORRELATION_HEADER],
  }),
);

app.use(correlationIdMiddleware());

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.AUTH_RATE_LIMIT_PER_MIN ?? 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "RATE_LIMIT", message: "Quá nhiều yêu cầu đăng nhập. Thử lại sau." },
});

const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.API_RATE_LIMIT_PER_MIN ?? 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "RATE_LIMIT", message: "Quá nhiều yêu cầu. Thử lại sau." },
});

app.use("/auth", authLimiter);
app.use(generalLimiter);

app.get("/health", (_req, res) => {
  res.json({
    ...buildHealth(serviceName),
    upstreams: { identity: identityUrl, core: coreUrl, chat: chatUrl, ai: aiUrl },
  });
});

const metrics = {
  httpRequests: 0,
  startedAt: Date.now(),
};
app.use((_req, _res, next) => {
  metrics.httpRequests += 1;
  next();
});

app.get("/metrics", (_req, res) => {
  const upSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
  res.type("text/plain").send(
    [
      "# HELP gateway_up 1 if process is up",
      "# TYPE gateway_up gauge",
      "gateway_up 1",
      "# HELP gateway_http_requests_total Total HTTP requests seen by gateway",
      "# TYPE gateway_http_requests_total counter",
      `gateway_http_requests_total ${metrics.httpRequests}`,
      "# HELP gateway_up_seconds Process uptime seconds",
      "# TYPE gateway_up_seconds gauge",
      `gateway_up_seconds ${upSeconds}`,
      "",
    ].join("\n"),
  );
});

app.use(createJwtGuard(jwtSecret));

function proxyError(err: Error, _req: express.Request, res: express.Response | import("node:net").Socket) {
  logger.error({ err }, "proxy error");
  if ("headersSent" in res && !res.headersSent && "status" in res) {
    (res as express.Response).status(502).json({ error: "BAD_GATEWAY", message: "Dịch vụ phía sau không phản hồi" });
  }
}

/** Proxy giữ nguyên full path (không mount Express strip prefix). */
function proxyTo(target: string, prefixes: string[]) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter: (pathname) =>
      prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
    on: { error: proxyError },
  });
}

app.use(proxyTo(identityUrl, ["/auth"]));
app.use(proxyTo(coreUrl, ["/organizations", "/invitations", "/groups"]));
app.use(proxyTo(chatUrl, ["/conversations", "/files", "/devices"]));
app.use(proxyTo(googleSyncUrl, ["/sync", "/google-chat", "/drive"]));
app.use(proxyTo(aiUrl, ["/ai"]));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (isAppError(err)) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof Error && err.message.startsWith("CORS")) {
    res.status(403).json({ error: "CORS", message: err.message });
    return;
  }
  logger.error({ err }, "unhandled");
  res.status(500).json({ error: "INTERNAL" });
});

app.use((_req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
});

app.listen(port, () => {
  logger.info({ port, identityUrl, coreUrl, chatUrl, aiUrl, corsOrigins }, "api-gateway listening");
});
