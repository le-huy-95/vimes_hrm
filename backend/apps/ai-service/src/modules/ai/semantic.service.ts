import { prismaRead, prismaWrite, Prisma } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";

/** Mock bag-of-words embedding (6c stub — thay bằng Voyage/pgvector sau). */
export function mockEmbed(text: string): number[] {
  const vec = new Array(32).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const t of tokens) {
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    vec[h % 32] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

/** Index một message (FTS đã có; embedding stub). */
export async function indexMessageEmbedding(input: {
  messageId: string;
  groupId: string | null;
  text: string;
}) {
  const embedding = mockEmbed(input.text);
  await prismaWrite.contentEmbedding.upsert({
    where: {
      entityType_entityId: { entityType: "message", entityId: input.messageId },
    },
    create: {
      entityType: "message",
      entityId: input.messageId,
      groupId: input.groupId,
      chunkText: input.text.slice(0, 2000),
      embedding,
    },
    update: {
      chunkText: input.text.slice(0, 2000),
      embedding,
      groupId: input.groupId,
      updatedAt: new Date(),
    },
  });
}

/** Hybrid: FTS trong group + cosine stub trên embeddings. */
export async function searchMessagesSemantic(input: {
  userId: string;
  q: string;
  limit?: number;
}) {
  const q = input.q.trim();
  if (q.length < 2) throw new AppError("Query quá ngắn", "VALIDATION", 400);
  const limit = Math.min(input.limit ?? 20, 50);

  const memberships = await prismaRead.groupMember.findMany({
    where: { userId: input.userId, status: "ACTIVE" },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);
  if (groupIds.length === 0) return { messages: [] as const, mode: "empty" as const };

  const queryVec = mockEmbed(q);
  const rows = await prismaRead.contentEmbedding.findMany({
    where: { entityType: "message", groupId: { in: groupIds } },
    take: 200,
  });

  const scored = rows
    .map((r) => {
      const emb = Array.isArray(r.embedding) ? (r.embedding as number[]) : [];
      return {
        entityId: r.entityId,
        groupId: r.groupId,
        chunkText: r.chunkText,
        score: cosine(queryVec, emb),
      };
    })
    .filter((r) => r.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Fallback FTS nếu chưa có embedding
  if (scored.length === 0) {
    const fts = await prismaRead.$queryRaw<
      Array<{ id: string; body: string; conversation_id: string }>
    >`
      SELECT m.id, m.body, m.conversation_id
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.deleted_at IS NULL
        AND c.group_id IN (${Prisma.join(groupIds)})
        AND m.body_tsv @@ plainto_tsquery('simple', unaccent(${q}))
      ORDER BY m.seq DESC
      LIMIT ${limit}
    `;
    return {
      mode: "fts" as const,
      messages: fts.map((m) => ({
        id: m.id,
        body: m.body,
        conversationId: m.conversation_id,
        score: null as number | null,
      })),
    };
  }

  return {
    mode: "vector_stub" as const,
    messages: scored.map((m) => ({
      id: m.entityId,
      body: m.chunkText,
      groupId: m.groupId,
      score: m.score,
    })),
  };
}
