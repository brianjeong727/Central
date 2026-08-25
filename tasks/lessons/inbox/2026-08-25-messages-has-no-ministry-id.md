## `messages` has no `ministry_id` — and an unchecked insert hides it (2026-08-25)

Convention #8 says every write carries `.eq("ministry_id", ministryId)`, and names
`event_tasks` as the one table without the column. That list is incomplete:
**`messages` has no `ministry_id` either.** It is scoped through `group_id`, the
same way `event_tasks` is scoped through its plan.

Writing the calling feature's in-chat summary line ("Call ended · 4:32") I added
`ministry_id` to a `messages` insert out of habit. PostgREST rejects the whole
statement when a payload names a column that does not exist — so the insert
failed 100% of the time. The error was never seen because the insert was written
as a bare `await` with no destructured `error`, in a function whose other writes
had all succeeded. The call ended correctly, the row was stamped correctly, the
realtime broadcast fired correctly, and the conversation silently gained no record
that a call had ever happened. It surfaced only because an e2e test asserted on
the message row rather than on the UI.

**Rules this earns:**

1. **Verify the column before stamping it.** Convention #8's exception list is a
   sample, not an inventory. `information_schema.columns` is one query; assuming
   costs a silent write failure. Tables scoped through a parent (`messages` →
   `group_id`, `event_tasks` → `event_plan_id`) are the shape to suspect.
2. **A write whose failure is invisible must have its error read.** Not every
   supabase call needs `if (error)`, but one that produces the ONLY user-visible
   artifact of an operation does — if it can fail without anything else changing,
   nothing else will ever tell you. Here the fix was three lines: destructure
   `error`, log it.
3. **Assert on the row, not the render, when the row is the point.** The UI test
   would have passed either way: the call ended, the dialog closed, the strip
   disappeared. Only a query for the system message caught it.

Related: [[search-path-pin-does-not-propagate]] — same family of failure, where a
Postgres-level mistake is swallowed by a layer that was written to never throw.
