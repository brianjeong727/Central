-- Add setlist_pdf_url to worship_weeks for PDF chord chart uploads
-- Run this in the Supabase SQL editor

ALTER TABLE worship_weeks
  ADD COLUMN IF NOT EXISTS setlist_pdf_url text;

-- After running this SQL, also create a public Storage bucket named "setlist-pdfs"
-- in Supabase Dashboard → Storage → New Bucket
-- Name: setlist-pdfs
-- Public: yes (so uploaded PDFs can be viewed by team members)
