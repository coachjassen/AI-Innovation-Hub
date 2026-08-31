-- Add recurring Hub interest registration support.
-- Safe to run repeatedly on self-hosted PostgreSQL deployments.
--
-- Run before starting the updated API:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/hub-interest-registration.sql

BEGIN;

ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS registration_description text,
  ADD COLUMN IF NOT EXISTS registration_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_token_hash text,
  ADD COLUMN IF NOT EXISTS registration_token_encrypted text;

CREATE TABLE IF NOT EXISTS hub_registrations (
  id serial PRIMARY KEY,
  circle_id integer NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  company text NOT NULL DEFAULT '',
  attendee_id integer REFERENCES attendees(id) ON DELETE SET NULL,
  promoted_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hub_registrations_circle_id_email_unique
  ON hub_registrations (circle_id, email);

CREATE UNIQUE INDEX IF NOT EXISTS circles_registration_token_hash_unique
  ON circles (registration_token_hash)
  WHERE registration_token_hash IS NOT NULL;

COMMIT;