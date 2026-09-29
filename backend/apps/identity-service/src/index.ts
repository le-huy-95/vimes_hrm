import { createLogger, ensureBackendEnvLoaded } from "@manage-teams/lib";
import { createApp } from "./app.js";

ensureBackendEnvLoaded();

const logger = createLogger("identity-service");
const port = Number(process.env.PORT ?? 3202);

const app = createApp();
app.listen(port, () =>
  logger.info(
    {
      port,
      googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
    },
    "identity-service listening",
  ),
);
