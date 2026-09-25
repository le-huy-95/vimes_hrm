# Design — Flutter Client thay React `web/`

**Date:** 2026-09-25  
**Status:** Approved (brainstorm)  
**Reference kiến trúc:** `b-i-test-l-p-tr-nh-VIMES-frontend` (cấu trúc thư mục, BLoC, repository/DI, dio interceptor, go_router)  
**Không reference UI:** không copy skin/theme VIMES; không clone layout CSS React hiện tại  
**Approach:** Scaffold sạch trong `web/` + triển khai cắt dọc theo feature đến full parity  
**Targets:** Flutter mobile (iOS/Android) + Flutter web  
**Backend:** giữ API Node/Express ở root `manage-teams` (không đổi contract trừ follow-up mobile refresh)

---

## 1. Goals

- Thay toàn bộ frontend React trong `web/` bằng một Flutter app duy nhất.
- Full parity chức năng với web React hiện tại trong một đợt deliver.
- Áp dụng cấu trúc VIMES-style: `app / core / data / domain / features / shared`, SOLID + DRY.
- UI Material 3 sạch, adaptive: web rộng = sidebar/rail; mobile = drawer (+ sheet/route thay panel chồng).
- Slim dependencies: chỉ khung + thứ parity cần (OAuth qua url_launcher/app_links, fl_chart). Không mang Firebase, Maps, PDF, scanner, hay `google_sign_in` native trừ khi sau này đổi strategy.

## 2. Non-goals

- Copy giao diện VIMES (warehouse skin) hoặc pixel-match React.
- Giữ React song song lâu dài (React bị thay thế; không deprecate dần).
- Multi-package monorepo (`packages/core`, …) — overkill.
- Push notification / Firebase trong phase này.
- Đảm bảo mobile auth store-ready nếu API vẫn cookie-only (xem §6.3) — web parity là ưu tiên ship đầu; mobile refresh là follow-up bắt buộc trước store.

## 3. Quyết định đã chốt (brainstorm)

| Chủ đề | Quyết định |
|--------|------------|
| UI reference | Học cấu trúc VIMES, không copy look VIMES |
| Platform | Mobile + Flutter web |
| React `web/` | Xóa / không dùng — chỉ Flutter |
| Scope | Full parity một đợt |
| Vị trí project | Thay nội dung `web/` bằng Flutter project |
| Visual | Material 3 adaptive |
| Template độ dày | Slim + deps parity (OAuth, chart, links) |
| Approach | Scaffold sạch + vertical slices |

---

## 4. Architecture

### 4.1 Cấu trúc thư mục

Package name đề xuất: `manage_teams_app`.

```
web/lib/
├── app/                 # MaterialApp.router, theme M3, go_router, DI wiring
│   └── router/
├── core/                # network (dio + AuthInterceptor), storage, constants, error, env
├── domain/              # repository interfaces (+ usecase mỏng nếu tái dùng thật sự)
│   └── repositories/
├── data/
│   ├── datasources/     # api_endpoints, api_services/*
│   ├── models/
│   └── repositories/    # *RepositoryImpl
├── features/
│   ├── auth/            # pages, bloc, widgets
│   ├── shell/           # AdaptiveScaffold, sidebar/drawer, tạo user org
│   ├── teams/           # tree, create, team detail, members, invite
│   └── integrations/    # Google Tasks, GitHub, Workspace, dashboard chart
└── shared/              # adaptive helpers, validators, snackbar, formatters, charts wrapper
```

Tạo user org nằm trong `shell` (cùng sidebar), không tách feature `org` riêng.
### 4.2 SOLID / DRY

- **S:** mỗi feature/bloc một trách nhiệm; TeamPage React (~870 dòng) phải tách thành blocs/widgets nhỏ.
- **O/D:** UI/Bloc chỉ phụ thuộc `domain` abstract repository; `Impl` + ApiService chỉ wire ở `app.dart` via `RepositoryProvider` (không get_it), giống VIMES guide.
- **I:** repository nhỏ theo domain (Auth, Team, Org, GoogleTasks, Github, Dashboard) — không một “God repository”.
- **DRY:** `AdaptiveScaffold`, `ServiceLinkTile`, `TeamTreeTile`, `TasksBarChart`, password field, error retry pattern dùng chung.

### 4.3 Stack

| Concern | Choice |
|---------|--------|
| State | `flutter_bloc` + `equatable` |
| Route | `go_router` + redirect theo `AuthBloc` |
| HTTP | `dio` + AuthInterceptor (Bearer + refresh single-flight) |
| Env | `flutter_dotenv` |
| Storage | `flutter_secure_storage` (access token); web: cookie refresh với `withCredentials` |
| Chart | `fl_chart` |
| OAuth launch | `url_launcher` + `app_links` (callback) |

---

## 5. Feature map (parity)

| Feature Flutter | Tương đương React | API chính |
|-----------------|-------------------|-----------|
| `auth` | Login, Register, OAuthCallback, AuthContext | `/auth/login`, `/register`, `/refresh`, `/me`, `/logout`, `/auth/google` |
| `shell` | AppLayout sidebar (teams modal, Google/GitHub services, tạo user org) | `/teams?as=tree`, `/teams/:id/integrations`, org workspace connect, `/orgs/me/users` |
| `teams` | Home empty, CreateTeam, TeamPage members/invite/edit/delete | `/teams`, `/teams/:id`, members CRUD |
| `integrations` | Tasks chart, bind lists, sync, GitHub install, commits, service member panels | dashboard, google-tasks, github connection/commits |

Routes (giữ path quen thuộc):

- Public: `/login`, `/register`, `/oauth/callback`
- Protected: `/`, `/teams/new`, `/teams/:teamId`

