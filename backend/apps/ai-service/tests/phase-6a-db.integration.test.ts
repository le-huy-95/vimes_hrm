/**
 * Integration against real Postgres when DATABASE_URL is reachable.
 * Covers permission isolation + open-task listing + link resolver via createPrismaAccessCheck.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const dbUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

describe.runIf(Boolean(dbUrl))("Phase 6a DB integration", () => {
  let prismaRead: typeof import("@manage-teams/db").prismaRead;
  let prismaWrite: typeof import("@manage-teams/db").prismaWrite;
  let listMyTasks: typeof import("../src/modules/ai/tools/read-tools.js").listMyTasks;
  let getGroup: typeof import("../src/modules/ai/tools/read-tools.js").getGroup;
  let createPrismaAccessCheck: typeof import("../src/modules/ai/link-resolver.js").createPrismaAccessCheck;
  let resolveLinks: typeof import("../src/modules/ai/link-resolver.js").resolveLinks;
  let runChat: typeof import("../src/modules/ai/orchestrator.js").runChat;
  let MockPlanner: typeof import("../src/modules/ai/providers/mock.js").MockPlanner;

  const ids = {
    org: randomUUID(),
    userA: randomUUID(),
    userB: randomUUID(),
    groupA: randomUUID(),
    groupB: randomUUID(),
    taskA: randomUUID(),
    taskB: randomUUID(),
    taskDone: randomUUID(),
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl!;
    process.env.POSTGRES_URL = dbUrl!;
    process.env.APP_PUBLIC_URL = "http://test.app";
    process.env.AI_PROVIDER = "mock";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    ({ prismaRead, prismaWrite } = await import("@manage-teams/db"));
    ({ listMyTasks, getGroup } = await import("../src/modules/ai/tools/read-tools.js"));
    ({ createPrismaAccessCheck, resolveLinks } = await import("../src/modules/ai/link-resolver.js"));
    ({ runChat } = await import("../src/modules/ai/orchestrator.js"));
    ({ MockPlanner } = await import("../src/modules/ai/providers/mock.js"));

    await prismaWrite.user.createMany({
      data: [
        { id: ids.userA, email: `a-${ids.userA}@test.local`, displayName: "User A" },
        { id: ids.userB, email: `b-${ids.userB}@test.local`, displayName: "User B" },
      ],
    });
    await prismaWrite.organization.create({
      data: { id: ids.org, name: `Org ${ids.org.slice(0, 8)}` },
    });
    await prismaWrite.group.createMany({
      data: [
        { id: ids.groupA, organizationId: ids.org, name: "Group A" },
        { id: ids.groupB, organizationId: ids.org, name: "Group B" },
      ],
    });
    await prismaWrite.groupMember.createMany({
      data: [
        { groupId: ids.groupA, userId: ids.userA, role: "OWNER", status: "ACTIVE" },
        { groupId: ids.groupB, userId: ids.userB, role: "OWNER", status: "ACTIVE" },
      ],
    });
    await prismaWrite.task.createMany({
      data: [
        {
          id: ids.taskA,
          groupId: ids.groupA,
          code: "TA-1",
          title: "Open A",
          status: "TODO",
        },
        {
          id: ids.taskB,
          groupId: ids.groupB,
          code: "TB-1",
          title: "Open B secret",
          status: "TODO",
        },
        {
          id: ids.taskDone,
          groupId: ids.groupA,
          code: "TA-DONE",
          title: "Done A",
          status: "DONE",
        },
      ],
    });
    await prismaWrite.taskAssignee.createMany({
      data: [
        { taskId: ids.taskA, userId: ids.userA, status: "ACTIVE" },
        { taskId: ids.taskB, userId: ids.userB, status: "ACTIVE" },
        { taskId: ids.taskDone, userId: ids.userA, status: "DONE" },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    // order: assignees → tasks → members → groups → org → users / ai
    await prismaWrite.taskAssignee.deleteMany({
      where: { taskId: { in: [ids.taskA, ids.taskB, ids.taskDone] } },
    });
    await prismaWrite.task.deleteMany({
      where: { id: { in: [ids.taskA, ids.taskB, ids.taskDone] } },
    });
    await prismaWrite.groupMember.deleteMany({
      where: { groupId: { in: [ids.groupA, ids.groupB] } },
    });
    await prismaWrite.aiAudit.deleteMany({ where: { userId: { in: [ids.userA, ids.userB] } } });
    await prismaWrite.aiSession.deleteMany({ where: { userId: { in: [ids.userA, ids.userB] } } });
    await prismaWrite.group.deleteMany({ where: { id: { in: [ids.groupA, ids.groupB] } } });
    await prismaWrite.organization.deleteMany({ where: { id: ids.org } });
    await prismaWrite.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB] } } });
  }, 60_000);

  it("list_my_tasks openOnly: user A sees only open task in group A", async () => {
    const r = await listMyTasks({ userId: ids.userA }, { openOnly: true });
    const rows = r.data as Array<{ id: string; code: string }>;
    expect(rows.map((t) => t.id)).toContain(ids.taskA);
    expect(rows.map((t) => t.id)).not.toContain(ids.taskB);
    expect(rows.map((t) => t.id)).not.toContain(ids.taskDone);
  });

  it("list_my_tasks openOnly=false can include DONE", async () => {
    const r = await listMyTasks({ userId: ids.userA }, { openOnly: false });
    const idsFound = (r.data as Array<{ id: string }>).map((t) => t.id);
    expect(idsFound).toContain(ids.taskDone);
  });

  it("get_group denies cross-group", async () => {
    const denied = await getGroup({ userId: ids.userA }, { groupId: ids.groupB });
    expect(denied.data).toBeNull();
    const ok = await getGroup({ userId: ids.userA }, { groupId: ids.groupA });
    expect(ok.data).toMatchObject({ id: ids.groupA, name: "Group A" });
  });

  it("link resolver drops task from other group for user A", async () => {
    const check = createPrismaAccessCheck(ids.userA);
    const links = await resolveLinks(
      "http://test.app",
      [
        {
          type: "task",
          id: ids.taskA,
          groupId: ids.groupA,
          code: "TA-1",
          label: "A",
        },
        {
          type: "task",
          id: ids.taskB,
          groupId: ids.groupB,
          code: "TB-1",
          label: "B leak",
        },
      ],
      check,
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.id).toBe(ids.taskA);
    expect(links[0]?.href).toBe(`http://test.app/groups/${ids.groupA}/tasks/TA-1`);
  });

  it("runChat mock: open tasks question returns only A's links + audit via", async () => {
    const result = await runChat({
      userId: ids.userA,
      message: "Việc nào của tôi đang mở? Cho link",
      provider: new MockPlanner(),
    });
    expect(result.mock).toBe(true);
    expect(result.provider).toBe("mock");
    expect(result.toolsUsed).toContain("list_my_tasks");
    expect(result.links.every((l) => l.id !== ids.taskB)).toBe(true);
    expect(result.links.some((l) => l.id === ids.taskA)).toBe(true);

    const audit = await prismaRead.aiAudit.findFirst({
      where: { sessionId: result.sessionId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.payload).toMatchObject({
      via: "ai-assistant",
      provider: "mock",
      mock: true,
    });
  });

  it("runChat empty message → VALIDATION 400", async () => {
    await expect(runChat({ userId: ids.userA, message: "   " })).rejects.toMatchObject({
      code: "VALIDATION",
      statusCode: 400,
    });
  });

  it("runChat unknown session → NOT_FOUND 404", async () => {
    await expect(
      runChat({
        userId: ids.userA,
        message: "hi",
        sessionId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
  });

  it("runChat session owned by other user → NOT_FOUND", async () => {
    const s = await prismaWrite.aiSession.create({
      data: { userId: ids.userB, title: "B session" },
    });
    await expect(
      runChat({ userId: ids.userA, message: "hi", sessionId: s.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
