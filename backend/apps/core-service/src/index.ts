import { createLogger } from "@manage-teams/lib";
import { createApp } from "./app.js";

const logger = createLogger("core-service");
const port = Number(process.env.PORT ?? 3203);

const app = createApp();

app.listen(port, () => logger.info({ port }, "core-service listening"));
