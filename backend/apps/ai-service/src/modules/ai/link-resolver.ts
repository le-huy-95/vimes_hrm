import { prismaRead } from "@manage-teams/db";

export type LinkCandidate = {
  type: string;
  id: string;
  label: string;
  groupId?: string;
  code?: string;
};

export type AiLink = {
  type: string;
  id: string;
  href: string;
  label: string;
};

export type AccessCheck = (c: LinkCandidate) => Promise<boolean>;

export function buildEntityHref(
  appPublicUrl: string,
  c: Pick<LinkCandidate, "type" | "id" | "groupId" | "code">,
): string | null {
  const base = appPublicUrl.replace(/\/$/, "");
  if (c.type === "task" && c.groupId && c.code) {
    return `${base}/groups/${c.groupId}/tasks/${c.code}`;
  }
  if (c.type === "group") return `${base}/groups/${c.id}`;
  if (c.type === "conversation") return `${base}/conversations/${c.id}`;
  return null;
}

export async function resolveLinks(
  appPublicUrl: string,
  candidates: LinkCandidate[],
  checkAccess: AccessCheck,
): Promise<AiLink[]> {
  const out: AiLink[] = [];
  for (const c of candidates) {
    if (!(await checkAccess(c))) continue;
    const href = buildEntityHref(appPublicUrl, c);
    if (!href) continue;
    out.push({ type: c.type, id: c.id, href, label: c.label });
  }
  return out;
}

/** Prisma-backed access check for orchestrator (membership / conversation). */
export function createPrismaAccessCheck(userId: string): AccessCheck {
  return async (c) => {
    if (c.type === "task") {
      const task = await prismaRead.task.findFirst({
        where: {
          id: c.id,
          deletedAt: null,
          group: { members: { some: { userId, status: "ACTIVE" } } },
        },
        select: { id: true },
      });
      return Boolean(task);
    }
    if (c.type === "group") {
      const m = await prismaRead.groupMember.findFirst({
        where: { groupId: c.id, userId, status: "ACTIVE" },
        select: { userId: true },
      });
      return Boolean(m);
    }
    if (c.type === "conversation") {
      const m = await prismaRead.conversationMember.findFirst({
        where: { conversationId: c.id, userId, status: "ACTIVE" },
        select: { userId: true },
      });
      return Boolean(m);
    }
    return false;
  };
}
