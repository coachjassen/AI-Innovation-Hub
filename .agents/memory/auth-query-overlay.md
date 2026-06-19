---
name: Handled 401s surfacing as fatal Vite overlay
description: Why post-login auth refetches must not use dangling promise chains
---

# Dangling query promises surface handled 401s as fatal overlays

`customFetch` (lib/api-client-react) throws `ApiError` on any non-ok response,
including expected 401s from `/api/auth/me`. TanStack Query catches errors from
hooks/observers, but a manual `queryClient.fetchQuery(...).then(...)` WITHOUT a
`.catch()` turns a rejection into an unhandled promise rejection. Replit's Vite
`runtime-error-plugin` then shows it as a fatal full-screen overlay even though
the 401 is benign.

**Rule:** For POC auto-login, after the request-link mutation succeeds, call
`queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })` and let the
existing `useGetMe` observer refetch + a `useEffect` handle the role-based
redirect. Do not use a manual `fetchQuery().then(reload)` chain.

**Why:** Avoids both the unhandled-rejection overlay and a fragile timing/reload
dance. Observer-driven refetch is the idiomatic TanStack Query pattern.

**How to apply:** Any time you need to react to a mutation that changes auth/session
state, invalidate the relevant query key rather than imperatively fetching +
reloading. If you must use fetchQuery imperatively, always attach `.catch()`.
