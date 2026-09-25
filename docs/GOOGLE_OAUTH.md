# Cấu hình Google OAuth (login)

App đã có sẵn flow: `GET /auth/google` → Google → `GET /auth/google/callback` → redirect web `/oauth/callback`.

## Mapping biến môi trường

| Biến bạn có | Dùng cho |
|-------------|----------|
| `GOOGLE_SERVER_CLIENT_ID` | **Web login** (Express) — client_id khi authorize + đổi code |
| `GOOGLE_CLIENT_SECRET` | **Bắt buộc** cho web — secret của **cùng** Web/Server client |
| `GOOGLE_IOS_CLIENT_ID` | App iOS native (chưa dùng trên web) |
| `GOOGLE_IOS_URL_SCHEME` | Deep link iOS (chưa dùng trên web) |
| `GOOGLE_CALLBACK_URL` | Redirect URI đăng ký trên Google Cloud |

Login web chỉ bật khi có **SERVER_CLIENT_ID + CLIENT_SECRET**.

## Ví dụ `.env` (đã map ID bạn cung cấp)

```env
GOOGLE_SERVER_CLIENT_ID=675490779243-82deesh10bvsnec1ltk25kfa9n0l4p1k.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx   # ← còn thiếu: lấy từ Console
GOOGLE_CALLBACK_URL=http://localhost:3002/auth/google/callback

GOOGLE_IOS_CLIENT_ID=675490779243-bg50irvmfoaci5htffl1i4578tlq0387.apps.googleusercontent.com
GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.675490779243-bg50irvmfoaci5htffl1i4578tlq0387
```

**Không** gửi Client Secret vào chat — chỉ dán vào `.env` rồi restart API.

## Còn thiếu gì?

1. Mở [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Mở OAuth client **Web application** khớp ID  
   `675490779243-82deesh10bvsnec1ltk25kfa9n0l4p1k...`
3. Copy **Client secret** → `GOOGLE_CLIENT_SECRET` trong `.env`
4. Trong client đó, thêm:
   - **Authorized JavaScript origins:** `http://localhost:5173`, `http://localhost:3002`
   - **Authorized redirect URIs:** `http://localhost:3002/auth/google/callback`
5. Restart API

Nếu client `82deesh...` không phải loại **Web application** (hoặc không có secret), tạo client Web mới và thay `GOOGLE_SERVER_CLIENT_ID`.

## Kiểm tra

```bash
curl -s http://localhost:3002/auth/providers
# Khi đủ secret:
# {"google":true,"googleLoginUrl":"/auth/google","configured":{"serverClientId":true,"clientSecret":true,"iosClientId":true}}
```

## Lưu ý

- Redirect URI phải trùng `GOOGLE_CALLBACK_URL` (kể cả port `3002`).
- Email Google trùng email local → tự link tài khoản.
- iOS Client ID / URL scheme chỉ dùng khi làm app mobile; **không** thay thế được secret cho login web.
