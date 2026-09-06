-- Add an explicit calendar duration to meetings.
-- Safe to run repeatedly; existing meetings are backfilled to 60 minutes.
--
-- Run on the self-hosted server after pulling this version:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/meeting-duration.sql

BEGIN;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

UPDATE meetings
SET duration_minutes = 60
WHERE duration_minutes IS NULL;

ALTER TABLE meetings
  ALTER COLUMN duration_minutes SET DEFAULT 60,
  ALTER COLUMN duration_minutes SET NOT NULL;

COMMIT;