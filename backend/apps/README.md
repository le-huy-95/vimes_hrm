# Backend apps — tóm tắt nhanh

| Service | Port | Mục đích một dòng |
|---------|------|-------------------|
| [api-gateway](./api-gateway) | 3200 | Cổng HTTP: CORS, JWT, proxy — client chỉ gọi đây |
| [identity-service](./identity-service) | 3202 | Đăng ký, login, OTP, Google, token |
| [core-service](./core-service) | 3203 | Org, group, task, invite |
| [chat-service](./chat-service) | 3204 | Conversation, file (1.6), reaction/search (1.7), Socket.IO |
| [ai-service](./ai-service) | 3205 | AI 6a/6c/6d + bot stub |
| [worker-service](./worker-service) | 3206 | Email, DLQ stub, overdue digest |
| [google-sync-service](./google-sync-service) | 3207 | Tasks hai chiều (2/2.5) + Sheets/Chat stub |

Chi tiết: [../README.md](../README.md).
