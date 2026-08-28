BEGIN;

ALTER TABLE attendees
  DROP CONSTRAINT IF EXISTS attendees_email_unique;

DROP INDEX IF EXISTS attendees_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS attendees_circle_id_email_unique
  ON attendees (circle_id, email);

COMMIT;