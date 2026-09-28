import express from "express";
import { buildHealth, createLogger } from "@manage-teams/common";
import { TOPICS, type EventEnvelope } from "@manage-teams/contracts";
import { createKafka, runConsumer } from "@manage-teams/kafka-client";
import { handleHelloEvent, seen } from "./handler.js";

const serviceName = "hello-consumer";
const logger = createLogger(serviceName);
const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const port = Number(process.env.PORT ?? 3102);

async function main() {
  const kafka = createKafka({ clientId: serviceName, brokers, logger });
  await runConsumer({
    kafka,
    groupId: "hello-consumer",
    topic: TOPICS.helloEvents,
    logger,
    handler: async (envelope: EventEnvelope) => {
      handleHelloEvent(envelope);
    },
  });

  const app = express();
  app.get("/health", (_req, res) => res.json(buildHealth(serviceName)));
  app.get("/seen", (_req, res) => res.json({ count: seen.length, events: seen }));
  app.listen(port, () => logger.info({ port }, "hello-consumer listening"));
}

main().catch((err) => {
  logger.error({ err }, "fatal");
  process.exit(1);
});
