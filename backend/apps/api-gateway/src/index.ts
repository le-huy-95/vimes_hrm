import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import { AppError, buildHealth, createLogger, isAppError } from "@manage-teams/common";
import { correlationIdMiddleware, CORRELATION_HEADER } from "./correlation.js";
import { createJwtGuard } from "./auth-guard.js";

const serviceName = "api-gateway";
const logger = createLogger(serviceName);
const port = Number(process.env.PORT ?? 3200);
const identityUrl = process.env.IDENTITY_URL ?? "http://localhost:3202";
const coreUrl = process.env.CORE_URL ?? "http://localhost:3203";
const jwtSecret = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";
const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:8080")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || corsOrigins.includes(origin) || corsOrigins.includes("*")) {
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
  message: { error: "RATE_LIMIT", message: "Quá nhiều yêu cầu auth. Thử lại sau." },
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
    upstreams: { identity: identityUrl, core: coreUrl },
  });
});

app.use(createJwtGuard(jwtSecret));

function proxyError(err: Error, _req: express.Request, res: express.Response | import("node:net").Socket) {
  logger.error({ err }, "proxy error");
  if ("headersSent" in res && !res.headersSent && "status" in res) {
    (res as express.Response).status(502).json({ error: "BAD_GATEWAY", message: "Upstream không phản hồi" });
  }
}

app.use(
  "/auth",
  createProxyMiddleware({
    target: identityUrl,
    changeOrigin: true,
    on: { error: proxyError },
  }),
);

app.use(
  "/organizations",
  createProxyMiddleware({
    target: coreUrl,
    changeOrigin: true,
    on: { error: proxyError },
  }),
);

app.use(
  "/invitations",
  createProxyMiddleware({
    target: coreUrl,
    changeOrigin: true,
    on: { error: proxyError },
  }),
);

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
  logger.info({ port, identityUrl, coreUrl, corsOrigins }, "api-gateway listening");
});
