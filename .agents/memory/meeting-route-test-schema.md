---
name: Meeting route test schema
description: Why meeting route tests may fail before executing and how to interpret that failure
---

The meeting route suite uses the workspace database rather than an isolated schema. Confirm its schema is current before treating a setup-time insert failure as a route regression.

**Why:** The suite can stop in `beforeAll` when a column present in the Drizzle schema is absent from the workspace database, causing every test to be skipped.

**How to apply:** If meeting route tests fail during fixture creation with a missing-column error, repair or migrate the test database separately; still use type checks and clean service startup to validate unrelated code changes.