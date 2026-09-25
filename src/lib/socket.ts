import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { env } from "./env.js";
import { verifyAccessToken } from "./tokens.js";
import { redis } from "./redis.js";
import type { ChatService } from "../services/chat.service.js";

type SocketUser = { sub: string; orgId: string; email: string };

export async function createChatSocket(
  httpServer: HttpServer,
  chat: ChatService,
) {
  const io = new Server(httpServer, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    path: "/socket.io",
  });

  const pubClient = createClient({ url: env.REDIS_URL });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    try {
      const raw =
        (socket.handshake.auth?.token as string | undefined) ||
        (typeof socket.handshake.headers.authorization === "string"
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, "")
          : undefined);
      if (!raw) return next(new Error("Unauthorized"));
      const payload = verifyAccessToken(raw);
      (socket.data as { user: SocketUser }).user = payload;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket.data as { user: SocketUser }).user;
    void redis.set(`user:online:${user.sub}`, "1", "EX", 30);

    const heartbeat = setInterval(() => {
      void redis.set(`user:online:${user.sub}`, "1", "EX", 30);
    }, 25_000);

    socket.on("join_channel", async (payload: { channelId?: string }, ack?) => {
      try {
        const channelId = String(payload?.channelId ?? "");
        await chat.authorizeChannelAccess(channelId, user.sub, user.orgId);
        await socket.join(`channel:${channelId}`);
        if (typeof ack === "function") ack({ ok: true });
      } catch (err) {
        if (typeof ack === "function") {
          ack({ ok: false, error: err instanceof Error ? err.message : "error" });
        }
      }
    });

    socket.on(
      "send_message",
      async (
        payload: {
          channelId?: string;
          content?: string;
          attachmentFileId?: string;
          replyToId?: string;
        },
        ack?,
      ) => {
        try {
          const channelId = String(payload?.channelId ?? "");
          const channel = await chat.authorizeChannelAccess(
            channelId,
            user.sub,
            user.orgId,
          );
          const message = await chat.createMessage({
            teamId: channel.teamId,
            channelId,
            userId: user.sub,
            orgId: user.orgId,
            content: String(payload?.content ?? ""),
            attachmentFileId: payload?.attachmentFileId,
            replyToId: payload?.replyToId,
          });
          io.to(`channel:${channelId}`).emit("new_message", message);
          if (typeof ack === "function") ack({ ok: true, message });
        } catch (err) {
          if (typeof ack === "function") {
            ack({
              ok: false,
              error: err instanceof Error ? err.message : "error",
            });
          }
        }
      },
    );

    socket.on("typing", (payload: { channelId?: string }) => {
      const channelId = String(payload?.channelId ?? "");
      if (!channelId) return;
      socket.to(`channel:${channelId}`).emit("typing", {
        channelId,
        userId: user.sub,
        email: user.email,
      });
    });

    socket.on(
      "mark_read",
      async (payload: { channelId?: string; messageId?: string }, ack?) => {
        try {
          const channelId = String(payload?.channelId ?? "");
          const messageId = String(payload?.messageId ?? "");
          await chat.markRead(channelId, messageId, user.sub, user.orgId);
          if (typeof ack === "function") ack({ ok: true });
        } catch (err) {
          if (typeof ack === "function") {
            ack({
              ok: false,
              error: err instanceof Error ? err.message : "error",
            });
          }
        }
      },
    );

    socket.on("disconnect", () => {
      clearInterval(heartbeat);
    });
  });

  return io;
}
