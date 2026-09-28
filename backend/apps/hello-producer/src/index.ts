import express from "express";
import { buildHealth, createLogger } from "@manage-teams/common";
import { TOPICS } from "@manage-teams/contracts";
import { createKafka, createProducer, publishEnvelope } from "@manage-teams/kafka-client";
import { InMemoryOutbox } from "@manage-teams/outbox";
import { buildHelloEnvelope, relayOutbox } from "./hello.js";

const serviceName = "hello-producer";
const logger = createLogger(serviceName);
const outbox = new InMemoryOutbox();
const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const port = Number(process.env.PORT ?? 3101);

async function main() {
  const kafka = createKafka({ clientId: serviceName, brokers, logger });
  const producer = await createProducer(kafka);

  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => res.json(buildHealth(serviceName)));

  app.post("/hello", async (req, res) => {
    const message = typeof req.body?.message === "string" ? req.body.message : "hello";
    const envelope = buildHelloEnvelope(message);
    outbox.enqueue(TOPICS.helloEvents, envelope);
    const published = await relayOutbox(outbox, (topic, env) =>
      publishEnvelope(producer, topic, env),
    );
    logger.info({ eventId: envelope.eventId, published }, "hello published");
    res.status(202).json({ eventId: envelope.eventId, published });
  });

  app.listen(port, () => logger.info({ port }, "hello-producer listening"));
}

main().catch((err) => {
  logger.error({ err }, "fatal");
  process.exit(1);
});
