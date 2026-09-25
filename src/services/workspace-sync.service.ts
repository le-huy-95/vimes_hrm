import type { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { env } from "../lib/env.js";
import { workspaceUserContentHash } from "../lib/content-hash.js";
import type { DirectoryGroup, DirectoryUser, GoogleDirectoryClient } from "../lib/google-directory.client.js";
import { acquireLock, isLocked, redis, releaseLock } from "../lib/redis.js";
import { workspaceSyncJobId, workspaceSyncQueue } from "../lib/queue.js";
import type { AuditRepository } from "../repositories/audit.repository.js";
import type { SyncLogRepository } from "../repositories/sync-log.repository.js";
import type { TeamRepository } from "../repositories/team.repository.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { WorkspaceGroupMapRepository } from "../repositories/workspace-group-map.repository.js";
import type { WorkspaceSettingsRepository } from "../repositories/workspace-settings.repository.js";
import type { WorkspaceSyncRepository, WorkspaceSyncRow } from "../repositories/workspace-sync.repository.js";
import type { WorkspaceAuthService } from "./workspace-auth.service.js";

const LOCK_TTL_SECONDS = 600;
const GROUPS_CACHE_TTL = 600;
const CONFLICT_SAMPLE_CAP = 5;
const MAX_GROUP_PAGES = 50;
const PAGE_SIZE = 200;

export type SyncCounters = {
  mode: "incremental" | "full";
  pages: number;
  upserted: number;
  linked: number;
  createdUsers: number;
  skippedUnchanged: number;
  conflicts: number;
  conflictEmails: string[];
  apiCalls: number;
  durationMs?: number;
};

function syncLockKey(orgId: string) {
  return `lock:sync:google-workspace:${orgId}`;
}

function groupsCacheKey(orgId: string) {
  return `gws:groups:${orgId}`;
}

/** Detect Directory invalid/expired syncToken (incl. HTTP 410). */
export function isInvalidSyncTokenError(err: unknown): boolean {
  const status =
    (err as { code?: number })?.code ??
    (err as { response?: { status?: number } })?.response?.status;
  if (status === 410) return true;
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  return (
    msg.includes("synctoken") ||
    msg.includes("sync token") ||
    (msg.includes("invalid") && msg.includes("token") && msg.includes("sync"))
  );
}

function emptyCounters(mode: SyncCounters["mode"]): SyncCounters {
  return {
    mode,
    pages: 0,
    upserted: 0,
    linked: 0,
    createdUsers: 0,
    skippedUnchanged: 0,
    conflicts: 0,
    conflictEmails: [],
    apiCalls: 0,
  };
}

function countersToMeta(counters: SyncCounters): Prisma.InputJsonValue {
  const { conflictEmails, ...rest } = counters;
  return {
    ...rest,
    ...(conflictEmails.length > 0 ? { conflictEmails } : {}),
  };
}

function truncateError(err: unknown, max = 500): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > max ? `${msg.slice(0, max)}…` : msg;
}

export class WorkspaceSyncService {
  constructor(
    private readonly auth: WorkspaceAuthService,
    private readonly settings: WorkspaceSettingsRepository,
    private readonly syncRows: WorkspaceSyncRepository,
    private readonly syncLogs: SyncLogRepository,
    private readonly groupMaps: WorkspaceGroupMapRepository,
    private readonly users: UserRepository,
    private readonly teams: TeamRepository,
    private readonly audit: AuditRepository,
  ) {}

