---
name: Hub vs Circle naming
description: The product is branded "Hubs" in the UI but "circle" everywhere in code/DB — do not rename identifiers.
---

# Hub (UI) vs Circle (code/DB)

The app is branded **"Kinetics Group Innovation Hubs"** and the user-facing noun is **"Hub"/"Hubs"**.
Internally the domain is still **`circle`** everywhere: DB tables (`circles`), API routes (`/api/circles`),
generated hooks (`useListCircles`, `useCreateCircle`), context (`CircleContext`, `useActiveCircle`),
and props (`circleId`, `activeCircleId`).

**Rule:** When asked to work on "Hubs", only change *display strings*. Never rename the `circle`
identifiers, tables, or routes — the OpenAPI spec, Orval codegen, and DB schema all depend on them.

**Why:** A user requested the "Circle → Hub" rebrand as display-only. Renaming identifiers would
cascade through the OpenAPI contract, codegen, and DB with high risk for zero user-visible benefit.

**How to apply:** The user route was migrated `/admin/circles` → `/admin/hubs` with a wouter
`<Redirect>` kept at the old path for back-compat. Any *new* user-facing copy should say "hub".
