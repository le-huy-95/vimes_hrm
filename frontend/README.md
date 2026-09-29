# Manage Teams — Flutter client

Base setup (config + design system) ported from VIMES frontend. **No business logic yet.**

## Cấu trúc

```
lib/
├── app/                 # App root, theme
├── core/                # Constants, skin (design tokens)
├── data/                # (placeholder) API / models / repos
├── domain/              # (placeholder) use cases / interfaces
├── features/            # (placeholder) feature modules
├── shared/              # Shared UI kit & helpers
└── assets/              # svg, json, image, fonts
```

## Thư viện chính

- **State management**: `flutter_bloc`
- **Routing**: `go_router`
- **HTTP**: `dio`
- **Env**: `flutter_dotenv`
- **Storage**: `flutter_secure_storage`, `shared_preferences`
- **Firebase**: `firebase_core`, `firebase_messaging`, `flutter_local_notifications`
- **UI**: `bot_toast`, `shimmer`, `flutter_svg`, `lottie`, design tokens in `core/skin`

## Bắt đầu

```bash
cp .env.example .env
flutter pub get
flutter run
```

## Cấu hình Firebase

1. Tạo project trên [Firebase Console](https://console.firebase.google.com/)
2. Thêm app Android/iOS
3. Đặt file (đã gitignore):
   - `android/app/google-services.json`
   - `ios/Runner/GoogleService-Info.plist`
   - `macos/Runner/GoogleService-Info.plist`
4. (Tuỳ chọn) `flutterfire configure`

> `google-services` plugin đã được khai báo; app build được khi chưa có file Firebase, nhưng push/Google login cần config thật.

## Cấu hình API / Maps / Google Sign-In

Chỉnh `.env` rồi sync iOS secrets:

```bash
./tool/sync_ios_secrets.sh
```

- Android đọc `MAPS_API_KEY` từ `.env` trong `android/app/build.gradle.kts`
- iOS đọc từ `ios/Flutter/Secrets.xcconfig`

## Design system đã copy

| Thành phần | Path |
|------------|------|
| Colors | `lib/core/skin/color_skin.dart` |
| Typography | `lib/core/skin/typo_skin.dart` |
| Theme | `lib/app/app_theme.dart` |
| Shared widgets | `lib/shared/widgets/` |
| Bottom sheets | `lib/shared/bottom_sheet/` |
| Fonts | BeVietnamPro trong `lib/assets/fonts/` |

**Không copy**: features, data models, repositories, API services, auth/Firebase business logic.
