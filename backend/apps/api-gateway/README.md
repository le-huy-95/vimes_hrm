# api-gateway

**Port:** `3200`  
**Mục đích:** Cổng HTTP duy nhất cho Flutter/web — CORS, JWT, rate-limit, proxy. Không chứa nghiệp vụ.

## Proxy

| Path | Upstream |
|------|----------|
| `/auth/*` | identity-service `:3202` |
| `/organizations`, `/invitations`, `/groups/*` | core-service `:3203` |
| `/conversations/*` | chat-service `:3204` |
| `/ai/*` | ai-service `:3205` |

## Cấu trúc

- `src/index.ts` — bootstrap Express + proxy
- `src/middlewares/` — JWT guard, correlation id
- `tests/` — unit test middleware
