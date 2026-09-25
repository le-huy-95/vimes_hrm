# Flutter Client thay React `web/` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay React trong `web/` bằng Flutter app `manage_teams_app` (mobile + web), kiến trúc VIMES-style, Material 3 adaptive, full parity API hiện có.

**Architecture:** Scaffold sạch trong `web/`; tầng `app/core/data/domain/features/shared`; UI/Bloc → Repository interface → ApiService (dio); `AuthInterceptor` refresh cookie (web) + access token Bearer; cắt dọc Auth → Shell/Teams → Team detail → Integrations.

**Tech Stack:** Flutter 3.8+, flutter_bloc, go_router, dio, flutter_dotenv, flutter_secure_storage, fl_chart, url_launcher, app_links, equatable, bloc_test, mocktail.

**Spec:** `docs/superpowers/specs/2026-09-25-flutter-client-replace-web-design.md`  
**Reference cấu trúc (không copy UI):** `/Users/huy/Documents/code/b-i-test-l-p-tr-nh-VIMES-frontend`  
**API contracts / types:** `web/src/api/client.ts` (React — đọc trước khi xóa) và OpenAPI nếu có.

---

## File map (target)

| Path | Responsibility |
|------|----------------|
| `web/pubspec.yaml` | Dependencies Flutter |
| `web/.env.example` | `API_DEV_URL=http://localhost:3002` |
| `web/lib/main.dart` | Load dotenv, run `ManageTeamsApp` |
| `web/lib/app/app.dart` | `MultiRepositoryProvider` + `AuthBloc` + `MaterialApp.router` |
| `web/lib/app/app_theme.dart` | Material 3 light theme |
| `web/lib/app/router/app_router.dart` | go_router + auth redirect |
| `web/lib/core/constants/env_config.dart` | Đọc `API_DEV_URL` |
| `web/lib/core/storage/token_store.dart` | Abstract + secure storage impl |
| `web/lib/core/network/dio_client.dart` | Dio singleton + credentials web |
| `web/lib/core/network/auth_interceptor.dart` | Bearer + refresh single-flight |
| `web/lib/core/error/app_failure.dart` | Map dio/HTTP → message |
| `web/lib/data/datasources/api_endpoints.dart` | Path constants |
| `web/lib/data/datasources/api_services/*.dart` | HTTP calls |
| `web/lib/data/models/*.dart` | Me, Session, Team, … |
| `web/lib/domain/repositories/*.dart` | Abstract repos |
| `web/lib/data/repositories/*_impl.dart` | Implementations |
| `web/lib/features/auth/**` | Login/Register/OAuth + AuthBloc |
| `web/lib/features/shell/**` | AdaptiveScaffold, sidebar, org user form |
| `web/lib/features/teams/**` | Home, create, TeamDetail + TeamBloc |
| `web/lib/features/integrations/**` | Dashboard, Tasks, GitHub panels |
| `web/lib/shared/**` | PasswordField, TasksBarChart, snackbar, breakpoints |
| `web/test/**` | bloc_test / widget smoke |
| `README.md`, `docs/GOOGLE_OAUTH.md` | Dev + OAuth origins Flutter |

---

### Task 0: Archive React rồi xóa source trong `web/`

**Files:** tag git; xóa nội dung React; giữ folder `web/` trống sẵn cho Flutter.

- [ ] **Step 1: Tag archive React (không mất lịch sử)**

```bash
cd /Users/huy/Documents/code/manage-teams
git tag archive/react-web-before-flutter
git status
```

Expected: tag tạo thành công; working tree có thể còn diff khác — **không** commit các file API/React đang dirty trừ khi user yêu cầu. Chỉ đụng `web/` cho migration.

- [ ] **Step 2: Xóa source React trong `web/` (giữ folder)**

```bash
cd /Users/huy/Documents/code/manage-teams/web
# Xóa toàn bộ trừ chính folder (sau khi đã tag)
rm -rf src node_modules index.html package.json package-lock.json \
  tsconfig.json vite.config.ts README.md .env .env.example .gitignore
```

Expected: `web/` gần như trống (có thể còn rác ẩn — xóa tiếp nếu cần).

- [ ] **Step 3: Commit xóa React**

```bash
cd /Users/huy/Documents/code/manage-teams
git add -A web
git commit -m "$(cat <<'EOF'
chore(web): remove React Vite app before Flutter scaffold

EOF
)"
```

---

### Task 1: Flutter scaffold + folder layout + deps

**Files:**
- Create: toàn bộ skeleton `web/` via `flutter create`
- Create empty dirs under `web/lib/{app,core,data,domain,features,shared}`

- [ ] **Step 1: Create Flutter project in `web/`**

```bash
cd /Users/huy/Documents/code/manage-teams/web
flutter create --org com.manageteams --project-name manage_teams_app \
  --platforms=android,ios,web .
flutter --version
```

Expected: `pubspec.yaml` name `manage_teams_app`; platforms android/ios/web.

- [ ] **Step 2: Thêm dependencies**

