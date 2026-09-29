import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
});

export type AppEnv = z.infer<typeof envSchema> & Record<string, string | undefined>;

/** Đọc và validate biến môi trường tối thiểu (NODE_ENV, LOG_LEVEL). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Biến môi trường không hợp lệ: ${parsed.error.message}`);
  }
  return { ...source, ...parsed.data };
}
