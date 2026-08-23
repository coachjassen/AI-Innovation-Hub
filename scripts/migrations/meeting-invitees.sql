-- Adds explicit attendee invitations to meetings.
-- Safe to run once on a self-hosted PostgreSQL database before deploying this feature.

CREATE TABLE IF NOT EXISTS meeting_invitees (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT meeting_invitees_meeting_id_attendee_id_unique UNIQUE (meeting_id, attendee_id)
);

-- Preserve the previous behavior for meetings that already existed: every
-- attendee-role member of the Hub remains invited. Newly created meetings are
-- intentionally not seeded and require an admin to choose invitees.
INSERT INTO meeting_invitees (meeting_id, attendee_id)
SELECT meetings.id, attendees.id
FROM meetings
INNER JOIN attendees ON attendees.circle_id = meetings.circle_id
WHERE attendees.role = 'attendee'
ON CONFLICT (meeting_id, attendee_id) DO NOTHING;