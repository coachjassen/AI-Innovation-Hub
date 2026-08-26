---
name: Artifact-prefixed login routes
description: Handling secure login links when the artifact preview proxy includes a path prefix that Vite does not report as its base.
---

Secure login pages must remain reachable before the authenticated layout runs, including when an incoming preview URL has the artifact directory prefix.

**Why:** In the preview environment, an initial URL can include the artifact path while Vite exposes `/` as its base. If the router treats that login URL as a protected route, the layout redirects away and destroys the one-time token or return destination.

**How to apply:** Recognize the prefixed login URL before rendering protected routes. Normalize a matching artifact prefix from a protected route's `returnTo` value so successful verification navigates with an internal application path. Keep root-hosted/self-hosted URLs working too.