Trong `web/pubspec.yaml` `dependencies:` / `dev_dependencies:`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  cupertino_icons: ^1.0.8
  dio: ^5.9.0
  go_router: ^17.1.0
  flutter_bloc: ^9.1.1
  equatable: ^2.0.7
  flutter_dotenv: ^6.0.0
  flutter_secure_storage: ^9.2.4
  fl_chart: ^1.2.0
  url_launcher: ^6.3.1
  app_links: ^7.0.0
  logger: ^2.6.1

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^6.0.0
  bloc_test: ^10.0.0
  mocktail: ^1.0.4
```

```bash
cd /Users/huy/Documents/code/manage-teams/web && flutter pub get
```

Expected: `Got dependencies!`

- [ ] **Step 3: Env + assets**

Create `web/.env.example`:

```env
APP_ENV=dev
API_DEV_URL=http://localhost:3002
```

Create `web/.env` (local, gitignore): copy từ example.

Trong `pubspec.yaml` `flutter:`:

```yaml
  assets:
    - .env
```

Thêm `.env` vào `web/.gitignore` nếu chưa có.

- [ ] **Step 4: Tạo cây thư mục lib**

```bash
cd /Users/huy/Documents/code/manage-teams/web
mkdir -p lib/app/router \
  lib/core/{constants,network,storage,error} \
  lib/data/{datasources/api_services,models,repositories} \
  lib/domain/repositories \
  lib/features/{auth/{pages,bloc,widgets},shell/{pages,bloc,widgets},teams/{pages,bloc,widgets},integrations/{pages,bloc,widgets}} \
  lib/shared/{widgets,snackbar,formatters} \
  test/features/auth
```

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "$(cat <<'EOF'
chore(web): scaffold Flutter manage_teams_app with slim deps

EOF
)"
```

---

### Task 2: Core — Env, TokenStore, AppFailure, Dio, Endpoints

**Files:**
- Create: `web/lib/core/constants/env_config.dart`
- Create: `web/lib/core/storage/token_store.dart`
- Create: `web/lib/core/error/app_failure.dart`
- Create: `web/lib/core/network/dio_client.dart`
- Create: `web/lib/data/datasources/api_endpoints.dart`
- Test: `web/test/core/app_failure_test.dart`

- [ ] **Step 1: Write failing test cho AppFailure mapping**

```dart
// web/test/core/app_failure_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams_app/core/error/app_failure.dart';

void main() {
  test('parses string error field', () {
    final f = AppFailure.fromBody({'error': 'Sai mật khẩu'}, 401);
    expect(f.message, 'Sai mật khẩu');
  });

  test('parses zod-like details', () {
    final f = AppFailure.fromBody({
      'details': [
        {'path': ['email'], 'message': 'Required'},
      ],
    }, 400);
    expect(f.message, contains('email'));
    expect(f.message, contains('Required'));
  });
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/huy/Documents/code/manage-teams/web && flutter test test/core/app_failure_test.dart
```

Expected: FAIL (library/file not found).

- [ ] **Step 3: Implement core files**

```dart
// web/lib/core/constants/env_config.dart
import 'package:flutter_dotenv/flutter_dotenv.dart';

class EnvConfig {
  static String get apiBaseUrl =>
      dotenv.env['API_DEV_URL'] ?? 'http://localhost:3002';
}
```

```dart
// web/lib/core/storage/token_store.dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class TokenStore {
  Future<String?> getAccessToken();
  Future<void> saveAccessToken(String? token);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _kAccess = 'access_token';
  final FlutterSecureStorage _storage;

  @override
  Future<String?> getAccessToken() => _storage.read(key: _kAccess);

  @override
  Future<void> saveAccessToken(String? token) async {
    if (token == null || token.isEmpty) {
      await _storage.delete(key: _kAccess);
    } else {
      await _storage.write(key: _kAccess, value: token);
    }
  }

  @override
  Future<void> clear() => _storage.delete(key: _kAccess);
}
```

```dart
// web/lib/core/error/app_failure.dart
class AppFailure implements Exception {
  AppFailure(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  factory AppFailure.fromBody(dynamic data, int? statusCode) {
    if (data is Map) {
      final details = data['details'];
      if (details is List && details.isNotEmpty) {
        final parts = details.map((issue) {
          if (issue is! Map) return 'Không hợp lệ';
          final path = issue['path'];
          final prefix = path is List && path.isNotEmpty
              ? '${path.join('.')}: '
              : '';
          return '$prefix${issue['message'] ?? 'Không hợp lệ'}';
        }).join('; ');
        return AppFailure(parts, statusCode: statusCode);
      }
      final err = data['error'];
      if (err is String && err.isNotEmpty) {
        return AppFailure(err, statusCode: statusCode);
      }
      if (err is Map && err['message'] is String) {
        return AppFailure(err['message'] as String, statusCode: statusCode);
      }
    }
    return AppFailure('Yêu cầu thất bại', statusCode: statusCode);
  }

  @override
  String toString() => message;
}
```

