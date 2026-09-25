/**
 * Google Tasks OAuth + sync — bind task lists to team and aggregate chart counts.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { GoogleTasksListKind } from "@prisma/client";
import { encrypt, decrypt } from "../lib/crypto.js";
import { env, googleEnabled } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import {
  listGoogleTaskLists,
  listGoogleTasksInList,
} from "../lib/google-tasks.client.js";
import {
  googleTasksSyncJobId,
  googleTasksSyncQueue,
} from "../lib/queue.js";
import type { AuditRepository } from "../repositories/audit.repository.js";
import type { GoogleTasksRepository } from "../repositories/google-tasks.repository.js";
import type { OauthRepository } from "../repositories/oauth.repository.js";
import type { TeamRepository } from "../repositories/team.repository.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_TASKS_SCOPE =
  "https://www.googleapis.com/auth/tasks.readonly";

function signState(payload: string): string {
  const sig = createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

function verifyState(signed: string): string {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) throw new AppError(400, "Invalid state");
  const payload = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(payload)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError(400, "Invalid state");
  }
  return payload;
}

export class GoogleTasksService {
  constructor(
    private readonly teams: TeamRepository,
    private readonly googleTasks: GoogleTasksRepository,
    private readonly oauth: OauthRepository,
    private readonly audit: AuditRepository,
  ) {}

  private async assertTeam(orgId: string, teamId: string) {
    const team = await this.teams.findById(teamId);
    if (!team || team.orgId !== orgId) throw new AppError(404, "Team not found");
    return team;
  }

  buildConnectUrl(teamId: string, userId: string): string {
    if (!googleEnabled) {
      throw new AppError(503, "Google OAuth is not configured");
    }
    const nonce = randomBytes(8).toString("hex");
    const state = signState(`${teamId}:${userId}:${nonce}`);
    const params = new URLSearchParams({
      client_id: env.GOOGLE_WEB_CLIENT_ID,
      redirect_uri: env.GOOGLE_TASKS_CONNECT_CALLBACK_URL,
      response_type: "code",
      scope: GOOGLE_TASKS_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${GOOGLE_AUTH}?${params.toString()}`;
  }

  async handleConnectCallback(code: string, state: string) {
    const payload = verifyState(state);
    const [teamId, userId] = payload.split(":");
    if (!teamId || !userId) throw new AppError(400, "Invalid state payload");

    const body = new URLSearchParams({
      code,
      client_id: env.GOOGLE_WEB_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_TASKS_CONNECT_CALLBACK_URL,
      grant_type: "authorization_code",
    });
    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) {
      throw new AppError(502, "Failed to exchange Google Tasks code");
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    await this.oauth.upsertGoogleTasks({
      userId,
      accessTokenEnc: encrypt(tokens.access_token),
      refreshTokenEnc: tokens.refresh_token
        ? encrypt(tokens.refresh_token)
        : null,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined,
      scope: tokens.scope ?? GOOGLE_TASKS_SCOPE,
    });

    await this.googleTasks.upsertSettings({
      teamId,
      connectedByUserId: userId,
    });

    await this.audit.create({
      actorUserId: userId,
      action: "google_tasks.connect",
      entityType: "team",
      entityId: teamId,
    });

    return { teamId };
  }

  private async getAccessToken(userId: string): Promise<string> {
    const conn = await this.oauth.findGoogleTasks(userId);
    if (!conn) {
      throw new AppError(409, "Google Tasks not connected", "NOT_CONNECTED");
    }
    const expired =
      conn.expiresAt && conn.expiresAt.getTime() < Date.now() + 60_000;
    if (!expired) return decrypt(conn.accessTokenEnc);

    if (!conn.refreshTokenEnc) {
      throw new AppError(409, "Google Tasks token expired", "TOKEN_EXPIRED");
    }
    const body = new URLSearchParams({
      client_id: env.GOOGLE_WEB_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: decrypt(conn.refreshTokenEnc),
      grant_type: "refresh_token",
    });
    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) {
      throw new AppError(502, "Failed to refresh Google Tasks token");
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      expires_in?: number;
      scope?: string;
    };
    await this.oauth.upsertGoogleTasks({
      userId,
      accessTokenEnc: encrypt(tokens.access_token),
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined,
      scope: tokens.scope,
    });
    return tokens.access_token;
  }

  async getStatus(orgId: string, teamId: string, userId: string) {
    await this.assertTeam(orgId, teamId);
    const settings = await this.googleTasks.getSettings(teamId);
    const oauth = await this.oauth.findGoogleTasks(
      settings?.connectedByUserId ?? userId,
    );
    return {
      oauthConnected: Boolean(oauth),
      settings,
      chart: await this.getChartCounts(teamId),
    };
  }

  async listRemoteLists(orgId: string, teamId: string, userId: string) {
    await this.assertTeam(orgId, teamId);
    const settings = await this.googleTasks.getSettings(teamId);
    const tokenUser = settings?.connectedByUserId ?? userId;
    const accessToken = await this.getAccessToken(tokenUser);
    return listGoogleTaskLists(accessToken);
  }

  async bindLists(
    actorUserId: string,
    orgId: string,
    teamId: string,
    input: {
      todoListId?: string | null;
      doingListId?: string | null;
      doneListId?: string | null;
    },
  ) {
    await this.assertTeam(orgId, teamId);
    const settings = await this.googleTasks.upsertSettings({
      teamId,
      todoListId: input.todoListId,
      doingListId: input.doingListId,
      doneListId: input.doneListId,
      connectedByUserId: actorUserId,
    });
    await this.audit.create({
      actorUserId,
      action: "google_tasks.bind",
      entityType: "team",
      entityId: teamId,
      meta: input,
    });
    return settings;
  }

  async enqueueSync(orgId: string, teamId: string, actorUserId?: string) {
    await this.assertTeam(orgId, teamId);
    await googleTasksSyncQueue.add(
      "sync",
      { teamId, orgId, actorUserId },
      { jobId: googleTasksSyncJobId(teamId) },
    );
    return { enqueued: true };
  }

  async runSync(teamId: string, orgId: string, actorUserId?: string) {
    await this.assertTeam(orgId, teamId);
    const settings = await this.googleTasks.getSettings(teamId);
    if (!settings) {
      throw new AppError(409, "Google Tasks settings missing", "NO_SETTINGS");
    }
    const tokenUser = settings.connectedByUserId ?? actorUserId;
    if (!tokenUser) {
      throw new AppError(409, "Google Tasks not connected", "NOT_CONNECTED");
    }
    const accessToken = await this.getAccessToken(tokenUser);

    const bindings: Array<{ listId: string; kind: GoogleTasksListKind }> = [];
    if (settings.todoListId)
      bindings.push({ listId: settings.todoListId, kind: "todo" });
    if (settings.doingListId)
      bindings.push({ listId: settings.doingListId, kind: "doing" });
    if (settings.doneListId)
      bindings.push({ listId: settings.doneListId, kind: "done" });

    // Single-list mode: only todoListId bound → map by Google status
    const singleList =
      bindings.length === 1 && settings.todoListId && !settings.doingListId && !settings.doneListId
        ? settings.todoListId
        : null;

    await this.googleTasks.deleteTasksForTeam(teamId);

    if (singleList) {
      const items = await listGoogleTasksInList(accessToken, singleList);
      for (const t of items) {
        if (!t.id) continue;
        const kind: GoogleTasksListKind =
          t.status === "completed" ? "done" : "todo";
        await this.googleTasks.upsertTask({
          teamId,
          googleTaskId: t.id,
          listKind: kind,
          title: t.title ?? "(untitled)",
          status: t.status ?? "needsAction",
          googleUpdatedAt: t.updated ? new Date(t.updated) : null,
        });
      }
    } else {
      for (const b of bindings) {
        const items = await listGoogleTasksInList(accessToken, b.listId);
        for (const t of items) {
          if (!t.id) continue;
          await this.googleTasks.upsertTask({
            teamId,
            googleTaskId: `${b.kind}:${t.id}`,
            listKind: b.kind,
            title: t.title ?? "(untitled)",
            status: t.status ?? "needsAction",
            googleUpdatedAt: t.updated ? new Date(t.updated) : null,
          });
        }
      }
    }

    await this.googleTasks.upsertSettings({
      teamId,
      lastSyncedAt: new Date(),
    });

    return this.getChartCounts(teamId);
  }

  async getChartCounts(teamId: string) {
    const settings = await this.googleTasks.getSettings(teamId);
    const groups = await this.googleTasks.countByKind(teamId);
    const counts = { todo: 0, doing: 0, done: 0 };
    for (const row of groups) {
      counts[row.listKind] = row._count._all;
    }
    const connected = Boolean(
      settings &&
        (settings.todoListId ||
          settings.doingListId ||
          settings.doneListId ||
          settings.connectedByUserId),
    );
    return {
      connected,
      ...counts,
      lastSyncedAt: settings?.lastSyncedAt?.toISOString() ?? null,
      lists: {
        todo: settings?.todoListId ?? null,
        doing: settings?.doingListId ?? null,
        done: settings?.doneListId ?? null,
      },
    };
  }
}
