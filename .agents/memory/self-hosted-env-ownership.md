---
name: Self-hosted environment ownership
description: Permission requirement for the production environment file used by the self-hosted update process.
---

The self-hosted update process runs as the deployment account. An owner-only production environment file must be owned by that same account; root ownership causes the update script to fail with permission denied.

**Why:** Restricting the file to mode 600 is appropriate for secrets, but ownership must match the account executing updates. Correcting ownership restored the update process.

**How to apply:** Keep the environment file owner-readable only and verify ownership after privileged edits or file replacement. Do not broaden permissions to make updates work.