```dart
// web/lib/data/datasources/api_endpoints.dart
class ApiEndpoints {
  static const authLogin = '/auth/login';
  static const authRegister = '/auth/register';
  static const authRefresh = '/auth/refresh';
  static const authMe = '/auth/me';
  static const authLogout = '/auth/logout';
  static const authGoogle = '/auth/google';
  static const authProviders = '/auth/providers';
  static const teams = '/teams';
  static String team(String id) => '/teams/$id';
  static String teamMembers(String id) => '/teams/$id/members';
  static String teamMember(String teamId, String userId) =>
      '/teams/$teamId/members/$userId';
  static String teamIntegrations(String id) => '/teams/$id/integrations';
  static String teamDashboard(String id) => '/teams/$id/dashboard';
  static String teamGoogleTasks(String id) => '/teams/$id/google-tasks';
  static String teamGoogleTasksConnect(String id) =>
      '/teams/$id/google-tasks/connect';
  static String teamGoogleTasksLists(String id) =>
      '/teams/$id/google-tasks/lists';
  static String teamGoogleTasksSync(String id) =>
      '/teams/$id/google-tasks/sync';
  static String teamGithubInstallUrl(String id) =>
      '/teams/$id/github/install-url';
  static String teamGithubConnection(String id) =>
      '/teams/$id/github/connection';
  static String teamMemberIntegrations(String id, String service) =>
      '/teams/$id/members/integrations?service=$service';
  static String teamMemberGithubCommits(String teamId, String userId) =>
      '/teams/$teamId/members/$userId/github-commits';
  static const orgUsers = '/orgs/me/users';
  static const orgWorkspaceConnect =
      '/orgs/me/workspace/connect?format=json';
}
```

```dart
// web/lib/core/network/dio_client.dart
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:manage_teams_app/core/constants/env_config.dart';

class DioClient {
  DioClient._();

  static Dio? _dio;

  static Dio get instance {
    final existing = _dio;
    if (existing != null) return existing;
    final dio = Dio(
      BaseOptions(
        baseUrl: EnvConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 30),
        headers: {'Content-Type': 'application/json'},
      ),
    );
    if (kIsWeb) {
      dio.httpClientAdapter;
      // Browser: include cookies for refresh
      dio.options.extra['withCredentials'] = true;
    }
    _dio = dio;
    return dio;
  }

  static void resetForTest() => _dio = null;
}
```

**Note web cookies:** Khi implement interceptor (Task 3), dùng `dio` với adapter web gửi credentials. Nếu cookie không đi, thêm package/`BrowserHttpClientAdapter` config theo docs dio web (`dio.options.extra['withCredentials']=true` hoặc `setBrowserHttpClientAdapter`). Verify bằng login + refresh trên Chrome trước khi làm tiếp feature.

- [ ] **Step 4: Run test — expect PASS**

```bash
cd /Users/huy/Documents/code/manage-teams/web && flutter test test/core/app_failure_test.dart
```

- [ ] **Step 5: Commit**

```bash
git add web/lib/core web/lib/data/datasources/api_endpoints.dart web/test/core web/.env.example
git commit -m "$(cat <<'EOF'
feat(web): add Flutter core env, TokenStore, AppFailure, endpoints

EOF
)"
```

---

### Task 3: AuthInterceptor + models + AuthRepository

**Files:**
- Create: `web/lib/core/network/auth_interceptor.dart`
- Create: `web/lib/data/models/auth_models.dart`
- Create: `web/lib/domain/repositories/auth_repository.dart`
- Create: `web/lib/data/datasources/api_services/auth_api_service.dart`
- Create: `web/lib/data/repositories/auth_repository_impl.dart`
- Test: `web/test/features/auth/auth_repository_test.dart`

- [ ] **Step 1: Models + domain interface**

```dart
// web/lib/data/models/auth_models.dart
import 'package:equatable/equatable.dart';

class Me extends Equatable {
  const Me({
    required this.id,
    required this.email,
    required this.fullName,
    required this.orgId,
    required this.status,
    required this.org,
  });

  final String id;
  final String email;
  final String fullName;
  final String orgId;
  final String status;
  final OrgBrief org;

  factory Me.fromJson(Map<String, dynamic> json) => Me(
        id: json['id'] as String,
        email: json['email'] as String,
        fullName: json['fullName'] as String,
        orgId: json['orgId'] as String,
        status: json['status'] as String,
        org: OrgBrief.fromJson(json['org'] as Map<String, dynamic>),
      );

  @override
  List<Object?> get props => [id, email, fullName, orgId, status, org];
}

class OrgBrief extends Equatable {
  const OrgBrief({required this.id, required this.name, this.domain});

  final String id;
  final String name;
  final String? domain;

  factory OrgBrief.fromJson(Map<String, dynamic> json) => OrgBrief(
        id: json['id'] as String,
        name: json['name'] as String,
        domain: json['domain'] as String?,
      );

  @override
  List<Object?> get props => [id, name, domain];
}

class Session extends Equatable {
  const Session({required this.accessToken});

  final String accessToken;

  factory Session.fromJson(Map<String, dynamic> json) => Session(
        accessToken: json['accessToken'] as String,
      );

  @override
  List<Object?> get props => [accessToken];
}
```

```dart
// web/lib/domain/repositories/auth_repository.dart
import 'package:manage_teams_app/data/models/auth_models.dart';

abstract class AuthRepository {
  Future<void> bootstrap();
  Future<Me> login({required String email, required String password});
  Future<Me> register({
    required String email,
    required String password,
    required String fullName,
    required String orgName,
  });
  Future<Me?> currentUser();
  Future<void> logout();
  Future<void> completeOAuthCallback();
  String get googleLoginUrl;
  Future<bool> isGoogleLoginEnabled();
}
```

