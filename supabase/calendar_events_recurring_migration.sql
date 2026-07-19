-- ─── calendar_events.recurring — the traditional-events flag ─────────────────
--
-- Season-rollover model: "Start next season" copies ONLY recurring events
-- (the annual traditions — Welcome Week, Coffeehouse, Turkeybowl…) into the
-- next season; one-offs stay in their year, browsable via the season filter.
-- The flag also drives the repeat glyph in the events list.
--
-- RLS: no policy changes — plain data column on an already-policied table;
-- read/write scope continues to come from the existing calendar_events
-- policies untouched.

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurring boolean NOT NULL DEFAULT false;

-- Partial index: rollover + filtered lists only ever scan the flagged rows.
CREATE INDEX IF NOT EXISTS calendar_events_recurring_idx
  ON calendar_events (ministry_id, recurring) WHERE recurring;
