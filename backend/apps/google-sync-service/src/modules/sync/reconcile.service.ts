import { prismaRead } from "@manage-teams/db";
import { createLogger } from "@manage-teams/lib";
import { contentHash, enqueueTaskPush } from "./sync.service.js";
import { parseStoredPayload } from "./sync-fields.js";
import { composePushNotes } from "./notes-split.js";

const logger = createLogger("google-sync-service");

/**
 * Reconcile định kỳ (Phase 2): so DB task với contentHash trên link;
 * lệch → enqueue TASKS_PUSH.
 */
export async function reconcileStaleLinks(limit = 50): Promise<{ checked: number; enqueued: number }> {
  const links = await prismaRead.googleTaskLink.findMany({
    where: { status: "LINKED" },
    take: limit,
    orderBy: { updatedAt: "asc" },
    include: {
      task: {
        include: {
          assignees: true,
        },
      },
    },
  });

  let enqueued = 0;
  for (const link of links) {
    const task = link.task;
    if (!task || task.deletedAt) continue;
    const assignee = task.assignees.find((a) => a.userId === link.userId);
    const status = assignee?.status === "DONE" || task.status === "DONE" ? "DONE" : task.status;
    const notes = composePushNotes(task.id, assignee?.personalNote);
    const next = { title: task.title, notes, status };
    const hash = contentHash(next);
    const prev = parseStoredPayload(link.contentHash);
    const prevHash = contentHash({
      title: prev.title ?? "",
      notes: prev.notes ?? "",
      status: prev.status ?? "TODO",
    });
    if (hash === prevHash || (link.contentHash && link.contentHash === JSON.stringify(next))) {
      continue;
    }
    // contentHash trên link đôi khi là JSON raw — so sánh field
    if (
      prev.title === next.title &&
      prev.notes === next.notes &&
      (prev.status ?? "TODO") === next.status
    ) {
      continue;
    }
    await enqueueTaskPush({
      userId: link.userId,
      taskId: task.id,
      title: task.title,
      notes: assignee?.personalNote ?? "",
      status,
    });
    enqueued += 1;
  }

  logger.info({ checked: links.length, enqueued }, "reconcile stale google links");
  return { checked: links.length, enqueued };
}
