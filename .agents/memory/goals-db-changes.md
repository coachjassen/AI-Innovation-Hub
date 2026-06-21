---
name: Goals DB schema changes
description: Why drizzle push fails here and how to apply schema changes to the goals table
---

# Applying DB schema changes (goals table)

`pnpm --filter @workspace/db run push` is unusable in this environment:
1. It needs an interactive TTY (fails non-interactively).
2. It wants to DROP the `sessions` table used by `connect-pg-simple` (not part of
   the drizzle schema), which would destroy live session data.

**How to apply:** edit the drizzle schema for type-correctness, then make the real
DB change with raw SQL via the database tooling, e.g.
`ALTER TABLE goals ADD COLUMN IF NOT EXISTS ...` or
`ALTER TABLE goals ALTER COLUMN due_date TYPE date USING due_date::date;`.
Keep the drizzle schema and the actual column in sync manually.
