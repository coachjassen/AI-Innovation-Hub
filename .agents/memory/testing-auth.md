---
name: Testing protected API routes
description: How to exercise session-protected endpoints from the shell in this repo
---

Session cookie is `Secure`, so it is only set/sent over HTTPS.

**Rule:** Test protected routes against `https://$REPLIT_DEV_DOMAIN` with a cookie jar
(`curl -c jar -b jar`), NOT `localhost:80` (plain HTTP drops the Secure cookie → 401).

**Why:** express-session is configured with a Secure cookie; the screenshot tool's
browser session is separate from your curl jar, so an authenticated page may still
render the login screen in a screenshot even though the API works.

POC login shortcut: `POST /api/auth/request-link {email}` creates a session directly
(no SMTP). Demo admin: admin@demo.com.
