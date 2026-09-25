import { redis } from "../lib/redis.js";
import { githubWebhookQueue } from "../lib/queue.js";
import { env } from "../lib/env.js";
import { verifyGithubWebhookSignature } from "../lib/github-webhook-verify.js";
import { AppError } from "../lib/errors.js";
import type { Prisma } from "@prisma/client";
import type { GithubDeliveryRepository } from "../repositories/github-delivery.repository.js";
import type { GithubConnectionRepository } from "../repositories/github-connection.repository.js";
import type { GithubRepoRepository } from "../repositories/github-repo.repository.js";
import type { GithubActivityRepository } from "../repositories/github-activity.repository.js";
import type { GithubSyncService } from "./github-sync.service.js";

export type GithubWebhookJobData = {
  deliveryId: string;
  event: string;
  action: string | null;
  payload: Record<string, unknown>;
};

export class GithubWebhookService {
  constructor(
    private readonly deliveries: GithubDeliveryRepository,
    private readonly connections: GithubConnectionRepository,
    private readonly repos: GithubRepoRepository,
    private readonly activity: GithubActivityRepository,
    private readonly sync: GithubSyncService,
  ) {}

  async accept(input: {
    rawBody: Buffer;
    signature: string | undefined;
    deliveryId: string | undefined;
    event: string | undefined;
  }): Promise<{ duplicate: true } | { accepted: true }> {
    if (
      !verifyGithubWebhookSignature(input.rawBody, input.signature, env.GITHUB_WEBHOOK_SECRET)
    ) {
      throw new AppError(401, "Invalid GitHub webhook signature");
    }
    if (!input.deliveryId || !input.event) {
      throw new AppError(400, "Missing delivery id or event");
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(input.rawBody.toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new AppError(400, "Invalid JSON body");
    }
    const action = typeof payload.action === "string" ? payload.action : null;
    const row = await this.deliveries.tryInsert({
      deliveryId: input.deliveryId,
      event: input.event,
      action,
    });
    if (!row) return { duplicate: true };

    await githubWebhookQueue.add("delivery", {
      deliveryId: input.deliveryId,
      event: input.event,
      action,
      payload,
    } satisfies GithubWebhookJobData);
    return { accepted: true };
  }

  async processJob(data: GithubWebhookJobData) {
    try {
      const installation = data.payload.installation as { id?: number } | undefined;
      const installationId: bigint | null =
        installation?.id != null ? BigInt(installation.id) : null;

      if (data.event === "ping") {
        await this.deliveries.markStatus(data.deliveryId, "processed");
        return;
      }

      if (data.event === "installation" && data.action === "deleted") {
        if (installationId) {
          await this.connections.deleteByInstallationId(installationId);
        }
        await this.deliveries.markStatus(data.deliveryId, "processed");
        return;
      }

      if (
        data.event === "installation" &&
        (data.action === "created" || data.action === "unsuspend")
      ) {
        if (installationId) {
          const conn = await this.connections.findByInstallationId(installationId);
          if (conn) {
            await this.sync.runSync(String(installationId), conn.teamId);
          }
        }
        await this.deliveries.markStatus(
          data.deliveryId,
          installationId ? "processed" : "ignored",
        );
        return;
      }

      if (!installationId) {
        await this.deliveries.markStatus(data.deliveryId, "ignored");
        return;
      }

      const conn = await this.connections.findByInstallationId(installationId);
      if (!conn) {
        await this.deliveries.markStatus(data.deliveryId, "ignored");
        return;
      }

      if (data.event === "installation_repositories") {
        await this.sync.runSync(String(installationId), conn.teamId);
        await this.deliveries.markStatus(data.deliveryId, "processed");
        return;
      }

      if (data.event === "push" || data.event === "pull_request" || data.event === "issues") {
        await this.recordActivity(conn.teamId, data);
        await redis.del(`github:activity:${conn.teamId}`);
        await this.deliveries.markStatus(data.deliveryId, "processed");
        return;
      }

      await this.deliveries.markStatus(data.deliveryId, "ignored");
    } catch (err) {
      await this.deliveries.markStatus(data.deliveryId, "failed");
      throw err;
    }
  }

  private async recordActivity(teamId: string, data: GithubWebhookJobData) {
    const repoPayload = data.payload.repository as
      | {
          id?: number;
          full_name?: string;
          html_url?: string;
          private?: boolean;
          default_branch?: string;
        }
      | undefined;
    let repoId: string | null = null;
    if (repoPayload?.id != null) {
      const conn = await this.connections.findByTeamId(teamId);
      if (conn) {
        await this.repos.bulkUpsert([
          {
            teamId,
            connectionId: conn.id,
            githubRepoId: BigInt(repoPayload.id),
            fullName: repoPayload.full_name ?? String(repoPayload.id),
            defaultBranch: repoPayload.default_branch ?? null,
            private: Boolean(repoPayload.private),
            htmlUrl: repoPayload.html_url ?? "",
          },
        ]);
        const row = await this.repos.findByTeamAndGithubId(teamId, BigInt(repoPayload.id));
        repoId = row?.id ?? null;
      }
    }

    const sender = data.payload.sender as { login?: string } | undefined;
    let title = data.event;
    let externalUrl: string | null = repoPayload?.html_url ?? null;
    let occurredAt = new Date();
    let meta: Prisma.InputJsonValue | undefined;

    if (data.event === "push") {
      const ref = String(data.payload.ref ?? "");
      const commits = data.payload.commits as unknown[] | undefined;
      title = `push ${ref} (${commits?.length ?? 0} commits)`;
      const headCommit = data.payload.head_commit as
        | { url?: string; timestamp?: string }
        | undefined;
      externalUrl = headCommit?.url ?? externalUrl;
      if (headCommit?.timestamp) occurredAt = new Date(headCommit.timestamp);
    } else if (data.event === "pull_request") {
      const pr = data.payload.pull_request as
        | {
            number?: number;
            title?: string;
            html_url?: string;
            updated_at?: string;
            state?: string;
            merged?: boolean;
          }
        | undefined;
      title = `PR #${pr?.number ?? "?"}: ${pr?.title ?? ""}`;
      externalUrl = pr?.html_url ?? externalUrl;
      if (pr?.updated_at) occurredAt = new Date(pr.updated_at);
      meta = { state: pr?.state, merged: pr?.merged };
    } else if (data.event === "issues") {
      const issue = data.payload.issue as
        | {
            number?: number;
            title?: string;
            html_url?: string;
            updated_at?: string;
            state?: string;
          }
        | undefined;
      title = `Issue #${issue?.number ?? "?"}: ${issue?.title ?? ""}`;
      externalUrl = issue?.html_url ?? externalUrl;
      if (issue?.updated_at) occurredAt = new Date(issue.updated_at);
      meta = { state: issue?.state };
    }

    await this.activity.upsertByDedupeKey({
      teamId,
      repoId,
      eventType: data.event,
      action: data.action,
      actorLogin: sender?.login ?? null,
      title: title.slice(0, 500),
      externalUrl,
      occurredAt,
      dedupeKey: data.deliveryId,
      meta,
    });
  }
}
