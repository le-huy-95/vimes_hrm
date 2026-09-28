import { createLogger } from "@manage-teams/common";
import { TOPICS } from "@manage-teams/contracts";
import { createKafka, createProducer, publishEnvelope } from "@manage-teams/kafka-client";
import { buildHelloEnvelope } from "./hello.js";

const logger = createLogger("hello-producer-once");

async function main() {
  const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
  const kafka = createKafka({ clientId: "hello-producer-once", brokers, logger });
  const producer = await createProducer(kafka);
  const envelope = buildHelloEnvelope(process.env.HELLO_MESSAGE ?? "hello-from-cli");
  await publishEnvelope(producer, TOPICS.helloEvents, envelope);
  logger.info({ eventId: envelope.eventId }, "sent");
  await producer.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