  async enqueueSync(orgId: string, triggeredByUserId: string) {
    const job = await workspaceSyncQueue.add(
      "sync",
      { orgId, triggeredByUserId },
      { jobId: workspaceSyncJobId(orgId) },
    );

    await this.audit.create({
      actorUserId: triggeredByUserId,
      action: "workspace.sync.enqueue",
      entityType: "org",
      entityId: orgId,
    });

    // Optional per-org cron. Upsert is available on BullMQ 6; keep best-effort so enqueue never fails.
    try {
      await workspaceSyncQueue.upsertJobScheduler(
        `gws-cron:${orgId}`,
        { pattern: env.GOOGLE_WORKSPACE_SYNC_CRON },
        {
          name: "sync",
          data: { orgId, triggeredByUserId },
        },
      );
    } catch {
      // Scheduler wiring can be awkward with jobId coalesce — Task 7 worker may register repeats instead.
    }

    return { jobId: job.id, orgId };
  }

  async runSync(orgId: string, triggeredByUserId?: string) {
    const lockKey = syncLockKey(orgId);
    const lockToken = await acquireLock(lockKey, LOCK_TTL_SECONDS);
    if (!lockToken) {
      return { skipped: true as const, reason: "already_running" };
    }

    const log = await this.syncLogs.createRunning(orgId);
    const startedAt = Date.now();
    const counters = emptyCounters("full");

    try {
      const client = await this.auth.resolveClientForOrg(orgId, triggeredByUserId);
      const settings = await this.settings.getOrCreate(orgId);

      try {
        await this.runSyncLoop(orgId, client, counters, {
          syncToken: settings.directorySyncToken,
          pageToken: settings.syncCursorPageToken,
        });
      } catch (err) {
        if (!isInvalidSyncTokenError(err)) throw err;
        // Invalid incremental token → clear and full sync once.
        await this.settings.updateSyncState(orgId, {
          directorySyncToken: null,
          syncCursorPageToken: null,
        });
        // Reset counters for the full retry (prior partial pages were invalid delta).
        Object.assign(counters, emptyCounters("full"));
        await this.runSyncLoop(orgId, client, counters, {
          syncToken: null,
          pageToken: null,
        });
      }

      counters.durationMs = Date.now() - startedAt;
      await this.syncLogs.finish(log.id, "success", countersToMeta(counters));
      return { skipped: false as const, status: "success" as const, counters };
    } catch (err) {
      counters.durationMs = Date.now() - startedAt;
      const status =
        counters.pages > 0 || counters.upserted > 0 || counters.createdUsers > 0
          ? "partial"
          : "failed";
      await this.syncLogs.finish(
        log.id,
        status,
        countersToMeta(counters),
        truncateError(err),
      );
      return { skipped: false as const, status, counters, error: truncateError(err) };
    } finally {
      await releaseLock(lockKey, lockToken);
    }
  }

  /**
   * Paginate Directory users page-by-page (no full directory in RAM).
   * Uses syncToken when present; persists cursor + nextSyncToken.
   */
  private async runSyncLoop(
    orgId: string,
    client: GoogleDirectoryClient,
    counters: SyncCounters,
    start: { syncToken: string | null; pageToken: string | null },
  ): Promise<void> {
    counters.mode = start.syncToken ? "incremental" : "full";
    let pageToken: string | undefined = start.pageToken ?? undefined;
    let syncToken: string | undefined = start.syncToken ?? undefined;
    let latestNextSyncToken: string | undefined;

    for (;;) {
      const page = await client.listUsersPage({
        syncToken,
        pageToken,
        maxResults: PAGE_SIZE,
      });
      counters.apiCalls++;
      counters.pages++;

      await this.processPage(orgId, page.users, counters);

      pageToken = page.nextPageToken;
      if (page.nextSyncToken) {
        latestNextSyncToken = page.nextSyncToken;
      }

      await this.settings.updateSyncState(orgId, {
        syncCursorPageToken: pageToken ?? null,
      });

      if (!pageToken) break;
    }

    await this.settings.updateSyncState(orgId, {
      directorySyncToken: latestNextSyncToken ?? syncToken ?? null,
      syncCursorPageToken: null,
      ...(counters.mode === "full"
        ? { lastFullSyncAt: new Date() }
        : { lastIncrementalSyncAt: new Date() }),
    });
  }

