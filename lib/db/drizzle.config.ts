import { defineConfig } from "drizzle-kit";
import path from "path";
import { fileURLToPath } from "url";

// fileURLToPath is used instead of import.meta.dirname because drizzle-kit
// runs this config through its own bundler where import.meta.dirname is undefined.
const configDir = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the repo root when DATABASE_URL isn't already in the
// environment (i.e. when running outside Replit / outside PM2).
// process.loadEnvFile() is built into Node.js 22.9+ — no extra packages needed.
if (!process.env.DATABASE_URL) {
  const candidates = [
    path.resolve(configDir, "../../.env"),  // lib/db/ → repo root
    path.resolve(process.cwd(), ".env"),    // wherever the command was run from
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

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
