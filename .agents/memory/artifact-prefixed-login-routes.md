---
name: Artifact-prefixed routes
description: Handling protected and public routes when the artifact preview proxy includes a path prefix that Vite does not report as its base.
---

Normalize a matching artifact directory prefix before both route matching and authorization checks. Secure login pages must remain reachable before the authenticated layout runs, and protected routes must still resolve to their intended pages.

**Why:** In the preview environment, an initial URL can include the artifact path while Vite exposes `/` as its base. Without normalization, public magic links can be intercepted by the protected layout and nested protected pages can fall through to the 404 route or bypass prefix-sensitive access checks.

**How to apply:** Recognize prefixed public routes before the protected layout, and use the same internal path normalization in the app router, protected-route guards, active navigation, and `returnTo` values. Keep root-hosted/self-hosted URLs working too.