  private async processPage(
    orgId: string,
    users: DirectoryUser[],
    counters: SyncCounters,
  ): Promise<void> {
    if (users.length === 0) return;

    const now = new Date();
    const googleIds = users.map((u) => u.googleUserId);
    const existingRows = await this.syncRows.findByGoogleUserIds(orgId, googleIds);
    const existingByGid = new Map(existingRows.map((r) => [r.googleUserId, r]));

    const rowsToUpsert: WorkspaceSyncRow[] = [];
    const needsLink: Array<{ user: DirectoryUser; hash: string; prevLinkedUserId: string | null }> =
      [];

    for (const user of users) {
      const hash = workspaceUserContentHash({
        primaryEmail: user.primaryEmail,
        fullName: user.fullName,
        orgUnit: user.orgUnit,
        photoUrl: user.photoUrl,
        suspended: user.suspended,
      });
      const prev = existingByGid.get(user.googleUserId);
      if (prev && prev.contentHash === hash) {
        counters.skippedUnchanged++;
        if (prev.linkedUserId) continue;
        needsLink.push({ user, hash, prevLinkedUserId: prev.linkedUserId });
        continue;
      }

      rowsToUpsert.push({
        orgId,
        googleUserId: user.googleUserId,
        primaryEmail: user.primaryEmail.toLowerCase(),
        fullName: user.fullName,
        orgUnit: user.orgUnit,
        photoUrl: user.photoUrl,
        suspended: user.suspended,
        linkedUserId: prev?.linkedUserId ?? null,
        contentHash: hash,
        lastSyncedAt: now,
      });
      needsLink.push({ user, hash, prevLinkedUserId: prev?.linkedUserId ?? null });
    }

    if (rowsToUpsert.length > 0) {
      await this.syncRows.bulkUpsert(rowsToUpsert);
      counters.upserted += rowsToUpsert.length;
    }

    if (needsLink.length === 0) return;

    const emails = needsLink.map(({ user }) => user.primaryEmail.toLowerCase());
    const linkGoogleIds = needsLink.map(({ user }) => user.googleUserId);
    const localUsers = await this.users.findManyInOrgByEmailsOrGoogleIds(
      orgId,
      emails,
      linkGoogleIds,
    );

    const byGoogleId = new Map(
      localUsers.filter((u) => u.googleUserId).map((u) => [u.googleUserId as string, u]),
    );
    const byEmail = new Map(localUsers.map((u) => [u.email.toLowerCase(), u]));

    const linkRows: WorkspaceSyncRow[] = [];

    for (const { user, hash, prevLinkedUserId } of needsLink) {
      const email = user.primaryEmail.toLowerCase();
      let local = byGoogleId.get(user.googleUserId) ?? byEmail.get(email) ?? null;

      if (!local) {
        const elsewhere = await this.users.findByEmail(email);
        if (elsewhere && elsewhere.orgId !== orgId) {
          counters.conflicts++;
          if (counters.conflictEmails.length < CONFLICT_SAMPLE_CAP) {
            counters.conflictEmails.push(email);
          }
          continue;
        }
        if (elsewhere && elsewhere.orgId === orgId) {
          local = elsewhere;
        }
      }

      if (local) {
        if (!local.googleUserId) {
          await this.users.linkGoogleId(local.id, user.googleUserId);
          counters.linked++;
        } else if (!prevLinkedUserId) {
          counters.linked++;
        }

        if (user.suspended && local.status !== "disabled") {
          await this.users.updateStatus(local.id, "disabled");
        }

        if (prevLinkedUserId !== local.id) {
          linkRows.push({
            orgId,
            googleUserId: user.googleUserId,
            primaryEmail: email,
            fullName: user.fullName,
            orgUnit: user.orgUnit,
            photoUrl: user.photoUrl,
            suspended: user.suspended,
            linkedUserId: local.id,
            contentHash: hash,
            lastSyncedAt: now,
          });
        }
        continue;
      }

      const created = await this.users.createInvited({
        orgId,
        email,
        fullName: user.fullName,
        googleUserId: user.googleUserId,
      });
      counters.createdUsers++;

      if (user.suspended) {
        await this.users.updateStatus(created.id, "disabled");
      }

      linkRows.push({
        orgId,
        googleUserId: user.googleUserId,
        primaryEmail: email,
        fullName: user.fullName,
        orgUnit: user.orgUnit,
        photoUrl: user.photoUrl,
        suspended: user.suspended,
        linkedUserId: created.id,
        contentHash: hash,
        lastSyncedAt: now,
      });
    }

    if (linkRows.length > 0) {
      await this.syncRows.bulkUpsert(linkRows);
    }
  }

