# Realtime publication trim (APPLIED to prod)

**Applied:** 2026-07-17 to Central prod (`wgqpnilaokfipocsugqo`), migration `perf_realtime_publication_trim_unsubscribed`.
**Branch:** `feat/perf-realtime-publication-trim`. Follows Deliverable B of the perf-scaling handoff.

## What & why
`pg_stat_statements` showed Realtime WAL polling was the DB's dominant workload (~10.4 h / 5.7M calls). The `supabase_realtime` publication had **9 tables**, but source grep found the app only subscribes (`postgres_changes`) to **4**. The other 5 had **zero subscribers** — their WAL was decoded/polled for nothing.

Dropped from the publication (verified no app dependency):
`calendar_events, event_blocks, devotionals, prayers, verses`

Publication now = `group_members, meeting_notes, message_reactions, messages` (all 4 actively subscribed). Chat + notes realtime unaffected.

## Reversible
To restore any table: `ALTER PUBLICATION supabase_realtime ADD TABLE <t>;`

## Still open (follow-ups from Deliverable B)
- **Subscription/publication reconcile (correctness):** app subscribes to `announcements, small_groups, event_confirmations, dgl_assignments` which are NOT published → those live-update features silently do nothing. Add to publication (if needed) or delete dead subscription code — decide per feature.
- **Channel fan-out:** consolidate the many per-user channels (each subscribe fires a ~137 ms refresh query).
- **`pg_timezone_names`** hot query (656 ms × 1071) — cache the tz lookup.
- **Supabase Pro upgrade** — dedicated compute; compounds with this trim.

## How to test it yourself
`/pick-ministry` → **"Brian's Sandbox"** → open **Chat** and send a message; it should still appear live in a second tab/device (chat realtime is preserved). Calendar/plan/devotionals/prayers/verses never had live push, so nothing there changes.
