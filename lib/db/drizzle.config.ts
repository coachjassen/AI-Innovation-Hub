import { defineConfig } from "drizzle-kit";
import path from "path";

// Load .env from the repo root when DATABASE_URL isn't already in the
// environment (i.e. when running outside Replit / outside PM2).
// process.loadEnvFile() is built into Node.js 22.9+ — no extra packages needed.
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(import.meta.dirname, "../../.env");
    (process as NodeJS.Process & { loadEnvFile?: (p: string) => void }).loadEnvFile?.(envPath);
  } catch {
    // File doesn't exist — DATABASE_URL must be set another way
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
