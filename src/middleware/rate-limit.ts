import rateLimit from "express-rate-limit";

/** Phase 11/12: basic auth endpoint rate limit */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, try again later" },
});
