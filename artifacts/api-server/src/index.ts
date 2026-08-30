import path from "path";
import app from "./app";
import { logger } from "./lib/logger";
import {
  ensureHubRegistrationSchema,
  validateSelfHostedApplicationUrl,
} from "./lib/production-startup";
import { runRecoveryBootstrap } from "./lib/recovery-bootstrap";

// Auto-load .env from the repo root when env vars aren't already set
// (i.e. when running outside Replit/a managed environment).
// process.loadEnvFile() is built into Node.js 22.9+ — no extra packages needed.
if (!process.env["DATABASE_URL"] || !process.env["SESSION_SECRET"]) {
  const candidates = [
    path.resolve(__dirname, "../../.env"), // dist/ → repo root
    path.resolve(process.cwd(), ".env"), // wherever PM2 was launched from
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
