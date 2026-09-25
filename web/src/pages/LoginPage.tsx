import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PasswordField } from "../components/PasswordField";
import { GoogleLoginButton } from "../components/GoogleLoginButton";

const noExtensionProps = {
  "data-bwignore": "true",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-form-type": "other",
} as const;

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_state: "Phiên Google hết hạn hoặc không hợp lệ. Thử lại.",
  oauth_invalid: "Phản hồi Google không hợp lệ.",
  oauth_failed: "Đăng nhập Google thất bại. Thử lại.",
  access_denied: "Bạn đã từ chối quyền truy cập Google.",
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const oauthError = useMemo(() => {
    const raw = params.get("error");
    if (!raw) return null;
    return OAUTH_ERROR_MESSAGES[raw] ?? decodeURIComponent(raw);
  }, [params]);

  function validate() {
    const next: Record<string, string> = {};
    if (!email.trim()) next.email = "Vui lòng nhập email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = "Email không hợp lệ.";
    }
    if (!password) next.password = "Vui lòng nhập mật khẩu.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="brand">Manage Teams</p>
        <h1>Đăng nhập</h1>
        <p className="muted">Tài khoản nội bộ hoặc Google Workspace.</p>
        <form onSubmit={onSubmit} className="stack" autoComplete="on">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((f) => ({ ...f, email: "" }));
              }}
              placeholder="ban@congty.com"
              required
              autoComplete="email"
              {...noExtensionProps}
            />
            <span className="field-hint">Email bạn đã đăng ký.</span>
            {fieldErrors.email && (
              <span className="error">{fieldErrors.email}</span>
            )}
          </label>
          <PasswordField
            label="Mật khẩu"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((f) => ({ ...f, password: "" }));
            }}
            placeholder="Nhập mật khẩu"
            required
            autoComplete="current-password"
            hint="Mật khẩu tài khoản của bạn."
            error={fieldErrors.password}
            {...noExtensionProps}
          />
          {(error || oauthError) && (
            <p className="error">{error ?? oauthError}</p>
          )}
          <button type="submit" disabled={busy}>
            {busy ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
        <div className="auth-divider">
          <span>hoặc</span>
        </div>
        <GoogleLoginButton />
        <p className="muted">
          Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
        </p>
      </div>
    </div>
  );
}
