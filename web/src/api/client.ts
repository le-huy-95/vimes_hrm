const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3002";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

type ApiOptions = RequestInit & { skipAuth?: boolean };

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (!options.skipAuth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && !options.skipAuth && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.set("Authorization", `Bearer ${accessToken}`);
      res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    }
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatApiError(data, res.statusText));
  }
  return data as T;
}

function formatApiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const body = data as {
    error?: unknown;
    details?: Array<{ path?: (string | number)[]; message?: string }>;
  };

  if (Array.isArray(body.details) && body.details.length > 0) {
    return body.details
      .map((issue) => {
        const path = issue.path?.length ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message ?? "Không hợp lệ"}`;
      })
      .join("; ");
  }

  if (typeof body.error === "string" && body.error) return body.error;
  if (
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof (body.error as { message: unknown }).message === "string"
  ) {
    return (body.error as { message: string }).message;
  }

  return fallback || "Yêu cầu thất bại";
}

async function tryRefresh(): Promise<boolean> {
  try {
    const data = await api<{ accessToken: string }>("/auth/refresh", {
      method: "POST",
      skipAuth: true,
    });
    setAccessToken(data.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}

export const googleLoginUrl = `${API_URL}/auth/google`;

export type Me = {
  id: string;
  email: string;
  fullName: string;
  orgId: string;
  status: string;
  org: { id: string; name: string; domain: string | null };
};

export type Team = {
  id: string;
  orgId: string;
  parentTeamId: string | null;
  name: string;
  description: string | null;
  createdAt: string;
  /** Tên thành viên (có khi lấy từ GET /teams hoặc ?as=tree) */
  memberNames?: string[];
  children?: Team[];
};

export type TeamMember = {
  id: string;
  teamId: string;
  userId: string;
  role: "lead" | "member" | "viewer";
  joinedAt: string;
  user: { id: string; email: string; fullName: string; status: string };
};

export type Session = {
  accessToken: string;
  user: { sub: string; orgId: string; email: string };
};
