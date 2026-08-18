import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import path from "path";
import * as schema from "./schema";

const { Pool } = pg;

// Auto-load .env from the repo root if DATABASE_URL isn't already set.
// process.loadEnvFile() is built into Node.js 22.9+ — no extra packages needed.
if (!process.env.DATABASE_URL) {
  const candidates = [
    path.resolve(import.meta.dirname, "../../../.env"),  // src/ → repo root
    path.resolve(process.cwd(), ".env"),                  // wherever the process was launched from
  ];
  for (const p of candidates) {
    try {
      (process as NodeJS.Process & { loadEnvFile?: (p: string) => void }).loadEnvFile?.(p);
      break;
    } catch {
      // File not found at this path — try the next candidate
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set.\n" +
    "Either:\n" +
    "  1. Copy .env.example to .env at the repo root and fill in your database URL, or\n" +
    "  2. Export DATABASE_URL before running: export DATABASE_URL=postgresql://..."
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
