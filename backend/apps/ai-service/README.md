# ai-service

**Port:** `3205`  
**Phase:** 6a deepen — read-only AI chat + entity links (Mock / Anthropic / OpenAI-compatible).

## Routes

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | — | |
| POST | `/ai/ping` | JWT | Smoke |
| POST | `/ai/chat` | JWT + rate limit | JSON answer + links |
| POST | `/ai/chat/stream` | JWT + rate limit | SSE: meta → token → links → done |
| GET | `/ai/admin/ops` | JWT + platform admin | 6d stub |
| POST | `/internal/ai/index-message` | internal token | 6c stub |
| POST | `/internal/ai/bot-ask` | internal token | 6e stub |

Gateway proxy: `/ai/*`.

## LLM providers

| Env | Meaning |
|-----|---------|
| `AI_PROVIDER` | `auto` (default) \| `mock` \| `anthropic` \| `openai` |
| `ANTHROPIC_API_KEY` | Claude |
| `AI_ANTHROPIC_MODEL` | default `claude-sonnet-4-20250514` |
| `OPENAI_API_KEY` | OpenAI / Codex-compatible |
| `OPENAI_BASE_URL` | default `https://api.openai.com/v1` |
| `AI_OPENAI_MODEL` | required when using openai |
| `AI_REQUIRE_LLM` | `true` → no silent mock fallback |

Codex key goes in `OPENAI_API_KEY` (+ optional `OPENAI_BASE_URL`), **not** `ANTHROPIC_API_KEY`.

## Limits

- `AI_MAX_TOOL_ROUNDS=8`
- `AI_CHAT_TIMEOUT_MS=30000`
- `AI_RATE_LIMIT_PER_MIN=10`
- `AI_TOKEN_BUDGET_PER_DAY=200000`

## Example

```bash
curl -s -X POST http://localhost:3205/ai/chat \
  -H "Authorization: Bearer $ACCESS_JWT" \
  -H 'content-type: application/json' \
  -d '{"message":"Việc nào của tôi đang mở? Cho link"}'
```

Without LLM keys, `provider` is `mock`. See [phase-6a-deepen runbook](../../docs/runbooks/phase-6a-deepen.md).
