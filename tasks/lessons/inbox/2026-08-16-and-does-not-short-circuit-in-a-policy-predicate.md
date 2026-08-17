## A guard AND-ed before a cast does not protect it — use CASE (2026-08-16)

**What happened.** Tightening the `chat-attachments` INSERT policy meant casting the
first path segment to `uuid` so it could be passed to `is_group_member()`. Knowing the
segment might not be a UUID, I guarded it:

```sql
AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-…-[0-9a-fA-F]{12}$'
AND is_group_member(((storage.foldername(name))[1])::uuid, auth.uid())   -- unsafe
```

That looks like a short-circuit and reads like one. **Postgres does not define the
evaluation order of `AND`.** The planner may evaluate the cast first, and when it does,
a malformed segment raises `22P02: invalid input syntax for type uuid` from inside the
policy predicate — which surfaces as a **500, where the whole point was to return a clean
403**. Proved by probe, not argued.

**The rule.** When a predicate needs a guard *before* a coercion, encode the ordering in
the expression itself:

```sql
AND is_group_member(
      (CASE WHEN <guard> THEN <segment> END)::uuid,   -- NULL when the guard fails
      auth.uid())
```

`CASE` has defined evaluation order. A failed guard yields `NULL`, the function returns
`NULL`/false, and the row is denied — quietly and correctly. Verified: `not-a-uuid/x.png`,
a bucket-root file, `/x.png` and a near-miss segment all return a clean RLS violation.

**Where else this bites.** Any policy or CHECK that mixes a validity test with a cast —
`::uuid`, `::int`, `::timestamptz`, `to_number` — has the same shape. `chat_topic_members_read`
on `public.messages` currently uses the unguarded form and should be converted before it
is copied further.

**The wider tell:** a denial that arrives as a 500 is not a working policy. If a malformed
input can make RLS *error* rather than *refuse*, the predicate is doing arithmetic it has
not earned the right to do yet.

Related: [[widening-a-check-can-disarm-a-guard-elsewhere]]