- [ ] **Step 2: AuthApiService + AuthRepositoryImpl + Interceptor**

```dart
// web/lib/data/datasources/api_services/auth_api_service.dart
import 'package:dio/dio.dart';
import 'package:manage_teams_app/core/error/app_failure.dart';
import 'package:manage_teams_app/core/network/dio_client.dart';
import 'package:manage_teams_app/data/datasources/api_endpoints.dart';
import 'package:manage_teams_app/data/models/auth_models.dart';

class AuthApiService {
  AuthApiService({Dio? dio}) : _dio = dio ?? DioClient.instance;

  final Dio _dio;

  Future<T> _guard<T>(Future<Response<dynamic>> Function() run) async {
    try {
      final res = await run();
      return res.data as T;
    } on DioException catch (e) {
      throw AppFailure.fromBody(e.response?.data, e.response?.statusCode);
    }
  }

  Future<Session> login(Map<String, dynamic> body) async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.post(ApiEndpoints.authLogin, data: body),
    );
    return Session.fromJson(data);
  }

  Future<Session> register(Map<String, dynamic> body) async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.post(ApiEndpoints.authRegister, data: body),
    );
    return Session.fromJson(data);
  }

  Future<Session> refresh() async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.post(ApiEndpoints.authRefresh),
    );
    return Session.fromJson(data);
  }

  Future<Me> me() async {
    final data = await _guard<Map<String, dynamic>>(
      () => _dio.get(ApiEndpoints.authMe),
    );
    return Me.fromJson(data);
  }

  Future<void> logout() async {
    await _guard<dynamic>(() => _dio.post(ApiEndpoints.authLogout));
  }

  Future<Map<String, dynamic>> providers() async {
    return _guard<Map<String, dynamic>>(
      () => _dio.get(ApiEndpoints.authProviders),
    );
  }
}
```

```dart
// web/lib/core/network/auth_interceptor.dart
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:manage_teams_app/core/storage/token_store.dart';
import 'package:manage_teams_app/data/datasources/api_endpoints.dart';

typedef SessionExpiredCallback = void Function();

class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required TokenStore tokenStore,
    required Dio dio,
    this.onSessionExpired,
  })  : _tokenStore = tokenStore,
        _dio = dio;

  final TokenStore _tokenStore;
  final Dio _dio;
  SessionExpiredCallback? onSessionExpired;

  Completer<void>? _refreshLock;

  bool _isPublic(String path) {
    final p = path.split('?').first;
    return p == ApiEndpoints.authLogin ||
        p == ApiEndpoints.authRegister ||
        p == ApiEndpoints.authRefresh ||
        p == ApiEndpoints.authProviders ||
        p == ApiEndpoints.authGoogle;
  }

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!_isPublic(options.path)) {
      final token = await _tokenStore.getAccessToken();
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final status = err.response?.statusCode;
    final path = err.requestOptions.path;
    if (status != 401 || _isPublic(path)) {
      handler.next(err);
      return;
    }

    try {
      await _refreshSingleFlight();
      final token = await _tokenStore.getAccessToken();
      final req = err.requestOptions;
      req.headers['Authorization'] = 'Bearer $token';
      final clone = await _dio.fetch(req);
      handler.resolve(clone);
    } catch (_) {
      await _tokenStore.clear();
      onSessionExpired?.call();
      handler.next(err);
    }
  }

  Future<void> _refreshSingleFlight() async {
    final existing = _refreshLock;
    if (existing != null) return existing.future;

    final lock = Completer<void>();
    _refreshLock = lock;
    try {
      final res = await _dio.post(ApiEndpoints.authRefresh);
      final access = (res.data as Map)['accessToken'] as String?;
      if (access == null || access.isEmpty) {
        throw StateError('missing accessToken');
      }
      await _tokenStore.saveAccessToken(access);
      lock.complete();
    } catch (e, st) {
      lock.completeError(e, st);
      rethrow;
    } finally {
      _refreshLock = null;
    }
  }
}
```

```dart
// web/lib/data/repositories/auth_repository_impl.dart
import 'package:manage_teams_app/core/constants/env_config.dart';
import 'package:manage_teams_app/core/storage/token_store.dart';
import 'package:manage_teams_app/data/datasources/api_services/auth_api_service.dart';
import 'package:manage_teams_app/data/models/auth_models.dart';
import 'package:manage_teams_app/domain/repositories/auth_repository.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({
    required TokenStore tokenStore,
    AuthApiService? api,
  })  : _tokenStore = tokenStore,
        _api = api ?? AuthApiService();

  final TokenStore _tokenStore;
  final AuthApiService _api;
  Me? _cached;

  @override
  String get googleLoginUrl =>
      '${EnvConfig.apiBaseUrl}${/* path */ '/auth/google'}';

  @override
  Future<void> bootstrap() async {
    try {
      final session = await _api.refresh();
      await _tokenStore.saveAccessToken(session.accessToken);
      _cached = await _api.me();
    } catch (_) {
      await _tokenStore.clear();
      _cached = null;
    }
  }

  @override
  Future<Me> login({required String email, required String password}) async {
    final session = await _api.login({'email': email, 'password': password});
    await _tokenStore.saveAccessToken(session.accessToken);
    _cached = await _api.me();
    return _cached!;
  }

  @override
  Future<Me> register({
    required String email,
    required String password,
    required String fullName,
    required String orgName,
  }) async {
    final session = await _api.register({
      'email': email,
      'password': password,
      'fullName': fullName,
      'orgName': orgName,
    });
    await _tokenStore.saveAccessToken(session.accessToken);
    _cached = await _api.me();
    return _cached!;
  }

  @override
  Future<Me?> currentUser() async => _cached;

  @override
  Future<void> logout() async {
    try {
      await _api.logout();
    } finally {
      await _tokenStore.clear();
      _cached = null;
    }
  }

  @override
  Future<void> completeOAuthCallback() async {
    final session = await _api.refresh();
    await _tokenStore.saveAccessToken(session.accessToken);
    _cached = await _api.me();
  }

  @override
  Future<bool> isGoogleLoginEnabled() async {
    try {
      final p = await _api.providers();
      return p['google'] == true;
    } catch (_) {
      return false;
    }
  }
}
```

