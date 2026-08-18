## `upsert({onConflict})` needs an UPDATE policy — it is not an insert (2026-08-19)

Building the announcement acknowledgment loop, the design called for an insert-only table:
no UPDATE policy, no DELETE policy, because you cannot un-see something. The client write
was going to use the repo's standard shape, `.upsert({...}, { onConflict: "a,b" })`.

That shape compiles to `INSERT … ON CONFLICT DO UPDATE`. On the SECOND tap it needs UPDATE
permission — against a table deliberately built without it. The review proved it live: the
old shape returns `42501 permission denied for table`, failing at the missing GRANT one
layer earlier than the policy would have.

The fix is one option: `ignoreDuplicates: true`, which emits `ON CONFLICT DO NOTHING`. The
caller must then treat an EMPTY result as success, not as a failed write.

It was not only the new table. The same audit found all five existing `rsvps` upserts and
the `announcement_views` upsert carrying the same shape, against tables that also have no
UPDATE policy — so a rapid double-tap or a stale optimistic state already threw, and in the
feed path that `throw` skipped the write that was supposed to follow it. A latent bug that
had been shipping for a long time, invisible because the toggle usually prevents a duplicate.

**The rule:** `upsert` in this codebase means "insert or UPDATE", and every table it targets
must therefore have an UPDATE policy AND an UPDATE grant. For an insert-only table — any
table where the row records that something HAPPENED rather than what something IS — use
`ignoreDuplicates: true` and treat `[]` as success.

**The generalisation worth keeping:** a PostgREST verb's name describes the client's intent,
not the SQL it emits. Check what statement actually reaches Postgres before reasoning about
whether a policy permits it. Related: [[probe-the-service-dont-reason-about-it]] — same
shape, a layer lower.
