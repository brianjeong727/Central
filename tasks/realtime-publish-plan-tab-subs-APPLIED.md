# Fix: publish small_groups + dgl_assignments (dead realtime subscriptions) — APPLIED to prod

**Applied:** 2026-07-17 to Central prod (`wgqpnilaokfipocsugqo`), migration `realtime_publish_small_groups_dgl_assignments`.
**Branch:** `fix/realtime-publish-plan-tab-subs`. Closes the reconcile follow-up from the Realtime trim (`tasks/perf-realtime-publication-trim-APPLIED.md`).

## The gap
`plan-tab.tsx` has two deliberately-built live-refresh features whose `postgres_changes` subscriptions received **nothing**, because the tables were never in the `supabase_realtime` publication:
- **`dgl_assignments`** — channel `dgl-assignments-${userId}-…`, filter `user_id=eq`, handler `loadHome()`. *"refresh home assignments when president publishes."*
- **`small_groups`** — channel `sg-leader-${userId}-…`, filter `leader_id=eq`, debounced `loadHome()`. *"refresh member list when president confirms small groups."*

(The earlier "4 dead subscriptions" note over-counted: `announcements` and `event_confirmations` `table:` matches were push-dispatch payload strings in `api/push/dispatch/route.ts` and `actions/event-confirmations.ts`, not realtime subscriptions.)

## The fix (code was already correct — DB only)
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE small_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE dgl_assignments;
ALTER TABLE small_groups   REPLICA IDENTITY FULL;
ALTER TABLE dgl_assignments REPLICA IDENTITY FULL;
```
`REPLICA IDENTITY FULL` because the subscriptions filter on **non-PK** columns (`leader_id` / `user_id`; PK is `id`) with `event: "*"` — FULL ensures UPDATE/DELETE events carry those columns so the filter matches (a president *publishing* is an UPDATE `published=true`).

Both are low-write config tables, so the WAL cost is negligible vs. the 5 high-churn tables removed in the trim. **Publication now = the 6 actually-subscribed tables** (`messages, message_reactions, group_members, meeting_notes, small_groups, dgl_assignments`) — subscription set and publication are aligned.

## Verified
`pg_publication_tables` → 6 tables incl. both new ones; `relreplident='f'` (FULL) on both.

## How to test it yourself
In **Brian's Sandbox** (`/pick-ministry` → "Brian's Sandbox"), open the Plan tab as a DGL/team member on two devices (or two tabs). As a president, **publish a rotation** (writes `dgl_assignments`) or **confirm small groups** (writes `small_groups`) — the member's Plan home should refresh automatically without a manual reload. Before this fix it required a manual refresh.
