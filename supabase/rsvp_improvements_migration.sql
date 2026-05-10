-- RSVP system improvements
-- 1. Ensure unique constraint so duplicate RSVPs are impossible at the DB level
-- 2. Add show_attendees flag to announcements

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rsvps_announcement_id_user_id_key'
      AND conrelid = 'rsvps'::regclass
  ) THEN
    ALTER TABLE rsvps
      ADD CONSTRAINT rsvps_announcement_id_user_id_key
      UNIQUE (announcement_id, user_id);
  END IF;
END $$;

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS show_attendees BOOLEAN NOT NULL DEFAULT false;
