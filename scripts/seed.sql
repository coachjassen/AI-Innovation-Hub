-- Seed script for Kinetics Group Innovation Hubs
-- Run with:
--   psql "postgresql://kineticshubs:choose-a-strong-password@localhost:5432/kineticshubs" -f scripts/seed.sql
--
-- Safe to re-run — checks for existing records before inserting.

BEGIN;

-- 1. Create the hub (circle) only if it doesn't already exist
INSERT INTO circles (name, cadence, status)
SELECT 'AI Innovation Circle', 'monthly', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM circles WHERE name = 'AI Innovation Circle'
);

-- 2. Create the admin account only if the email doesn't already exist
INSERT INTO attendees (name, email, company, role, circle_id)
SELECT
  'Jassen Elliott',
  'jassen.elliott@kambium.co.nz',
  'Kambium',
  'admin',
  c.id
FROM circles c
WHERE c.name = 'AI Innovation Circle'
  AND NOT EXISTS (
    SELECT 1 FROM attendees WHERE email = 'jassen.elliott@kambium.co.nz'
  )
LIMIT 1;

COMMIT;

-- Confirm what exists
SELECT id, name, cadence, status FROM circles;
SELECT id, name, email, company, role, circle_id FROM attendees;
