-- Add status column to worship_availability to support available / busy / unsure
-- Run this in the Supabase SQL editor

ALTER TABLE worship_availability
  ADD COLUMN IF NOT EXISTS status text
    CHECK (status IN ('available', 'busy', 'unsure'));

-- Backfill existing rows from the old boolean column
UPDATE worship_availability
  SET status = CASE WHEN is_available THEN 'available' ELSE 'busy' END
  WHERE status IS NULL;

-- Make it non-nullable now that all rows are filled
ALTER TABLE worship_availability ALTER COLUMN status SET NOT NULL;
ALTER TABLE worship_availability ALTER COLUMN status SET DEFAULT 'available';
