import { z } from "zod";

export const ActorViaSchema = z.enum(["user", "ai-assistant", "google", "system"]);
export type ActorVia = z.infer<typeof ActorViaSchema>;

export const EventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  aggregateVersion: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
  correlationId: z.string().min(1),
  actor: z.object({
    userId: z.string().optional(),
    via: ActorViaSchema,
  }),
  payload: z.record(z.unknown()),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const TOPICS = {
  groupEvents: "group.events",
  taskEvents: "task.events",
  chatEvents: "chat.events",
  mediaEvents: "media.events",
  userEvents: "user.events",
  googleSyncCommands: "google.sync.commands",
  googleSignals: "google.signals",
  helloEvents: "hello.events",
} as const;

export function parseEnvelope(data: unknown): EventEnvelope {
  return EventEnvelopeSchema.parse(data);
}
