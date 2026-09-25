import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, setAccessToken, type Session } from "../api/client";

export function OAuthCallbackPage() {
  const { refreshMe } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const session = await api<Session>("/auth/refresh", {
          method: "POST",
          skipAuth: true,
        });
        setAccessToken(session.accessToken);
        await refreshMe();
        navigate("/", { replace: true });
      } catch {
        navigate("/login?error=oauth", { replace: true });
      }
    })();
  }, [navigate, refreshMe]);

  return (
    <div className="auth-page">
      <p className="muted">Completing Google sign-in…</p>
    </div>
  );
}
