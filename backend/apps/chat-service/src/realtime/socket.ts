import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import {
  createLogger,
  getJwtSecret,
  isCorsOriginAllowed,
  parseCorsOrigins,
  verifyAccessToken,
} from "@manage-teams/lib";
import { presenceKey } from "@manage-teams/cache-keys";
import { assertActiveMember } from "../modules/conversation/conversation.service.js";
import { getRedis } from "../infra/redis.js";

const logger = createLogger("chat-service");
const jwtSecret = getJwtSecret();
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:16379";
const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

/** Tạo Socket.IO server: JWT handshake, join room, typing, refresh token. */
export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        cb(null, isCorsOriginAllowed(origin, corsOrigins));
      },
      credentials: true,
    },
    path: "/socket.io",
  });

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers.authorization?.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);
      if (!token) {
        next(new Error("Chưa xác thực"));
        return;
      }
      const payload = await verifyAccessToken(token, jwtSecret);
      socket.data.userId = String(payload.sub);
      next();
    } catch {
      next(new Error("Chưa xác thực"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    logger.info({ userId, sid: socket.id }, "socket connected");
    void socket.join(`user:${userId}`);
    void setPresence(userId, true);

    /** Client gửi JWT mới khi access token sắp hết hạn. */
    socket.on("auth:refresh", async (data: { token?: string }, ack?: (r: unknown) => void) => {
      try {
        if (!data?.token) throw new Error("Cần token");
        const payload = await verifyAccessToken(data.token, jwtSecret);
        socket.data.userId = String(payload.sub);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: "UNAUTHORIZED" });
        socket.disconnect(true);
      }
    });

    socket.on("join", async (data: { conversationId?: string }, ack?: (r: unknown) => void) => {
      try {
        const conversationId = data?.conversationId;
        if (!conversationId) throw new Error("Cần conversationId");
        await assertActiveMember(conversationId, socket.data.userId as string);
        await socket.join(`conv:${conversationId}`);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: String(err) });
      }
    });

    socket.on("leave", async (data: { conversationId?: string }, ack?: (r: unknown) => void) => {
      if (data?.conversationId) {
        await socket.leave(`conv:${data.conversationId}`);
      }
      ack?.({ ok: true });
    });

    socket.on("typing", (data: { conversationId?: string }) => {
      if (!data?.conversationId) return;
      socket.to(`conv:${data.conversationId}`).emit("typing", {
        conversationId: data.conversationId,
        userId: socket.data.userId,
      });
    });

    socket.on("disconnect", () => {
      void setPresence(userId, false);
      logger.info({ userId, sid: socket.id }, "socket disconnected");
    });
  });

  return io;
}

async function setPresence(userId: string, online: boolean): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  const key = presenceKey(userId);
  if (online) {
    await redis.set(key, "1", { EX: 120 });
  } else {
    await redis.del(key);
  }
}

/** Gắn Redis adapter cho multi-node fan-out. */
export async function setupRedisAdapter(io: Server): Promise<void> {
  try {
    const pub = createClient({ url: redisUrl });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    logger.info({ redisUrl }, "socket.io redis adapter ready");
  } catch (err) {
    logger.warn({ err }, "redis adapter unavailable; using in-memory adapter");
  }
}
