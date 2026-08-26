# Kinetics Group Innovation Hubs

A full-stack web app for a consulting firm's recurring client forum — manages hubs (a.k.a. "circles" in code/DB), meetings, goals, surveys, suggestions, and member invitations across Attendee and Admin roles.

> **Naming note:** The product is branded "Kinetics Group Innovation Hubs" and the user-facing term is "Hub". Internally the domain is still called `circle` everywhere (DB tables, API routes `/api/circles`, hooks like `useListCircles`, `CircleContext`). Only display strings were renamed to "Hub".

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — express-session secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind, shadcn/ui, wouter, TanStack Query
- API: Express 5 + express-session (pg store)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Build: esbuild (ESM bundle)
- Storage: Replit Object Storage (for file uploads)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth API contract
- `lib/db/src/schema/` — Drizzle ORM schema (circles, attendees, meetings, goals, surveys, suggestions, invites, magicTokens)
- `lib/api-client-react/src/generated/` — Orval-generated React Query hooks + Zod schemas
- `artifacts/api-server/src/routes/` — Express route handlers (one file per domain)
- `artifacts/api-server/src/lib/` — email delivery, magic-link/session helpers, object storage
- `artifacts/ai-innovation-circle/src/pages/` — React pages (attendee/ and admin/ subdirs)
- `scripts/ensure-admin.sql` — idempotent self-hosted bootstrap for the confirmed administrator account
- `scripts/ensure-one-off-invitation-schema.sql` — idempotent additive schema update for self-hosted one-off invitation support

## Architecture decisions

- **Authentication:** Default sign-in uses `POST /api/auth/request-link` to issue a hashed, single-use, one-hour email link; the session is created only when `POST /api/auth/verify` redeems it. Self-hosted deployments can explicitly opt into `AUTH_MODE=direct_admin`, which allows email-only sessions for existing administrator accounts only.
- **Session store:** `connect-pg-simple` backed by a `sessions` table in Postgres. Both the `session` and `sessions` tables exist in the DB.
- **Invitation files:** Replit deployments use App Storage; self-hosted deployments use the local filesystem. Set `LOCAL_OBJECT_STORAGE_DIR` to a persistent, PM2-writable directory (for example `/var/lib/kinetics-hubs/private-objects`).
- **API-first:** All contracts live in OpenAPI spec; Orval generates typed hooks used by the frontend. Never hand-write fetch calls in the UI.
- **Email configuration:** Sign-in links and attendee notifications require SMTP. The app returns an explicit configuration/delivery error when SMTP is unavailable; it never claims a message was sent.
- **Express 5 wildcard routes:** Use `/{*splat}` syntax; always check `Array.isArray(req.params.id)` before parsing IDs.

## Product

- **Attendee view:** Manage personal goals (create/update/delete/filter), browse past meetings with notes/insights, submit topic suggestions, invite colleagues.
- **Admin view:** Dashboard with circle KPIs and goal progress chart, all-attendees goals view (grouped by person), meeting CRUD, attendee roster, suggestions inbox, invitation approval queue, email trigger panel (reminder + post-meeting survey).
- **Auth:** Attendees request a secure email link and return to their intended protected page after verification. When the self-hosted direct-admin mode is enabled, only existing administrator accounts can sign in without email; navigation remains role-based.

## Demo accounts

- `admin@demo.com` — Admin (Sarah Chen, InnovateCo Consulting)
- `marcus@techvision.com` — Attendee (Marcus Webb, TechVision Corp)
- `priya@nexusai.com` — Attendee (Priya Sharma, Nexus AI Solutions)
- `james@bridgecap.com` — Attendee (James Okafor, Bridge Capital)

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change before touching frontend code.
- After adding a DB schema file, update `lib/db/src/schema/index.ts` exports, then run `pnpm --filter @workspace/db run push`.
- The `sessions` table in Postgres must exist before starting the API server (created by the initial DB push or manually).
- esbuild bundles everything — do NOT rely on `__dirname` or runtime file reads inside server code (this broke `connect-pg-simple`'s auto-create feature).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
