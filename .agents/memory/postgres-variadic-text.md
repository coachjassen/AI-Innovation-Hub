---
name: PostgreSQL variadic text parameters
description: Binding a text value inside variadic PostgreSQL functions can require an explicit cast.
---

When appending database-backed history with PostgreSQL `concat_ws`, cast a bound token hash to `text` inside the SQL expression.

**Why:** PostgreSQL could not determine a prepared statement parameter's data type in the variadic argument position. Static TypeScript checks passed, but the meeting invitation route failed at runtime until the parameter was explicitly cast.

**How to apply:** If a Drizzle SQL template binds a value directly into a variadic PostgreSQL function, use an explicit SQL cast and verify it against the development database with the mailer mocked.