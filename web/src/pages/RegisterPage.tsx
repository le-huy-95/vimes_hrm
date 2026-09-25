import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PasswordField } from "../components/PasswordField";
import { GoogleLoginButton } from "../components/GoogleLoginButton";

/** Giảm overlay “email alias” từ extension trình duyệt (Bitwarden, 1Password, …). */
const noExtensionProps = {
  "data-bwignore": "true",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-form-type": "other",
} as const;

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validate() {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = "Vui lòng nhập họ và tên.";
    if (!orgName.trim()) next.orgName = "Vui lòng nhập tên tổ chức.";
    if (!email.trim()) next.email = "Vui lòng nhập email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = "Email không hợp lệ.";
    }
    if (!password) next.password = "Vui lòng nhập mật khẩu.";
    else if (password.length < 8) {
      next.password = "Mật khẩu phải có ít nhất 8 ký tự.";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      await register({ email, password, fullName, orgName });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng ký thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="brand">Manage Teams</p>
        <h1>Tạo tài khoản</h1>
        <p className="muted">Tạo tổ chức và tài khoản quản trị của bạn.</p>
        <form onSubmit={onSubmit} className="stack" autoComplete="off">
          <label>
            Họ và tên
            <input
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setFieldErrors((f) => ({ ...f, fullName: "" }));
              }}
              placeholder="Nguyễn Văn A"
              autoComplete="name"
              required
              {...noExtensionProps}
            />
            <span className="field-hint">
              Tên đầy đủ sẽ hiển thị trong tổ chức.
            </span>
            {fieldErrors.fullName && (
              <span className="error">{fieldErrors.fullName}</span>
            )}
          </label>
          <label>
            Tổ chức
            <input
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                setFieldErrors((f) => ({ ...f, orgName: "" }));
              }}
              placeholder="Công ty của bạn"
              autoComplete="organization"
              required
              {...noExtensionProps}
            />
            <span className="field-hint">
              Tên công ty hoặc nhóm bạn quản lý.
            </span>
            {fieldErrors.orgName && (
              <span className="error">{fieldErrors.orgName}</span>
            )}
          </label>
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
              autoComplete="email"
              required
              {...noExtensionProps}
            />
            <span className="field-hint">
              Dùng để đăng nhập và nhận thông báo.
            </span>
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
            placeholder="Ít nhất 8 ký tự"
            required
            minLength={8}
            autoComplete="new-password"
            hint="Tối thiểu 8 ký tự, nên kết hợp chữ và số."
            error={fieldErrors.password}
            {...noExtensionProps}
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
        </form>
        <div className="auth-divider">
          <span>hoặc</span>
        </div>
        <GoogleLoginButton />
        <p className="muted">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
