import { jwtVerify, type JWTPayload } from "jose";
import { AppError } from "./errors.js";

/** User đã xác thực sau khi đọc JWT. */
export type AuthUser = { id: string; email: string };

/** Đối tượng có thể đọc header (Express req hoặc mock trong test). */
export type HeaderCarrier = {
  header(name: string): string | undefined;
};

const encoder = new TextEncoder();

/** Lấy khóa HMAC JWT từ env (hoặc secret truyền vào). */
export function getJwtSecret(envSecret = process.env.JWT_SECRET): Uint8Array {
  return encoder.encode(envSecret ?? "dev-jwt-secret-change-me");
}

/** Xác minh access token JWT và trả về payload. */
export async function verifyAccessToken(
  token: string,
  secret: Uint8Array = getJwtSecret(),
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload;
}

/**
 * Đọc `Authorization: Bearer …`, verify JWT, trả `{ id, email }`.
 * Ném AppError 401 nếu thiếu/sai token.
 */
export async function requireUser(
  req: HeaderCarrier,
  secret: Uint8Array = getJwtSecret(),
): Promise<AuthUser> {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AppError("Chưa xác thực", "UNAUTHORIZED", 401);
  }
  try {
    const payload = await verifyAccessToken(header.slice(7), secret);
    const id = String(payload.sub ?? "");
    const email = String(payload.email ?? "").toLowerCase();
    if (!id) throw new AppError("Chưa xác thực", "UNAUTHORIZED", 401);
    return { id, email };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("Chưa xác thực", "UNAUTHORIZED", 401);
  }
}
