---
name: drizzle-kit push prompts without a TTY
description: Why `pnpm --filter @workspace/db run push` fails non-interactively, and the workaround
---

`drizzle-kit push` (and `push-force`) fail in the agent shell with "Interactive prompts require a TTY terminal". It hits the create/rename `tablesResolver` prompt on **every** push, even for a brand-new unrelated table.

**Why:** connect-pg-simple creates a `session` (singular) table that is NOT in the Drizzle schema. drizzle sees a schema table it can't match and asks "is <new table> a rename of `session`?" `--force` only auto-confirms data-loss statements, not this resolver, so it doesn't help.

**How to apply:** When adding a new table in this repo, apply the equivalent `CREATE TABLE ...` DDL directly against `process.env.DATABASE_URL` (e.g. a tiny `node -e` with `pg.Pool`) matching the Drizzle column definitions, instead of relying on `push`. Keep the schema file + barrel export as the source of truth.
