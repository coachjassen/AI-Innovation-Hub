import path from "path";
import app from "./app";
import { logger } from "./lib/logger";
import {
  ensureHubRegistrationSchema,
  validateProductionSecrets,
  validateSelfHostedApplicationUrl,
} from "./lib/production-startup";
import { runRecoveryBootstrap } from "./lib/recovery-bootstrap";

// Auto-load .env when running outside Replit/a managed environment. Node's
// loader preserves variables already supplied by PM2/the host, while filling
// in values that exist only in the file.
// process.loadEnvFile() is built into Node.js 22.9+ — no extra packages needed.
const candidates = [
  path.resolve(process.cwd(), ".env"), // wherever PM2 was launched from
  path.resolve(__dirname, "../../../.env"), // api-server/dist/ → repo root
];
for (const p of candidates) {
  try {
    (
      process as NodeJS.Process & { loadEnvFile?: (p: string) => void }
    ).loadEnvFile?.(p);
    break;
  } catch {
    // File not found at this path — try the next candidate
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

Promise.resolve()
  .then(() => validateProductionSecrets())
  .then(() => validateSelfHostedApplicationUrl())
  .then(() => ensureHubRegistrationSchema())
  .then(() => runRecoveryBootstrap())
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  })
  .catch((error) => {
    logger.error({ err: error }, "API startup failed");
    process.exit(1);
  });
