import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const CORRELATION_HEADER = "x-correlation-id";

export function correlationIdMiddleware(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header(CORRELATION_HEADER);
    const id = incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
    req.headers[CORRELATION_HEADER] = id;
    res.setHeader(CORRELATION_HEADER, id);
    next();
  };
}
