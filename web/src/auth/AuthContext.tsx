import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  setAccessToken,
  type Me,
  type Session,
} from "../api/client";

type AuthState = {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    orgName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api<Me>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const session = await api<Session>("/auth/refresh", {
          method: "POST",
          skipAuth: true,
        });
        setAccessToken(session.accessToken);
        await refreshMe();
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshMe]);

  const login = async (email: string, password: string) => {
    const session = await api<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
    setAccessToken(session.accessToken);
    await refreshMe();
  };

  const register = async (input: {
    email: string;
    password: string;
    fullName: string;
    orgName: string;
  }) => {
    const session = await api<Session>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
    setAccessToken(session.accessToken);
    await refreshMe();
  };

  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
