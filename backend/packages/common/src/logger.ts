import pino from "pino";

export function createLogger(name: string, level = process.env.LOG_LEVEL ?? "info") {
  return pino({
    name,
    level,
    base: { service: name },
  });
}

export type Logger = ReturnType<typeof createLogger>;