Wire interceptor vào `DioClient` sau khi có `TokenStore` (làm trong `app.dart` Task 4):  
`dio.interceptors.add(AuthInterceptor(tokenStore: store, dio: dio));`

- [ ] **Step 3: Unit test repository với mocktail**

```dart
// web/test/features/auth/auth_repository_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:manage_teams_app/core/storage/token_store.dart';
import 'package:manage_teams_app/data/datasources/api_services/auth_api_service.dart';
import 'package:manage_teams_app/data/models/auth_models.dart';
import 'package:manage_teams_app/data/repositories/auth_repository_impl.dart';

class _MockApi extends Mock implements AuthApiService {}
class _MockStore extends Mock implements TokenStore {}

void main() {
  late _MockApi api;
  late _MockStore store;
  late AuthRepositoryImpl repo;

  final me = Me(
    id: 'u1',
    email: 'a@b.c',
    fullName: 'A',
    orgId: 'o1',
    status: 'active',
    org: const OrgBrief(id: 'o1', name: 'Org'),
  );

  setUp(() {
    api = _MockApi();
    store = _MockStore();
    repo = AuthRepositoryImpl(tokenStore: store, api: api);
    when(() => store.saveAccessToken(any())).thenAnswer((_) async {});
  });

  test('login saves token and returns me', () async {
    when(() => api.login(any())).thenAnswer(
      (_) async => const Session(accessToken: 'tok'),
    );
    when(() => api.me()).thenAnswer((_) async => me);

    final result = await repo.login(email: 'a@b.c', password: 'x');

    expect(result, me);
    verify(() => store.saveAccessToken('tok')).called(1);
  });
}
```

```bash
cd /Users/huy/Documents/code/manage-teams/web && flutter test test/features/auth/auth_repository_test.dart
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/lib web/test
git commit -m "$(cat <<'EOF'
feat(web): auth API, repository, and dio AuthInterceptor

EOF
)"
```

---

### Task 4: AuthBloc + go_router + Login/Register/OAuth pages

**Files:**
- Create: `web/lib/features/auth/bloc/auth_bloc.dart` (+ event/state)
- Create: `web/lib/features/auth/pages/login_page.dart`, `register_page.dart`, `oauth_callback_page.dart`
- Create: `web/lib/shared/widgets/password_field.dart`
- Create: `web/lib/app/router/app_router.dart`, `app_theme.dart`, `app.dart`
- Modify: `web/lib/main.dart`
- Test: `web/test/features/auth/auth_bloc_test.dart`

- [ ] **Step 1: Auth events/states + failing bloc_test**

```dart
// web/lib/features/auth/bloc/auth_event.dart
import 'package:equatable/equatable.dart';

sealed class AuthEvent extends Equatable {
  const AuthEvent();
  @override
  List<Object?> get props => [];
}

class AuthStarted extends AuthEvent {
  const AuthStarted();
}

class AuthLoginSubmitted extends AuthEvent {
  const AuthLoginSubmitted({required this.email, required this.password});
  final String email;
  final String password;
  @override
  List<Object?> get props => [email, password];
}

class AuthRegisterSubmitted extends AuthEvent {
  const AuthRegisterSubmitted({
    required this.email,
    required this.password,
    required this.fullName,
    required this.orgName,
  });
  final String email;
  final String password;
  final String fullName;
  final String orgName;
  @override
  List<Object?> get props => [email, password, fullName, orgName];
}

class AuthLogoutRequested extends AuthEvent {
  const AuthLogoutRequested();
}

class AuthOAuthCompleted extends AuthEvent {
  const AuthOAuthCompleted();
}

class AuthSessionExpired extends AuthEvent {
  const AuthSessionExpired();
}
```

```dart
// web/lib/features/auth/bloc/auth_state.dart
import 'package:equatable/equatable.dart';
import 'package:manage_teams_app/data/models/auth_models.dart';

sealed class AuthState extends Equatable {
  const AuthState();
  @override
  List<Object?> get props => [];
}

class AuthInitial extends AuthState {
  const AuthInitial();
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

class AuthAuthenticated extends AuthState {
  const AuthAuthenticated(this.user);
  final Me user;
  @override
  List<Object?> get props => [user];
}

class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated({this.message});
  final String? message;
  @override
  List<Object?> get props => [message];
}
```

