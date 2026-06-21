---
name: Testing secure-cookie sessions with curl
description: Why curl auth fails over localhost:80 and how to test session-protected endpoints
---

The API session cookie is configured `secure: true` + `sameSite: "none"` (see api-server app.ts session config). curl will NOT store a `Secure` cookie received over plain HTTP, so any test that logs in via `localhost:80` (the shared proxy, http) and then calls a protected route gets `401 Not authenticated` even though login returned 200.

**How to apply:** To test session-protected endpoints from the shell, hit the HTTPS dev domain instead: `B="https://$REPLIT_DEV_DOMAIN"` and pass both `-c $JAR -b $JAR` on every request (login + subsequent). Then the Secure cookie persists and auth works. The browser always uses HTTPS so this only bites curl/CLI testing.

Also: `python3` is not available in this environment — use `node -e` for JSON parsing in test scripts.