---

## 6. Data flow, Auth, Routing

### 6.1 Flow chuẩn

`Page` → `Bloc` (event/state) → `Repository` (interface) → `ApiService` (dio) → API hiện có.  
Widget không gọi HTTP trực tiếp.

### 6.2 Auth session

- Bootstrap: `POST /auth/refresh` → set access token → `GET /auth/me`.
- `AuthBloc`: unauthenticated | authenticated | loading/failure.
- 401: interceptor refresh single-flight; refresh fail → `AuthSessionExpired` → clear session → redirect `/login` (không treo loading).
- Google login: mở `API_URL/auth/google`; sau redirect backend về app `/oauth/callback` → refresh + me (parity React).
- Email/password login & register giữ nguyên body như web.

### 6.3 Platform auth note

- **Flutter web:** refresh cookie httpOnly hoạt động nếu dio/`BrowserHttpClientAdapter` gửi credentials (parity fetch `credentials: 'include'`).
- **Mobile:** API hiện `POST /auth/refresh` đọc cookie only → có thể thiếu refresh trên native.  
  **Follow-up bắt buộc trước ship store:** mở rộng API nhận refresh token body (hoặc bridge tương đương) và client mobile lưu refresh an toàn. Spec client vẫn implement abstraction `TokenStore` để web/mobile khác nhau sau này.

### 6.4 Router redirect

- Chưa login + vào protected → `/login`
- Đã login + vào `/login`|`/register` → `/`
- `/oauth/callback` luôn reachable để hoàn tất session

---

## 7. UI (Material 3 adaptive)

### 7.1 Shell

- Breakpoint đề xuất: ≥900px = persistent NavigationRail/Drawer (sidebar parity AppLayout).
- &lt;900px = modal drawer; team list là entry; service actions trong drawer hoặc team screen.

### 7.2 Team detail

- Header: tên team + menu `⋮` (nhân sự, mời, xóa — theo role).
- Body mặc định: dashboard — `TasksBarChart` Todo/Doing/Done + card Google/GitHub.
- Mobile: panels (personnel, invite, service members, commits, tasks bind) → full-screen route hoặc modal bottom sheet, không overlay panel dày như desktop React.

### 7.3 Shared widgets

`AdaptiveScaffold`, `ServiceLinkTile` (trạng thái “đã liên kết”), `TeamsPicker` (modal/sheet), `TasksBarChart`, form fields, empty states, retry.

---

## 8. Error handling

- Map HTTP/dio → `AppFailure` (message user-facing).
- Bloc states: `loading | success | failure`; mọi dialog/sheet phải `isLoading: false` khi lỗi + CTA「Thử lại」.
- Hành động ngắn (invite, sync): snackbar lỗi/thành công.
- Không silent catch nuốt lỗi session.

---

## 9. Testing

- Unit: repository (mock ApiService), blocs chính (`AuthBloc`, teams/shell, integrations/dashboard) với `bloc_test` + `mocktail`.
- Widget smoke: Login form validation, AdaptiveScaffold breakpoint.
- Không bắt buộc E2E OAuth đầy đủ trong đợt đầu.
- `flutter analyze` sạch trước khi coi slice xong.

---

## 10. Migration / cutover

1. Commit/backup React `web/` nếu cần lịch sử (git đã có); xóa source React trong `web/`.
2. `flutter create .` trong `web/` với platforms android, ios, web (giữ tên folder `web/`).
3. Scaffold `lib/` theo §4; thêm `.env` / `.env.example` (`API_DEV_URL`, …).
4. Vertical slices đến parity: Auth → Shell/Teams → Team detail → Integrations/Dashboard.
5. Cập nhật root `README.md`: bỏ Vite; hướng dẫn `flutter run -d chrome` / device; port Flutter web thay `5173`.
6. Cập nhật `docs/GOOGLE_OAUTH.md`: Authorized origins/redirect cho origin Flutter web mới.
7. Xóa deps/scripts React (`package.json` trong web cũ) — chỉ còn Flutter + API root.

---

## 11. Implementation slices (thứ tự)

1. **Bootstrap:** flutter create, folder layout, theme M3, dio+env+storage skeleton.
2. **Auth:** login/register/refresh/me/logout + Google callback + router guards.
3. **Shell + teams tree:** adaptive scaffold, teams modal, create team, home empty.
4. **Team detail:** members, roles, invite, edit, delete.
5. **Integrations status + sidebar services:** connect Workspace/Tasks/GitHub URLs.
6. **Dashboard chart + Tasks bind/sync + GitHub members/commits.**
7. **Polish:** README, OAuth docs, analyze, bloc tests cốt lõi.
8. **Follow-up (mobile auth):** API refresh-body + mobile TokenStore (nếu chưa có sau slice 2).

---

## 12. Success criteria

- Flutter web (Chrome): mọi flow React hiện có (auth, org user, teams, dashboard Tasks, GitHub commits, workspace connect) hoạt động.
- Mobile: cùng codebase build/chạy được; login email + navigation smoke OK. Full OAuth/refresh mobile sau khi có API follow-up §6.3.
- Không còn React/Vite trong `web/`.
- Kiến trúc đúng tầng domain/data/features; không HTTP trong widgets.
- UI M3 adaptive; không dùng skin VIMES.

---

## 13. Open follow-ups (không chặn viết plan web-first)

- Chi tiết API refresh token body cho mobile (design nhỏ riêng khi làm slice mobile auth).
- Deep link scheme iOS/Android chính thức cho OAuth return.
- Có gắn tag/branch archive React trước khi xóa `web/` source, hay chỉ dựa vào git history.