  async listGroups(orgId: string, userId: string): Promise<DirectoryGroup[]> {
    const cacheKey = groupsCacheKey(orgId);
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as DirectoryGroup[];
    }

    const client = await this.auth.resolveClientForOrg(orgId, userId);
    const groups: DirectoryGroup[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_GROUP_PAGES; page++) {
      const res = await client.listGroupsPage({ pageToken, maxResults: PAGE_SIZE });
      groups.push(...res.groups);
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }

    await redis.set(cacheKey, JSON.stringify(groups), "EX", GROUPS_CACHE_TTL);
    return groups;
  }

  async mapGroupToTeam(orgId: string, groupEmail: string, teamId: string) {
    const team = await this.teams.findById(teamId);
    if (!team || team.orgId !== orgId) {
      throw new AppError(400, "Team not in organization");
    }

    const resolved = await this.resolveGroupId(orgId, groupEmail);
    return this.groupMaps.upsertMap({
      orgId,
      googleGroupId: resolved.id,
      googleGroupEmail: resolved.email,
      teamId,
    });
  }

  async unmapGroup(orgId: string, groupEmail: string) {
    return this.groupMaps.deleteByGroupEmail(orgId, groupEmail.toLowerCase());
  }

  async getStatus(orgId: string) {
    const [latestLog, locked, settings] = await Promise.all([
      this.syncLogs.latest(orgId),
      isLocked(syncLockKey(orgId)),
      this.settings.get(orgId),
    ]);
    return {
      latestLog,
      isLocked: locked,
      lastFullSyncAt: settings?.lastFullSyncAt ?? null,
      lastIncrementalSyncAt: settings?.lastIncrementalSyncAt ?? null,
      authMode: settings?.authMode ?? null,
    };
  }

  listLogs(orgId: string, take?: number, skip?: number) {
    return this.syncLogs.listByOrg(orgId, { take, skip });
  }

  listSyncedUsers(orgId: string, cursor?: string, take?: number) {
    return this.syncRows.listByOrg(orgId, { cursor, take });
  }

  /** Resolve Directory group id from cache / Directory; fall back to email as id. */
  private async resolveGroupId(
    orgId: string,
    groupEmail: string,
  ): Promise<{ id: string; email: string }> {
    const email = groupEmail.toLowerCase();

    const cached = await redis.get(groupsCacheKey(orgId));
    if (cached) {
      const groups = JSON.parse(cached) as DirectoryGroup[];
      const hit = groups.find((g) => g.email.toLowerCase() === email);
      if (hit) return { id: hit.googleGroupId, email: hit.email.toLowerCase() };
    }

    try {
      const client = await this.auth.resolveClientForOrg(orgId);
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_GROUP_PAGES; page++) {
        const res = await client.listGroupsPage({ pageToken, maxResults: PAGE_SIZE });
        const hit = res.groups.find((g) => g.email.toLowerCase() === email);
        if (hit) return { id: hit.googleGroupId, email: hit.email.toLowerCase() };
        pageToken = res.nextPageToken;
        if (!pageToken) break;
      }
    } catch {
      // Directory unavailable — store email as id fallback.
    }

    return { id: email, email };
  }
}
