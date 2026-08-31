import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import {
  decryptRegistrationToken,
  rewrapRegistrationToken,
  validateRegistrationLinkEncryptionConfig,
} from "./registration-link-crypto";

const HUB_REGISTRATION_SCHEMA_STATEMENTS = [
  `ALTER TABLE circles
    ADD COLUMN IF NOT EXISTS registration_description text,
    ADD COLUMN IF NOT EXISTS registration_open boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS registration_token_hash text,
    ADD COLUMN IF NOT EXISTS registration_token_encrypted text`,
  `CREATE TABLE IF NOT EXISTS hub_registrations (
    id serial PRIMARY KEY,
    circle_id integer NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    name text NOT NULL,
    email text NOT NULL,
    company text NOT NULL DEFAULT '',
    attendee_id integer REFERENCES attendees(id) ON DELETE SET NULL,
    promoted_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hub_registrations_circle_id_email_unique
    ON hub_registrations (circle_id, email)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS circles_registration_token_hash_unique
    ON circles (registration_token_hash)
    WHERE registration_token_hash IS NOT NULL`,
] as const;

function normalizeApplicationOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "APP_URL/PUBLIC_APP_URL must be a credential-free HTTPS origin without a path, query, or fragment",
    );
  }
  return url.origin;
}

export function validateSelfHostedApplicationUrl(): string | null {
  const appUrl = process.env.APP_URL;
  const publicAppUrl = process.env.PUBLIC_APP_URL;
  const configured = appUrl ?? publicAppUrl;
  const selfHostedProduction =
    process.env.NODE_ENV === "production" && process.env.REPL_ID === undefined;

  if (!configured) {
    if (selfHostedProduction) {
      throw new Error(
        "Set APP_URL (or PUBLIC_APP_URL) to the canonical public HTTPS origin before starting the self-hosted API",
      );
    }
    return null;
  }

  const origin = normalizeApplicationOrigin(configured);
  if (appUrl && publicAppUrl) {
    const publicOrigin = normalizeApplicationOrigin(publicAppUrl);
    if (origin !== publicOrigin) {
      throw new Error(
        "APP_URL and PUBLIC_APP_URL must identify the same public HTTPS origin",
      );
    }
  }

  logger.info(
    { applicationOrigin: origin },
    "Validated public application origin",
  );
  return origin;
}

export function validateProductionSecrets(): void {
  validateRegistrationLinkEncryptionConfig();
}

export async function ensureHubRegistrationSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of HUB_REGISTRATION_SCHEMA_STATEMENTS) {
      await client.query(statement);
    }
    const encryptedLinks = await client.query<{
      id: number;
      registration_token_hash: string;
      registration_token_encrypted: string;
    }>(
      `SELECT id, registration_token_hash, registration_token_encrypted
       FROM circles
       WHERE registration_token_hash IS NOT NULL
         AND registration_token_encrypted IS NOT NULL`,
    );
    let rewrappedCount = 0;
    for (const link of encryptedLinks.rows) {
      const token = decryptRegistrationToken(link.registration_token_encrypted);
      if (!token) continue;
      const tokenHash = createHash("sha256").update(token).digest("hex");
      if (tokenHash !== link.registration_token_hash) {
        throw new Error(`Saved registration link integrity check failed for Hub ${link.id}`);
      }
      const rewrapped = rewrapRegistrationToken(link.registration_token_encrypted);
      if (rewrapped && rewrapped !== link.registration_token_encrypted) {
        await client.query(
          `UPDATE circles
           SET registration_token_encrypted = $1
           WHERE id = $2 AND registration_token_encrypted = $3`,
          [rewrapped, link.id, link.registration_token_encrypted],
        );
        rewrappedCount += 1;
      }
    }
    await client.query("COMMIT");
    logger.info({ rewrappedCount }, "Hub registration schema is ready");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
