## `time without time zone` is a WALL CLOCK — tz-immune, like a DATE column (2026-08-02)

Convention #23 drills "event times are true instants, route them through `lib/tz.ts`" hard enough
that both a reconciler agent AND my own build spec confidently instructed the engineer to render
`event_blocks.start_time` through `useMinistryTimezone()`. Both were wrong, and the error would have
been invisible in review because it *looks* like exactly what the convention demands.

`event_blocks.start_time` is **`time without time zone`**. It carries no date and no offset — it is
a wall clock, in the same tz-immune class as `event_tasks.due_date` and `worship_weeks.week_date`.
Converting it through a zone applies an offset to a value that never had one, producing the very
class of bug Convention #23 exists to prevent, just in the opposite direction.

**Rules:**
- **Read the column type before applying Convention #23.** `timestamptz` → instant → convert.
  `date` / `time` / `timestamp WITHOUT time zone` → wall clock → render verbatim, never through a
  `Date` or a zone.
- Convention #23's own wording is the trap: it leads with the instant case because that's where the
  historical damage was. The tz-immune list is real and non-exhaustive — `event_blocks.start_time`
  wasn't on it (now it is worth adding).
- Query `information_schema.columns` for the actual type rather than inferring from the column name.
  "start_time" reads exactly like an instant and isn't one.
- Duration columns (`event_blocks.duration_min`, integer) are integer formatting, not date math —
  they need a shared formatter, not a tz-aware helper.

Related: [[event-times-go-through-lib-tz]]
