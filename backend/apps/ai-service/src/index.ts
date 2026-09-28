import { createLogger } from "@manage-teams/lib";
import { createApp } from "./app.js";

const logger = createLogger("ai-service");
const port = Number(process.env.PORT ?? 3205);

const app = createApp();
app.listen(port, () => logger.info({ port }, "ai-service listening"));
