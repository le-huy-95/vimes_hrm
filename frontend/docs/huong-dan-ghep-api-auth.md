# Hướng dẫn ghép API Auth (Login / Register / Logout / Forgot Password) vào Flutter

Tài liệu này mô tả **đúng theo backend hiện tại** (api-gateway + identity-service), kèm kiểu dữ liệu request/response và cách map sang Flutter.

**Base URL client phải gọi:** `API_DEV_URL` / `API_PROD_URL` → **api-gateway** (mặc định `http://localhost:3200`), **không** gọi thẳng identity-service `:3202`.

**Content-Type:** `application/json`  
**Không dùng cookie** — chỉ Bearer JWT trong header.

---

## Mục lục

1. [Kiến trúc & cấu hình](#1-kiến-trúc--cấu-hình)
2. [Token & header](#2-token--header)
3. [Định dạng lỗi chung](#3-định-dạng-lỗi-chung)
4. [Luồng nghiệp vụ (flowchart)](#4-luồng-nghiệp-vụ)
5. [API chi tiết](#5-api-chi-tiết)
6. [Model Dart gợi ý](#6-model-dart-gợi-ý)
7. [Ví dụ Dio / repository](#7-ví-dụ-dio--repository)
8. [Bảng mã lỗi thường gặp](#8-bảng-mã-lỗi-thường-gặp)
9. [Checklist ghép Flutter](#9-checklist-ghép-flutter)

---

## 1. Kiến trúc & cấu hình

| Thành phần | Port | Vai trò |
|---|---|---|
| **api-gateway** | `3200` | CORS, rate-limit `/auth`, JWT guard, proxy |
| **identity-service** | `3202` | Nghiệp vụ register / OTP / login / reset |

### Biến môi trường Flutter (`frontend/.env`)

```env
APP_ENV=dev
API_DEV_URL=http://localhost:3200
API_PROD_URL=http://localhost:3200
```

- Máy ảo Android emulator: dùng `http://10.0.2.2:3200` thay cho `localhost`.
- iOS Simulator: `http://localhost:3200` thường OK.
- Thiết bị thật: dùng IP LAN của máy chạy gateway (ví dụ `http://192.168.1.10:3200`).

Code đọc URL: `EnvConfig.baseUrl` trong `lib/core/constants/env_config.dart`.

### Rate limit

Gateway giới hạn `/auth/*` (mặc định ~30 request/phút). Quá giới hạn → `429 RATE_LIMIT`.

---

## 2. Token & header

### Access token (JWT)

| Thuộc tính | Giá trị |
|---|---|
| Header | `Authorization: Bearer <accessToken>` |
| Thời hạn | **900 giây (15 phút)** — field `expiresIn` |
| Claims chính | `sub` (userId), `email`, `tv` (tokenVersion), `iat`, `exp` |

### Refresh token

- Chuỗi opaque, TTL **30 ngày**, lưu hash trên DB.
- Backend **chưa có** endpoint `/auth/refresh`.
- Flutter vẫn nên lưu `refreshToken` (đã có trong `TokenStore`) để dùng sau này.

### Endpoint nào cần Bearer?

| Path | Cần đăng nhập? |
|---|---|
| `/auth/register`, `/auth/login`, `/auth/verify-email`, `/auth/resend-otp` | Không |
| `/auth/forgot-password`, `/auth/reset-password` | Không |
| `/auth/google/id-token`, `/auth/google/authorize-url`, `/auth/google/callback` | Không |
| `/auth/me` | **Có** |
| `/auth/google/link` | **Có** |

### Logout

**Không có API logout trên backend.**  
Logout = xóa token local (`FlutterSecureStorage` / `TokenStore.clear()`).

---

## 3. Định dạng lỗi chung

Mọi lỗi nghiệp vụ / validation thường trả:

```json
{
  "error": "MÃ_LỖI_STRING",
  "message": "Thông báo tiếng Việt (tuỳ endpoint)",
  "details": "tuỳ chọn — thường là Zod details khi VALIDATION"
}
```

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `error` | `string` | Mã máy đọc được (`INVALID_CREDENTIALS`, `EMAIL_TAKEN`, …) |
| `message` | `string?` | Hiển thị cho user |
| `details` | `any?` | Chi tiết validation |

Flutter hiện map qua `mapDioError` → `ApiException(message, code: error, statusCode: ...)`.

---

## 4. Luồng nghiệp vụ

### 4.1 Đăng ký → xác minh email → đăng nhập

```
[Màn Register]
   │  POST /auth/register
   ▼
[Nhập OTP từ email]
   │  POST /auth/verify-email
   │  (tuỳ chọn) POST /auth/resend-otp
   ▼
[Màn Login]
   │  POST /auth/login
   ▼
Lưu accessToken + refreshToken → vào app
```

**Lưu ý:** Register **không** trả token. User phải verify email rồi mới login được. Nếu login khi chưa verify → `403 EMAIL_NOT_VERIFIED`.

### 4.2 Quên mật khẩu

```
[Nhập email]
   │  POST /auth/forgot-password   ← luôn 200, message chung (không lộ email có/không)
   ▼
[Nhập OTP + mật khẩu mới]
   │  POST /auth/reset-password
   ▼
[Login lại]
```

Sau reset: `tokenVersion` tăng, mọi refresh token cũ bị revoke → access JWT cũ cũng coi như hết hiệu lực khi gọi `/auth/me`.

### 4.3 Logout

```
[Nút Logout]
   │  TokenStore.clear()   ← chỉ local, không gọi API
   ▼
Về màn Login
```

### 4.4 Khôi phục session khi mở app

```
Đọc accessToken từ Secure Storage
   │ null → unauthenticated
   ▼
GET /auth/me  (Bearer)
   │ 200 → authenticated
   │ 401 → clear token → unauthenticated
```

---

## 5. API chi tiết

Tất cả path dưới đây: `{BASE_URL}/auth/...`

---

### 5.1 Đăng ký — `POST /auth/register`

**Auth:** Public  
**Status thành công:** `201 Created`

#### Request body

| Field | Kiểu Dart | Bắt buộc | Rule |
|---|---|---|---|
| `email` | `String` | Có | Email hợp lệ |
| `password` | `String` | Có | Tối thiểu **8** ký tự |
| `displayName` | `String?` | Không | Nếu gửi: tối thiểu 1 ký tự |

```json
{
  "email": "user@example.com",
  "password": "secret123",
  "displayName": "Nguyen Van A"
}
```

#### Response thành công `201`

| Field | Kiểu | Mô tả |
|---|---|---|
| `userId` | `String` (UUID) | ID user mới |
| `email` | `String` | Email đã **lowercase** |
| `message` | `String` | `"Đăng ký thành công. Kiểm tra email để lấy mã xác minh Vimes."` |

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "message": "Đăng ký thành công. Kiểm tra email để lấy mã xác minh Vimes."
}
```

#### Lỗi thường gặp

| HTTP | `error` | Ý nghĩa |
|---|---|---|
| `400` | `VALIDATION` | Body sai (email/password) |
| `409` | `EMAIL_TAKEN` | Email đã tồn tại — `message`: `"Email đã được sử dụng"` |
| `503` | `EMAIL_SEND_FAILED` | Tạo user rồi nhưng gửi OTP thất bại |
| `429` | `RATE_LIMIT` | Quá nhiều request |

#### Việc làm phía Flutter sau khi thành công

1. Giữ `email` (và có thể `userId`) trong state / route args.
2. Navigate sang màn **Verify OTP**.
3. **Không** lưu token (chưa có).

---

### 5.2 Xác minh email (OTP) — `POST /auth/verify-email`

**Auth:** Public  
**Status thành công:** `200`

OTP verify email: **6 chữ số**, hết hạn theo `OTP_EXPIRES_MINUTES` (mặc định 10 phút). Schema chỉ yêu cầu `code` min 4 ký tự.

#### Request body

| Field | Kiểu | Bắt buộc | Rule |
|---|---|---|---|
| `email` | `String` | Có | Email hợp lệ |
| `code` | `String` | Có | Min 4 (thực tế OTP 6 số) |

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

#### Response thành công `200`

| Field | Kiểu | Mô tả |
|---|---|---|
| `ok` | `bool` | Luôn `true` |
| `message` | `String` | `"Email đã được xác minh trên Vimes."` |

```json
{
  "ok": true,
  "message": "Email đã được xác minh trên Vimes."
}
```

#### Lỗi thường gặp

| HTTP | `error` | Ý nghĩa |
|---|---|---|
| `400` | `INVALID_OTP` | Sai / hết hạn OTP |
| `400` | `VALIDATION` | Body sai |
| `429` | `OTP_LOCKED` | Sai ≥ 5 lần → bị khóa tạm |

#### Việc làm phía Flutter

Sau `ok: true` → chuyển sang **Login** (hoặc tự gọi login nếu muốn UX liền mạch).

---

### 5.3 Gửi lại OTP xác minh email — `POST /auth/resend-otp`

**Auth:** Public  
**Status thành công:** `200`

Dùng khi user chưa nhận được mail sau register. Chỉ gửi lại OTP purpose `verify_email`.

#### Request body

| Field | Kiểu | Bắt buộc |
|---|---|---|
| `email` | `String` | Có |

```json
{ "email": "user@example.com" }
```

#### Response thành công `200`

| Field | Kiểu | Mô tả |
|---|---|---|
| `message` | `String` | `"Nếu email tồn tại, mã xác minh đã được gửi."` |

**Luôn** trả message chung (không tiết lộ email có trong hệ thống hay không).

> Flutter hiện **chưa** gọi endpoint này trên UI “Gửi lại” — nên nối vào nếu cần.

---

### 5.4 Đăng nhập — `POST /auth/login`

**Auth:** Public  
**Status thành công:** `200`

#### Request body

| Field | Kiểu | Bắt buộc | Rule |
|---|---|---|---|
| `email` | `String` | Có | Email hợp lệ |
| `password` | `String` | Có | Min 1 ký tự |

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

#### Response thành công `200`

| Field | Kiểu | Mô tả |
|---|---|---|
| `user` | `Object` | Thông tin tối thiểu |
| `user.id` | `String` (UUID) | User ID |
| `user.email` | `String` | Email |
| `accessToken` | `String` | JWT — gửi kèm mọi API protected |
| `refreshToken` | `String` | Opaque refresh |
| `expiresIn` | `int` | `900` (giây) |

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6...",
  "expiresIn": 900
}
```

#### Lỗi thường gặp

| HTTP | `error` | `message` (ví dụ) |
|---|---|---|
| `401` | `INVALID_CREDENTIALS` | `"Email hoặc mật khẩu không đúng"` |
| `403` | `EMAIL_NOT_VERIFIED` | `"Email chưa xác minh"` → đẩy user sang màn OTP |
| `400` | `VALIDATION` | Body sai |

#### Việc làm phía Flutter

```dart
await tokenStore.saveTokens(
  accessToken: data['accessToken'] as String,
  refreshToken: data['refreshToken'] as String,
);
// ApiClient interceptor sẽ tự gắn Authorization: Bearer ...
```

---

### 5.5 Quên mật khẩu — `POST /auth/forgot-password`

**Auth:** Public  
**Status thành công:** `200` (kể cả email không tồn tại / gửi mail lỗi)

#### Request body

| Field | Kiểu | Bắt buộc |
|---|---|---|
| `email` | `String` | Có |

```json
{ "email": "user@example.com" }
```

#### Response thành công `200`

| Field | Kiểu | Mô tả |
|---|---|---|
| `message` | `String` | Message chung kiểu: *"Nếu email tồn tại trong hệ thống, mã OTP đã được gửi..."* |

```json
{
  "message": "Nếu email tồn tại trong hệ thống, mã OTP đã được gửi đến hộp thư của bạn."
}
```

**Bảo mật:** UI luôn chuyển sang màn nhập OTP + mật khẩu mới; không báo “email không tồn tại”.

Nếu email tồn tại: server tạo OTP purpose `reset_password` và gửi mail.

---

### 5.6 Đặt lại mật khẩu — `POST /auth/reset-password`

**Auth:** Public  
**Status thành công:** `200`

#### Request body

| Field | Kiểu | Bắt buộc | Rule |
|---|---|---|---|
| `email` | `String` | Có | Email hợp lệ |
| `code` | `String` | Có | OTP (min 4, thực tế 6 số) |
| `newPassword` | `String` | Có | Min **8** ký tự |

```json
{
  "email": "user@example.com",
  "code": "654321",
  "newPassword": "newSecret99"
}
```

#### Response thành công `200`

| Field | Kiểu | Mô tả |
|---|---|---|
| `ok` | `bool` | `true` |
| `message` | `String` | `"Mật khẩu Vimes đã được cập nhật."` |

```json
{
  "ok": true,
  "message": "Mật khẩu Vimes đã được cập nhật."
}
```

#### Side effect server

- `tokenVersion` của user **+1**
- Mọi refresh token chưa revoke → bị revoke
- Access JWT cũ sẽ fail khi gọi `/auth/me` nếu `tv` không khớp (`TOKEN_REVOKED`)

#### Lỗi thường gặp

| HTTP | `error` |
|---|---|
| `400` | `INVALID_OTP` / `VALIDATION` |
| `429` | `OTP_LOCKED` |

#### Việc làm phía Flutter

Navigate về Login; nếu đang có token cũ → `clear()` luôn cho sạch.

---

### 5.7 Logout (client-only)

**Không có** `POST /auth/logout`.

```dart
Future<void> logout() => _api.tokenStore.clear();
```

Sau khi clear: mọi request sau sẽ không còn header Bearer (trừ khi user login lại).

---

### 5.8 Lấy profile / kiểm tra session — `GET /auth/me`

**Auth:** Bearer bắt buộc  
**Status thành công:** `200`

#### Request

- Header: `Authorization: Bearer <accessToken>`
- Không có body

#### Response thành công `200`

| Field | Kiểu | Mô tả |
|---|---|---|
| `user.id` | `String` | UUID |
| `user.email` | `String` | Email |
| `user.display_name` | `String?` | Có thể `null` |
| `user.email_verified_at` | `String?` (ISO Date) hoặc `null` | Thời điểm verify |
| `user.token_version` | `int` | Version token |
| `googleAccounts` | `List` | Tài khoản Google đã link |
| `googleAccounts[].google_sub` | `String` | Google subject |
| `googleAccounts[].account_type` | `String` | `"personal"` \| `"workspace"` |
| `googleAccounts[].is_primary` | `bool` | Primary? |
| `googleAccounts[].linked_at` | `String` (ISO Date) | Thời điểm link |

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "display_name": "Nguyen Van A",
    "email_verified_at": "2026-09-28T05:00:00.000Z",
    "token_version": 1
  },
  "googleAccounts": [
    {
      "google_sub": "118234567890",
      "account_type": "personal",
      "is_primary": true,
      "linked_at": "2026-09-28T05:01:00.000Z"
    }
  ]
}
```

> Lưu ý naming: login trả `user.id` / `user.email` (camelCase), còn `/auth/me` dùng **snake_case** cho `display_name`, `email_verified_at`, `token_version`, và các field trong `googleAccounts`.

#### Lỗi

| HTTP | `error` |
|---|---|
| `401` | `UNAUTHORIZED` — thiếu/sai token |
| `401` | `TOKEN_REVOKED` — `tv` JWT ≠ `tokenVersion` DB (sau reset password) |

---

### 5.9 (Phụ) Đăng nhập Google — `POST /auth/google/id-token`

Flutter mobile đang dùng flow này (không bắt buộc cho email/password, nhưng hay đi kèm).

#### Request

| Field | Kiểu | Bắt buộc |
|---|---|---|
| `idToken` | `String` | Có (min 20) |
| `serverAuthCode` | `String?` | Không — để sync Google Tasks |

#### Response `200` (tóm tắt)

| Field | Kiểu |
|---|---|
| `user.id` / `user.email` | `String` |
| `google.sub` | `String` |
| `google.accountType` | `"workspace"` \| `"personal"` |
| `google.email` | `String` |
| `google.tasksSyncReady` | `bool` |
| `created` | `bool` — user mới tạo hay không |
| `accessToken` / `refreshToken` | `String` |
| `expiresIn` | `int` (`900`) |

---

## 6. Model Dart gợi ý

```dart
// --- Register ---
class RegisterRequest {
  const RegisterRequest({
    required this.email,
    required this.password,
    this.displayName,
  });
  final String email;
  final String password;
  final String? displayName;

  Map<String, dynamic> toJson() => {
        'email': email,
        'password': password,
        if (displayName != null) 'displayName': displayName,
      };
}

class RegisterResponse {
  const RegisterResponse({
    required this.userId,
    required this.email,
    required this.message,
  });
  final String userId;
  final String email;
  final String message;

  factory RegisterResponse.fromJson(Map<String, dynamic> json) =>
      RegisterResponse(
        userId: json['userId'] as String,
        email: json['email'] as String,
        message: json['message'] as String,
      );
}

// --- Login ---
class LoginResponse {
  const LoginResponse({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
  });
  final AuthUser user;
  final String accessToken;
  final String refreshToken;
  final int expiresIn;

  factory LoginResponse.fromJson(Map<String, dynamic> json) => LoginResponse(
        user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        expiresIn: json['expiresIn'] as int,
      );
}

class AuthUser {
  const AuthUser({required this.id, required this.email});
  final String id;
  final String email;

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        email: json['email'] as String,
      );
}

// --- Message-only (forgot / resend) ---
class MessageResponse {
  const MessageResponse({required this.message});
  final String message;
  factory MessageResponse.fromJson(Map<String, dynamic> json) =>
      MessageResponse(message: json['message'] as String);
}

// --- Ok + message (verify / reset) ---
class OkMessageResponse {
  const OkMessageResponse({required this.ok, required this.message});
  final bool ok;
  final String message;
  factory OkMessageResponse.fromJson(Map<String, dynamic> json) =>
      OkMessageResponse(
        ok: json['ok'] as bool,
        message: json['message'] as String,
      );
}

// --- /auth/me ---
class MeResponse {
  const MeResponse({required this.user, required this.googleAccounts});
  final MeUser user;
  final List<GoogleAccountBrief> googleAccounts;

  factory MeResponse.fromJson(Map<String, dynamic> json) => MeResponse(
        user: MeUser.fromJson(json['user'] as Map<String, dynamic>),
        googleAccounts: (json['googleAccounts'] as List? ?? [])
            .map((e) => GoogleAccountBrief.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class MeUser {
  const MeUser({
    required this.id,
    required this.email,
    this.displayName,
    this.emailVerifiedAt,
    required this.tokenVersion,
  });
  final String id;
  final String email;
  final String? displayName;
  final DateTime? emailVerifiedAt;
  final int tokenVersion;

  factory MeUser.fromJson(Map<String, dynamic> json) => MeUser(
        id: json['id'] as String,
        email: json['email'] as String,
        displayName: json['display_name'] as String?,
        emailVerifiedAt: json['email_verified_at'] != null
            ? DateTime.parse(json['email_verified_at'] as String)
            : null,
        tokenVersion: json['token_version'] as int,
      );
}

class GoogleAccountBrief {
  const GoogleAccountBrief({
    required this.googleSub,
    required this.accountType,
    required this.isPrimary,
    required this.linkedAt,
  });
  final String googleSub;
  final String accountType;
  final bool isPrimary;
  final DateTime linkedAt;

  factory GoogleAccountBrief.fromJson(Map<String, dynamic> json) =>
      GoogleAccountBrief(
        googleSub: json['google_sub'] as String,
        accountType: json['account_type'] as String,
        isPrimary: json['is_primary'] as bool,
        linkedAt: DateTime.parse(json['linked_at'] as String),
      );
}

// --- Error ---
class ApiErrorBody {
  const ApiErrorBody({required this.error, this.message, this.details});
  final String error;
  final String? message;
  final dynamic details;

  factory ApiErrorBody.fromJson(Map<String, dynamic> json) => ApiErrorBody(
        error: json['error'] as String,
        message: json['message'] as String?,
        details: json['details'],
      );
}
```

---

## 7. Ví dụ Dio / repository

Repo hiện có sẵn: `frontend/lib/features/auth/data/auth_repository.dart`.

### Register

```dart
final res = await dio.post<Map<String, dynamic>>(
  '/auth/register',
  data: {
    'email': email,
    'password': password,
    if (displayName != null) 'displayName': displayName,
  },
);
// statusCode == 201
final body = RegisterResponse.fromJson(res.data!);
```

### Verify email

```dart
await dio.post('/auth/verify-email', data: {
  'email': email,
  'code': code,
});
```

### Login + lưu token

```dart
final res = await dio.post<Map<String, dynamic>>(
  '/auth/login',
  data: {'email': email, 'password': password},
);
final data = res.data!;
await tokenStore.saveTokens(
  accessToken: data['accessToken'] as String,
  refreshToken: data['refreshToken'] as String,
);
```

### Forgot → Reset

```dart
await dio.post('/auth/forgot-password', data: {'email': email});

await dio.post('/auth/reset-password', data: {
  'email': email,
  'code': otp,
  'newPassword': newPassword,
});
```

### Logout

```dart
await tokenStore.clear();
```

### Xử lý lỗi UI gợi ý

| `code` (`error`) | Hành vi UI |
|---|---|
| `INVALID_CREDENTIALS` | Snackbar sai email/password |
| `EMAIL_NOT_VERIFIED` | Điều hướng Verify OTP + truyền email |
| `EMAIL_TAKEN` | Báo email đã dùng trên form register |
| `INVALID_OTP` | Báo OTP sai / hết hạn |
| `OTP_LOCKED` | Disable nút, countdown / hướng dẫn đợi |
| `EMAIL_SEND_FAILED` | Báo không gửi được mail, thử lại sau |
| `RATE_LIMIT` | “Thử lại sau ít phút” |
| `VALIDATION` | Highlight field theo `details` nếu có |

---

## 8. Bảng mã lỗi thường gặp

| HTTP | `error` | Endpoint liên quan |
|---|---|---|
| 400 | `VALIDATION` | Mọi POST có Zod |
| 400 | `INVALID_OTP` | verify-email, reset-password |
| 401 | `INVALID_CREDENTIALS` | login |
| 401 | `UNAUTHORIZED` | me |
| 401 | `TOKEN_REVOKED` | me (sau reset password) |
| 403 | `EMAIL_NOT_VERIFIED` | login |
| 409 | `EMAIL_TAKEN` | register |
| 429 | `OTP_LOCKED` | verify / reset |
| 429 | `RATE_LIMIT` | gateway |
| 502 | `BAD_GATEWAY` | gateway upstream chết |
| 503 | `EMAIL_SEND_FAILED` | register |
| 503 | `GOOGLE_NOT_CONFIGURED` | Google flows |

---

## 9. Checklist ghép Flutter

- [ ] `.env`: `API_DEV_URL` trỏ đúng gateway (`:3200`)
- [ ] Dio `baseUrl` = `EnvConfig.baseUrl`, header `content-type: application/json`
- [ ] Interceptor gắn `Authorization: Bearer` từ Secure Storage
- [ ] **Register** → giữ email → **Verify OTP** → **Login**
- [ ] Login thành công → lưu `accessToken` + `refreshToken`
- [ ] `EMAIL_NOT_VERIFIED` → đẩy sang verify OTP (có thể gọi `resend-otp`)
- [ ] Forgot → luôn sang màn OTP+password mới (không check email tồn tại)
- [ ] Reset xong → clear token cũ → Login
- [ ] Logout → chỉ `TokenStore.clear()`
- [ ] Bootstrap app → `GET /auth/me`; fail → clear + unauthenticated
- [ ] Map `error` + `message` ra UI tiếng Việt
- [ ] (Tuỳ chọn) Nối `POST /auth/resend-otp` cho nút “Gửi lại mã”

---

## Tham chiếu source of truth

| File | Nội dung |
|---|---|
| `backend/apps/identity-service/src/modules/auth/auth.routes.ts` | Route register/OTP/reset/me |
| `backend/apps/identity-service/src/modules/auth/auth.schemas.ts` | Zod request |
| `backend/apps/identity-service/src/modules/auth/auth.service.ts` | Response body thật |
| `backend/apps/identity-service/src/modules/login/login.routes.ts` | Login + Google |
| `backend/apps/identity-service/src/modules/login/login.service.ts` | Login response |
| `backend/apps/identity-service/src/modules/auth/token.service.ts` | `expiresIn: 900` |
| `frontend/lib/features/auth/data/auth_repository.dart` | Implementation Flutter hiện tại |
| `frontend/lib/core/network/api_client.dart` | Dio + TokenStore + mapDioError |

---

*Tài liệu phản ánh code tại thời điểm viết. Nếu schema Zod hoặc service đổi, ưu tiên đọc lại các file trong bảng trên.*
