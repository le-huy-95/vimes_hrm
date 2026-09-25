/**
 * Tạo Express application (middleware + routes + error handler).
 *
 * Luồng request điển hình:
 *   Client → middleware (cors/json/cookie) → Router → Controller → Service → Repository → DB
 */
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env } from "./lib/env.js";
import { registerRoutes } from "./routes/index.js";
import { errorHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();

  // Bảo mật HTTP headers cơ bản
  app.use(helmet());
  // Cho phép frontend (WEB_ORIGIN) gọi API kèm cookie
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  // Health check — không cần auth
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Gắn toàn bộ router nghiệp vụ (/auth, /orgs, /teams)
  registerRoutes(app);

  // 404 cho route không tồn tại
  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // Bắt lỗi từ controller/service (AppError, ZodError, ...)
  app.use(errorHandler);
  return app;
}
