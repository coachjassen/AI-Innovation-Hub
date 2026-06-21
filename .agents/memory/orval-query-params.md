---
name: Orval generated hooks — query params & options gotchas
description: Pitfalls when adding an OpenAPI query param to an endpoint and wiring it into generated React Query hooks
---

# Orval generated hooks: query params & options

Two non-obvious traps when wiring filters into the Orval-generated React Query hooks in this repo.

## 1. Adding a query param shifts the hook signature

When an OpenAPI operation has **no** query params, Orval generates `useFoo(options?)` — options is the FIRST arg.
The moment you add ANY query param, it becomes `useFoo(params?, options?)` — params is now first, options second.

**Consequence:** existing call sites that passed `useFoo({ query: { queryKey: ... } })` (options-as-first-arg) silently
break with `TS2353: 'query' does not exist in type FooParams` after you add the param. You must rewrite every existing
call to `useFoo(undefined, { query: { ... } })` (or pass real params first).

**Why:** this bit us adding `circleId` to `listMeetings` and `getGoalsSummary` — attendee pages that called them with
options-first started failing typecheck even though that code wasn't touched.

## 2. `enabled` alone in query options fails typecheck — queryKey is required

The generated `UseQueryOptions` type in this repo **requires** `queryKey`. You cannot pass just
`{ query: { enabled: x } }` — it errors `TS2741: Property 'queryKey' is missing`. (The pre-existing
`useGetMe({ query: { retry: false } })` calls show the same error.)

**How to apply:** when you need `enabled` (e.g. to gate a query until an active id resolves), also pass the key:
`{ query: { enabled: id !== null, queryKey: getFooQueryKey(params) } }`. Every list/detail op has a
`getXxxQueryKey(params)` helper exported alongside its hook.

## Cache-key pattern for per-filter isolation

Pass the filter via the `params` arg (don't override queryKey with the no-arg `getXxxQueryKey()`), so each filter value
gets its own cache entry. Invalidations elsewhere that use the no-arg `getXxxQueryKey()` still work — they match all
param variants by prefix.
