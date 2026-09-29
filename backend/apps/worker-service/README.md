# worker-service

**Port:** `3206`  
**Mục đích:** Job nền — gửi email OTP / reset mật khẩu / mời org (không block HTTP API).

## Endpoints nội bộ

Gọi kèm header `x-internal-token`:

- `POST /internal/email/send`
- `POST /internal/email/otp-verify`
- `POST /internal/email/otp-reset`
- `POST /internal/email/org-invite`
- `GET /internal/email/sent` (dev inbox khi chưa cấu hình SMTP)

Identity/core dùng `WORKER_URL` (hoặc alias `MESSAGING_URL`).
