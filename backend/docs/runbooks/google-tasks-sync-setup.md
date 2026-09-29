# Bật Google Tasks sync thật

**Mục tiêu:** User đăng nhập Google → app có refresh token + scope Tasks → `google-sync-service` đẩy/kéo task thật.

## 1. Google Cloud Console

1. Tạo/chọn project → **APIs & Services → Enable APIs** → bật **Google Tasks API**.
2. **Credentials**:
   - **OAuth 2.0 Client ID — Web application** (dùng làm `GOOGLE_CLIENT_ID` / `GOOGLE_SERVER_CLIENT_ID` trên Flutter).
   - Thêm **Client secret** → `GOOGLE_CLIENT_SECRET` trên backend.
   - (Tuỳ nền) Android / iOS client riêng cho Sign-In; server vẫn dùng **Web client** để đổi `serverAuthCode`.
3. **OAuth consent screen**: thêm scope  
   `https://www.googleapis.com/auth/tasks`  
   (và openid/email/profile). Nếu app ở External + Testing: thêm test users.
4. Redirect URI (nếu dùng PKCE web): ví dụ `http://localhost:3000/auth/google/callback`.

## 2. Backend `.env`

```bash
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com   # Web client
GOOGLE_CLIENT_SECRET=yyyy
GOOGLE_TOKEN_ENCRYPTION_KEY=chuoi-dai-ngau-nhien-32+
GOOGLE_SYNC_URL=http://localhost:3207
```

Identity và google-sync phải dùng **cùng** `GOOGLE_TOKEN_ENCRYPTION_KEY` và cùng `GOOGLE_CLIENT_ID`/`SECRET`.

## 3. Flutter `.env`

```bash
GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com  # = Web client ID
GOOGLE_IOS_CLIENT_ID=...   # nếu iOS
```

## 4. Chạy service

```bash
# identity :3202, google-sync :3207, gateway :3200, core :3203
./scripts/dev-start.sh   # hoặc chạy từng service
```

## 5. Nghiệm thu

1. **Đăng xuất Google** trên thiết bị / thu hồi quyền app tại https://myaccount.google.com/permissions rồi login lại (xin lại consent Tasks).
2. Response login có `google.tasksSyncReady: true` (có refresh token).
3. Tạo task trong app → creator được auto-assign → sau ~10s debounce → Google Tasks list **"Manage Teams"** thấy task + notes `[app:<uuid>]`.
4. `GET /sync/status` (JWT) → `googleLinked: true`, job `DONE`.
5. Đánh dấu hoàn thành trên Google → tab **Sync → Pull** rồi mở lại Tasks → assignee app thành DONE.
6. Tạo task trên Google (My Tasks hoặc **Manage Teams**) → **Sync → Pull** để import vào group hiện tại (hoặc group OWNER).

## Lưu ý

- User cũ chỉ login bằng `idToken` (không có `serverAuthCode`) → **chưa có** refresh token Tasks; phải login lại sau khi cập nhật app.
- Thu hồi quyền Google → job/`google_task_links` → `AUTH_REQUIRED`; app vẫn chạy, sync dừng.
- **Không còn background/client polling** Google Tasks. Kéo Google chỉ khi: login (1 lần), push sau CRUD app, hoặc user bấm Pull/Full trên tab Sync.
- Import native: `GOOGLE_TASKS_IMPORT_NATIVE=false` để tắt. Task app luôn đẩy vào list `GOOGLE_TASKS_LIST_TITLE` (mặc định "Manage Teams").
- Nút Sync thủ công gửi `force: true` để bỏ cooldown.
