import { Kafka, logLevel, type Consumer, type Producer, type EachMessagePayload } from "kafkajs";
import type { Logger } from "@manage-teams/common";
import { type EventEnvelope, parseEnvelope } from "@manage-teams/contracts";

export type KafkaClientOptions = {
  clientId: string;
  brokers: string[];
  logger: Logger;
};

export function createKafka(opts: KafkaClientOptions): Kafka {
  return new Kafka({
    clientId: opts.clientId,
    brokers: opts.brokers,
    logLevel: logLevel.ERROR,
  });
}

export async function createProducer(kafka: Kafka): Promise<Producer> {
  const producer = kafka.producer();
  await producer.connect();
  return producer;
}

export async function publishEnvelope(
  producer: Producer,
  topic: string,
  envelope: EventEnvelope,
): Promise<void> {
  await producer.send({
    topic,
    messages: [
      {
        key: envelope.aggregateId,
        value: JSON.stringify(envelope),
        headers: {
          correlationId: envelope.correlationId,
          eventId: envelope.eventId,
          eventType: envelope.eventType,
        },
      },
    ],
  });
}

export type EnvelopeHandler = (envelope: EventEnvelope, raw: EachMessagePayload) => Promise<void>;

export async function runConsumer(opts: {
  kafka: Kafka;
  groupId: string;
  topic: string;
  handler: EnvelopeHandler;
  logger: Logger;
}): Promise<Consumer> {
  const consumer = opts.kafka.consumer({ groupId: opts.groupId });
  await consumer.connect();
  await consumer.subscribe({ topic: opts.topic, fromBeginning: true });
  await consumer.run({
    eachMessage: async (payload) => {
      const value = payload.message.value?.toString("utf8");
      if (!value) return;
      try {
        const envelope = parseEnvelope(JSON.parse(value));
        await opts.handler(envelope, payload);
      } catch (err) {
        opts.logger.error({ err, topic: opts.topic }, "failed to process message");
        throw err;
      }
    },
  });
  return consumer;
}