```dart
// web/test/features/auth/auth_bloc_test.dart
import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:manage_teams_app/data/models/auth_models.dart';
import 'package:manage_teams_app/domain/repositories/auth_repository.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_bloc.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_event.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_state.dart';

class _MockAuthRepo extends Mock implements AuthRepository {}

void main() {
  late _MockAuthRepo repo;
  final me = Me(
    id: 'u1',
    email: 'a@b.c',
    fullName: 'A',
    orgId: 'o1',
    status: 'active',
    org: const OrgBrief(id: 'o1', name: 'Org'),
  );

  setUp(() => repo = _MockAuthRepo());

  blocTest<AuthBloc, AuthState>(
    'emits authenticated on login success',
    build: () {
      when(() => repo.login(email: any(named: 'email'), password: any(named: 'password')))
          .thenAnswer((_) async => me);
      return AuthBloc(authRepository: repo);
    },
    act: (b) => b.add(const AuthLoginSubmitted(email: 'a@b.c', password: 'x')),
    expect: () => [
      const AuthLoading(),
      AuthAuthenticated(me),
    ],
  );
}
```

- [ ] **Step 2: Run — expect FAIL (AuthBloc missing)**

```bash
cd /Users/huy/Documents/code/manage-teams/web && flutter test test/features/auth/auth_bloc_test.dart
```

- [ ] **Step 3: Implement AuthBloc + pages + router + app**

```dart
// web/lib/features/auth/bloc/auth_bloc.dart
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:manage_teams_app/domain/repositories/auth_repository.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_event.dart';
import 'package:manage_teams_app/features/auth/bloc/auth_state.dart';

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc({required AuthRepository authRepository})
      : _repo = authRepository,
        super(const AuthInitial()) {
    on<AuthStarted>(_onStarted);
    on<AuthLoginSubmitted>(_onLogin);
    on<AuthRegisterSubmitted>(_onRegister);
    on<AuthLogoutRequested>(_onLogout);
    on<AuthOAuthCompleted>(_onOAuth);
    on<AuthSessionExpired>(_onExpired);
  }

  final AuthRepository _repo;

  Future<void> _onStarted(AuthStarted e, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    await _repo.bootstrap();
    final user = await _repo.currentUser();
    emit(user == null
        ? const AuthUnauthenticated()
        : AuthAuthenticated(user));
  }

  Future<void> _onLogin(AuthLoginSubmitted e, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    try {
      final user = await _repo.login(email: e.email, password: e.password);
      emit(AuthAuthenticated(user));
    } catch (err) {
      emit(AuthUnauthenticated(message: err.toString()));
    }
  }

  Future<void> _onRegister(
    AuthRegisterSubmitted e,
    Emitter<AuthState> emit,
  ) async {
    emit(const AuthLoading());
    try {
      final user = await _repo.register(
        email: e.email,
        password: e.password,
        fullName: e.fullName,
        orgName: e.orgName,
      );
      emit(AuthAuthenticated(user));
    } catch (err) {
      emit(AuthUnauthenticated(message: err.toString()));
    }
  }

  Future<void> _onLogout(AuthLogoutRequested e, Emitter<AuthState> emit) async {
    await _repo.logout();
    emit(const AuthUnauthenticated());
  }

  Future<void> _onOAuth(AuthOAuthCompleted e, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    try {
      await _repo.completeOAuthCallback();
      final user = await _repo.currentUser();
      emit(user == null
          ? const AuthUnauthenticated(message: 'OAuth thất bại')
          : AuthAuthenticated(user));
    } catch (err) {
      emit(AuthUnauthenticated(message: err.toString()));
    }
  }

  Future<void> _onExpired(AuthSessionExpired e, Emitter<AuthState> emit) async {
    await _repo.logout();
    emit(const AuthUnauthenticated(message: 'Phiên đăng nhập hết hạn'));
  }
}
```

Router sketch (`app_router.dart`):

- Routes: `/login`, `/register`, `/oauth/callback`, `/` (ShellRoute placeholder), `/teams/new`, `/teams/:teamId`
- `redirect`: nếu `AuthUnauthenticated` && path protected → `/login`; nếu `AuthAuthenticated` && public auth → `/`
- Listen `AuthBloc` via `refreshListenable` (ChangeNotifier bridge) hoặc `GoRouterRefreshStream`

Login page: form email/password, submit → `AuthLoginSubmitted`; nút Google → `launchUrl(Uri.parse(repo.googleLoginUrl))` nếu providers bật.  
OAuth callback page: `add(AuthOAuthCompleted)` rồi `context.go('/')`.

`main.dart`:

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env');
  runApp(const ManageTeamsApp());
}
```

- [ ] **Step 4: Run bloc test PASS + analyze**

```bash
cd /Users/huy/Documents/code/manage-teams/web
flutter test test/features/auth/auth_bloc_test.dart
flutter analyze
```

- [ ] **Step 5: Manual smoke (API phải chạy `:3002`)**

```bash
cd /Users/huy/Documents/code/manage-teams/web && flutter run -d chrome
```

Expected: mở `/login`, đăng ký/đăng nhập email được, redirect `/`.

- [ ] **Step 6: Commit**

```bash
git add web/lib web/test
git commit -m "$(cat <<'EOF'
feat(web): AuthBloc, go_router guards, login/register/oauth pages

