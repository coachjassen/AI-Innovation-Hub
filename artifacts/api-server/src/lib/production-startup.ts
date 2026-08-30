import { pool } from "@workspace/db";
import { logger } from "./logger";

const HUB_REGISTRATION_SCHEMA_STATEMENTS = [
  `ALTER TABLE circles
    ADD COLUMN IF NOT EXISTS registration_description text,
    ADD COLUMN IF NOT EXISTS registration_open boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS registration_token_hash text`,
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

export async function ensureHubRegistrationSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of HUB_REGISTRATION_SCHEMA_STATEMENTS) {
      await client.query(statement);
    }
    await client.query("COMMIT");
    logger.info("Hub registration schema is ready");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
