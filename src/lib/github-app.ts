import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { AppError } from "./errors.js";
import { env } from "./env.js";
import { redis } from "./redis.js";

const GITHUB_API = "https://api.github.com";
const API_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

export type GithubInstallationRepo = {
  id: number;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch?: string;
};

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function resolvePrivateKey(): string {
  const raw = env.GITHUB_APP_PRIVATE_KEY ?? "";
  if (!raw.trim()) throw new AppError(500, "GitHub App private key not configured");
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  return readFileSync(raw, "utf8");
}

export function createGithubAppJwt(nowSeconds = Math.floor(Date.now() / 1000)): string {
  const appId = env.GITHUB_APP_ID?.trim();
  if (!appId) throw new AppError(500, "GitHub App ID not configured");
  const privateKey = resolvePrivateKey();
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iss: appId, iat: nowSeconds - 60, exp: nowSeconds + 9 * 60 }),
  );
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  const signature = base64url(signer.sign(privateKey));
  return `${data}.${signature}`;
}

function cacheKey(installationId: number | string): string {
  return `github:install-token:${installationId}`;
}

export async function getInstallationToken(
  installationId: number | string,
): Promise<string> {
  const key = cacheKey(installationId);
  const cached = await redis.get(key);
  if (cached) return cached;

  const jwt = createGithubAppJwt();
  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { ...API_HEADERS, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    throw new AppError(res.status, `Failed to create installation token: ${await res.text()}`);
  }
  const body = (await res.json()) as { token: string; expires_at: string };
  if (!body.token) throw new AppError(502, "GitHub did not return an installation token");
  const expiresMs = new Date(body.expires_at).getTime() - Date.now() - 60_000;
  const ttlSeconds = Math.max(30, Math.floor(expiresMs / 1000));
  await redis.set(key, body.token, "EX", ttlSeconds);
  return body.token;
}

type ApiInit = {
  method?: string;
  body?: unknown;
  token?: string;
  appJwt?: boolean;
};

export async function githubApiGet<T>(path: string, init: ApiInit = {}): Promise<T> {
  const token = init.token ?? (init.appJwt ? createGithubAppJwt() : undefined);
  if (!token) throw new AppError(500, "GitHub API call requires a token");
  const res = await fetch(`${GITHUB_API}${path}`, {
    method: init.method ?? "GET",
    headers: { ...API_HEADERS, Authorization: `Bearer ${token}` },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    throw new AppError(res.status, `GitHub API ${path} failed: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function getInstallationAccount(
  installationId: number | string,
): Promise<{ login: string; type: "Organization" | "User" }> {
  const data = await githubApiGet<{
    account?: { login?: string; type?: string };
  }>(`/app/installations/${installationId}`, { appJwt: true });
  const login = data.account?.login;
  const type = data.account?.type;
  if (!login || (type !== "Organization" && type !== "User")) {
    throw new AppError(502, "Invalid GitHub installation account response");
  }
  return { login, type };
}

export async function listInstallationRepos(
  installationId: number | string,
): Promise<GithubInstallationRepo[]> {
  const token = await getInstallationToken(installationId);
  const repos: GithubInstallationRepo[] = [];
  let page = 1;
  for (;;) {
    const data = await githubApiGet<{
      repositories?: Array<{
        id: number;
        full_name: string;
        private: boolean;
        html_url: string;
        default_branch?: string;
      }>;
    }>(`/installation/repositories?per_page=100&page=${page}`, { token });
    const batch = data.repositories ?? [];
    repos.push(
      ...batch.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        private: r.private,
        html_url: r.html_url,
        default_branch: r.default_branch,
      })),
    );
    if (batch.length < 100) break;
    page += 1;
  }
  return repos;
}
