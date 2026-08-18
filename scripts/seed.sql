-- Seed script for Kinetics Group Innovation Hubs
-- Run with:
--   psql "postgresql://kineticshubs:your-password@localhost:5432/kineticshubs" -f scripts/seed.sql
--
-- Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING so it won't
-- create duplicates if run more than once.

BEGIN;

-- 1. Create the hub (circle)
INSERT INTO circles (name, cadence, status)
VALUES ('AI Innovation Circle', 'monthly', 'active')
ON CONFLICT DO NOTHING;

-- 2. Create the admin account, linked to the hub above
INSERT INTO attendees (name, email, company, role, circle_id)
SELECT
  'Jassen Elliott',
  'jassen.elliott@kambium.co.nz',
  'Kambium',
  'admin',
  id
FROM circles
WHERE name = 'AI Innovation Circle'
LIMIT 1
ON CONFLICT (email) DO NOTHING;

COMMIT;

-- Confirm what was created
SELECT 'Hubs:' AS "";
SELECT id, name, cadence, status FROM circles;

SELECT 'Attendees:' AS "";
SELECT id, name, email, company, role, circle_id FROM attendees;
