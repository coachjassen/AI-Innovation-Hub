-- Add the one-off invitation fields required by current versions of the app.
-- This is safe to run repeatedly and only adds missing columns and an index.
--
-- Run once on the self-hosted Linux server after updating the application:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ensure-one-off-invitation-schema.sql

BEGIN;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS invitation_body text,
  ADD COLUMN IF NOT EXISTS invitation_attachment_path text,
  ADD COLUMN IF NOT EXISTS invitation_attachment_name text,
  ADD COLUMN IF NOT EXISTS invitation_attachment_content_type text;

ALTER TABLE meeting_invitees
  ADD COLUMN IF NOT EXISTS invitation_token_hash text,
  ADD COLUMN IF NOT EXISTS invitation_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS invitation_send_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS meeting_invitees_invitation_token_hash_unique
  ON meeting_invitees (invitation_token_hash)
  WHERE invitation_token_hash IS NOT NULL;

COMMIT;