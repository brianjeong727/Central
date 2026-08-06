## An UPDATE policy with no WITH CHECK only constrains what its USING constrains (2026-08-06)

`group_members` shipped this policy:

```sql
CREATE POLICY "Users can update own last_read_at" ON group_members
  FOR UPDATE USING (user_id = auth.uid());   -- no WITH CHECK
```

It reads like "a user may edit their own membership row." It actually meant
"a user may edit their own membership row **into anything**." Postgres defaults
a missing `WITH CHECK` to the `USING` expression, and that expression pins only
`user_id` — never `group_id`. Combined with a table-level `GRANT UPDATE` on all
columns, any member could run

```sql
UPDATE group_members SET group_id = '<any group>' WHERE user_id = me;
```

and, because `messages` / `message_reactions` / `group_members` all gate SELECT
on `is_group_member(group_id, uid)`, read that chat's whole history — including
other ministries'. Proven live against production (6,198 cross-ministry messages
readable), then closed and re-proven denied.

**The rule:** on any `FOR UPDATE` policy, ask what the row can be turned INTO,
not just which rows are visible. If the table has a parent FK that grants access
(`group_id`, `event_plan_id`, `team_id`, `ministry_id`), the policy must pin it
in `WITH CHECK` — the default is not good enough. Pair it with a column-level
`GRANT UPDATE (col, col, …)` so the FK is not updatable at all; the reviewer
confirmed each barrier is independently sufficient, which is exactly why both
are worth having.

**Where else this shape lives (found in the same sweep, still open):**
`event_tasks`, `event_roles`, `event_blocks`, `event_notes` have UPDATE policies
with *no tenant predicate at all*. Not reachable through the app today only
because PostgREST rejects unfiltered UPDATEs — i.e. the tenant boundary is held
by PostgREST, not by RLS. See [[rls-review-event-tables]].

Related: [[db-check-constraints-and-deploy-ordering]].
