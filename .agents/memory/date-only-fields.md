---
name: Date-only fields
description: How to store/transport/render calendar-date (no time) values without timezone corruption
---

# Date-only fields (e.g. goal due dates)

Rule: treat calendar-date values as date-only end to end. Use a Postgres `date`
column (drizzle `date()` returns a `YYYY-MM-DD` string by default), keep the API
contract as a `YYYY-MM-DD` string, and parse it in the UI by splitting the
components into a LOCAL `Date` (`new Date(y, m-1, d)`).

**Why:** `new Date("2026-06-25")` is parsed as UTC midnight; formatting/comparing
it with local-time helpers (`date-fns format`, `setHours(0,0,0,0)`) shifts the day
backward/forward for many timezones. That corrupts "overdue / due soon / upcoming"
classification and the displayed date. Caught in code review when due dates were
first stored as `timestamp` and parsed with `new Date(string)`.

**How to apply:** never use `new Date(dateOnlyString)` or `.toISOString()` for
date-only data. Server stores/returns the raw `YYYY-MM-DD` string; UI uses a
`parseLocalDate` regex helper (see `components/GoalDueBadge.tsx`) and feeds date
inputs with `value.slice(0,10)`.
