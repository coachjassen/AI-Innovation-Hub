-- Idempotently ensure the confirmed administrator exists on the self-hosted
-- database. This script never deletes records or changes an existing account.
--
-- Run after the database schema exists:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ensure-admin.sql

BEGIN;

-- The original self-hosted deployment uses Hub ID 1. If this is a fresh
-- database without that Hub, create the named Hub so the account has a home.
INSERT INTO circles (name, cadence, status)
SELECT 'AI Leaders Forum', 'monthly', 'active'
WHERE NOT EXISTS (
  SELECT 1
  FROM circles
  WHERE id = 1 OR name = 'AI Leaders Forum'
);

-- Create Jassen only when the email is not already present. The preferred
-- target is the existing Hub ID 1, matching the recovery bootstrap; the name
-- fallback supports a fresh database where the serial ID is not 1.
INSERT INTO attendees (name, email, company, role, circle_id)
SELECT
  'Jassen Elliott',
  'jassen.elliott@kambium.co.nz',
  'Kambium',
  'admin',
  target.id
FROM (
  SELECT id
  FROM circles
  WHERE id = 1 OR name = 'AI Leaders Forum'
  ORDER BY CASE WHEN id = 1 THEN 0 ELSE 1 END, id
  LIMIT 1
) AS target
WHERE NOT EXISTS (
  SELECT 1
  FROM attendees
  WHERE email = 'jassen.elliott@kambium.co.nz'
);

-- Do not silently promote an existing attendee account. A role mismatch is
-- safer as a failed deployment than as an unexpected privilege change.
DO $$
DECLARE
  existing_role text;
BEGIN
  SELECT role
  INTO existing_role
  FROM attendees
  WHERE email = 'jassen.elliott@kambium.co.nz';

  IF existing_role IS NOT NULL AND existing_role <> 'admin' THEN
    RAISE EXCEPTION
      'Administrator bootstrap found % with role %, expected admin; no changes made',
      'jassen.elliott@kambium.co.nz',
      existing_role;
  END IF;
END $$;

COMMIT;

SELECT id, name, email, company, role, circle_id
FROM attendees
WHERE email = 'jassen.elliott@kambium.co.nz';