import { useEffect, useState } from "react";
import { api, googleLoginUrl } from "../api/client";

type Providers = {
  google: boolean;
  googleLoginUrl: string | null;
};

export function GoogleLoginButton() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    void api<Providers>("/auth/providers", { skipAuth: true })
      .then((p) => setEnabled(p.google))
      .catch(() => setEnabled(false));
  }, []);

  if (enabled === null) {
    return (
      <button type="button" className="btn-secondary" disabled>
        Đang kiểm tra Google…
      </button>
    );
  }

  if (!enabled) {
    return (
      <p className="muted small">
        Đăng nhập Google chưa bật — thiếu{" "}
        <code>GOOGLE_CLIENT_SECRET</code> (secret của Web/Server client). Xem{" "}
        <code>docs/GOOGLE_OAUTH.md</code>.
      </p>
    );
  }

  return (
    <a className="btn-secondary google-btn" href={googleLoginUrl}>
      <GoogleIcon />
      Tiếp tục với Google
    </a>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.5 5.5-6.5 7l6.2 5.2C39.1 37.1 44 31.5 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  );
}