EOF
)"
```

---

### Task 5: Team models + TeamRepository + Shell adaptive + teams tree

**Files:**
- Create: `web/lib/data/models/team_models.dart`
- Create: `web/lib/domain/repositories/team_repository.dart`
- Create: `web/lib/data/datasources/api_services/team_api_service.dart`
- Create: `web/lib/data/repositories/team_repository_impl.dart`
- Create: `web/lib/features/shell/**` (ShellBloc optional — có thể `TeamsCubit` load tree)
- Create: `web/lib/features/teams/pages/home_page.dart`, `create_team_page.dart`
- Create: `web/lib/shared/widgets/adaptive_scaffold.dart`, `teams_picker.dart`, `service_link_tile.dart`
- Modify: `app_router.dart` ShellRoute

- [ ] **Step 1: Team model + repository methods (parity React)**

```dart
// Methods required on TeamRepository:
// Future<List<Team>> fetchTree();
// Future<Team> create({required String name, String? description, String? parentTeamId});
// Future<Team> getById(String id);
// Future<Team> update(String id, {String? name, String? description});
// Future<void> delete(String id);
// Future<List<TeamMember>> listMembers(String teamId);
// Future<void> invite(String teamId, {required String email, required String role});
// Future<void> updateMemberRole(String teamId, String userId, String role);
// Future<void> removeMember(String teamId, String userId);
```

Map JSON fields giống `web/src/api/client.ts` (`Team`, `TeamMember`).

- [ ] **Step 2: AdaptiveScaffold**

```dart
// Breakpoint: width >= 900 → persistent sidebar; else drawer.
// Sidebar sections (parity AppLayout):
// - Brand + org name (from AuthAuthenticated.user.org)
// - Button "Nhóm của bạn" → TeamsPicker dialog/sheet
// - "Tạo nhóm" → /teams/new
// - Google services list (Task 7 fills linked flags)
// - GitHub services list
// - Form tạo user org: POST /orgs/me/users { email, fullName, password?, role? }
// - Footer: user email + logout → AuthLogoutRequested
```

Org API service — body đúng theo `src/validators/org.validators.ts` + React HomePage:

```dart
// POST ApiEndpoints.orgUsers
// body: { "email": String, "fullName": String }
// (password không gửi từ UI hiện tại; server tự xử lý invite/temp nếu có)
```

- [ ] **Step 3: Home + Create team pages**

- Home (`/`): nếu chưa chọn team — empty state “Chọn nhóm hoặc tạo nhóm mới”.
- Create: form name/description → `TeamRepository.create` → `context.go('/teams/$id')` + refresh tree.

- [ ] **Step 4: Manual smoke Chrome**

Tạo team, mở TeamsPicker, logout/login vẫn thấy tree.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): adaptive shell, team tree, create team, org user form

EOF
)"
```

---

### Task 6: Team detail — members, invite, edit, delete

**Files:**
- Create: `web/lib/features/teams/bloc/team_detail_bloc.dart` (+ events/states)
- Create: `web/lib/features/teams/pages/team_detail_page.dart`
- Create: widgets: `member_list_panel.dart`, `invite_member_sheet.dart`, `edit_team_form.dart`
- Test: `web/test/features/teams/team_detail_bloc_test.dart`

- [ ] **Step 1: TeamDetailBloc — load team + members; derive myRole**

Events: `TeamDetailStarted(teamId)`, `TeamUpdated`, `MemberInvited`, `MemberRoleChanged`, `MemberRemoved`, `TeamDeleted`.

States: loading / ready(Team, members, myRole) / failure(message).

- [ ] **Step 2: UI**

- AppBar: `team.name` + `PopupMenuButton` (⋮): Quản lý nhân sự / Thêm người / Xóa (ẩn theo role lead).
- Mobile: panels → `showModalBottomSheet` hoặc `context.push('/teams/:id/members')`.
- Desktop: `NavigationRail` end drawer / side panel.
- Edit name/description cho lead (ExpansionTile hoặc section dưới header).

- [ ] **Step 3: bloc_test invite success + analyze**

```bash
flutter test test/features/teams/team_detail_bloc_test.dart
flutter analyze
```

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): team detail members, invite, edit, delete

EOF
)"
```

---

### Task 7: Integrations status + sidebar connect actions

**Files:**
- Create: `web/lib/data/models/integration_models.dart` (mirror `IntegrationStatus`)
- Create: `web/lib/domain/repositories/integration_repository.dart`
- Create: `web/lib/data/datasources/api_services/integration_api_service.dart`
- Create: `web/lib/data/repositories/integration_repository_impl.dart`
- Modify: shell sidebar to fetch `/teams/:id/integrations` when `teamId` selected
- Actions: launch connect URLs

- [ ] **Step 1: API methods**

```dart
Future<IntegrationStatus> getStatus(String teamId);
Future<String> googleTasksConnectUrl(String teamId); // POST or GET → {url}
Future<String> githubInstallUrl(String teamId);
Future<String> workspaceConnectUrl(); // GET orgWorkspaceConnect → {url}
```

Khớp method HTTP với React `AppLayout.tsx` (google-tasks/connect, github/install-url, workspace/connect).

- [ ] **Step 2: ServiceLinkTile**

- `linked == true` → subtitle “đã liên kết” (ColorScheme.primary / green).
- Tap: nếu action connect → `launchUrl`; nếu info → snackbar giải thích.

- [ ] **Step 3: Manual: mở connect URL không crash; linked flags cập nhật sau reload**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): team integrations status and service connect links

EOF
)"
```

---

### Task 8: Dashboard chart + Google Tasks bind/sync + GitHub members/commits

**Files:**
- Create: `web/lib/features/integrations/bloc/dashboard_bloc.dart`
- Create: `web/lib/features/integrations/widgets/tasks_bar_chart.dart`
- Create: panels: `service_members_sheet.dart`, `github_commits_sheet.dart`, `google_tasks_bind_sheet.dart`
- Modify: `team_detail_page.dart` dashboard body
- Test: `web/test/features/integrations/dashboard_bloc_test.dart`

- [ ] **Step 1: DashboardBloc load**

Parallel:

- `GET /teams/:id/dashboard` → `googleTasks: { todo, doing, done }`, github summary
- `GET /teams/:id/integrations`
- `GET /teams/:id/github/connection` (optional)
- `GET /teams/:id/google-tasks` (settings / oauth / list ids)

- [ ] **Step 2: TasksBarChart (fl_chart)**

Ba cột Todo / Doing / Done; empty → CTA “Kết nối Google Tasks”.

- [ ] **Step 3: Google Tasks bind flow (parity TeamPage)**

1. Connect OAuth URL  
2. `GET .../google-tasks/lists`  
3. `PATCH .../google-tasks` body `{ todoListId, doingListId, doneListId }`  
4. `POST .../google-tasks/sync`  
5. Reload dashboard counts  

- [ ] **Step 4: Service members + commits**

- `GET .../members/integrations?service=google|github`
- GitHub linked → `GET .../members/:userId/github-commits?cursor=`
- UI list + “Tải thêm” khi `nextCursor != null`

- [ ] **Step 5: Tests + manual Chrome parity checklist**

Checklist:

1. Register / login / Google login callback  
2. Create team / pick team  
3. Invite member / change role / remove  
4. Connect Tasks + bind + sync → chart khác 0  
5. GitHub install URL + commits panel  
6. Workspace connect URL  

```bash
flutter test
flutter analyze
```

- [ ] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): dashboard Tasks chart, bind/sync, GitHub commits panels

EOF
)"
```

---

### Task 9: Docs polish + remove React leftovers + OAuth origins

**Files:**
- Modify: `/Users/huy/Documents/code/manage-teams/README.md`
- Modify: `docs/GOOGLE_OAUTH.md`
- Verify: no `package.json` / Vite under `web/`

- [ ] **Step 1: README Web section**

Thay Vite bằng:

```bash
cd web && cp .env.example .env
flutter pub get
flutter run -d chrome
# hoặc: flutter run  (iOS/Android)
```

API vẫn `npm run dev` ở root → `:3002`.

- [ ] **Step 2: GOOGLE_OAUTH.md**

Thêm Authorized JavaScript origins cho origin Flutter web (vd. `http://localhost:XXXX` — ghi rõ chạy `flutter run -d chrome` rồi copy origin từ address bar). Giữ callback API `http://localhost:3002/auth/google/callback`.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/GOOGLE_OAUTH.md web
git commit -m "$(cat <<'EOF'
docs: Flutter web client setup and OAuth origins

EOF
)"
```

---

### Task 10 (follow-up, không chặn web parity): Mobile refresh token API

**Chỉ làm khi bắt đầu ship mobile store / OAuth native.**

**Files (API):**
- Modify: `src/controllers/auth.controller.ts`, `src/services/auth.service.ts`
- Accept refresh từ body `{ refreshToken }` **hoặc** cookie
- Login/register response có thể trả `refreshToken` cho native (cookie vẫn cho web)

**Files (Flutter):**
- Extend `TokenStore` với refresh token
- `AuthInterceptor._refreshSingleFlight` gửi body trên `!kIsWeb`

- [ ] Design nhỏ + implement + test — **out of scope ship Flutter web đầu**

---

## Spec coverage checklist

| Spec § | Task |
|--------|------|
| Goals / replace React | 0–1 |
| Folder architecture | 1–2 |
| Auth session + interceptor | 3–4 |
| Routes | 4 |
| Shell adaptive + org user | 5 |
| Teams CRUD/members | 5–6 |
| Integrations sidebar | 7 |
| Dashboard / Tasks / GitHub | 8 |
| Testing | 2–4, 6, 8 |
| README / OAuth docs | 9 |
| Mobile refresh follow-up | 10 |
| Non-goal: no VIMES skin / no Firebase | toàn bộ tasks slim deps |

---

## Execution note

- Ưu tiên **Flutter web + API local** đến hết Task 9.  
- Mobile: `flutter run` smoke sau Task 4/5; full OAuth mobile = Task 10.  
- Khi implement, đọc validators/controllers backend nếu JSON field lệch plan.  
- Không copy widget/theme từ VIMES — chỉ pattern thư mục/DI/interceptor.

---

*End of plan.*
