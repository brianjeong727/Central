# Perf migration — RLS initplan wrapping + FK covering indexes (APPLIED to prod)

**Applied:** 2026-07-17 to Central prod (Supabase `wgqpnilaokfipocsugqo`) via `apply_migration`.
**Branch:** `feat/perf-rls-initplan-fk-indexes`.
**Source handoff:** `~/Desktop/CENTRAL OS/handoffs/HANDOFF-perf-scaling-concurrent-users.md`.
**Goal:** reduce backend inefficiencies that make Central degrade under concurrent load.

## Deliverable A — applied (3 migrations, in order)

1. **`perf_rls_initplan_and_fk_indexes`**
   - Section A: 175 `CREATE INDEX IF NOT EXISTS` on uncovered FK columns.
   - Section B: wrapped row-independent auth calls (`auth.uid()/jwt()/role()`, `auth_ministry_id()`, `auth_is_admin_or_leader()`) in `(select …)` across **253 policies** so they evaluate once per statement (InitPlan) instead of per row. Applied via the exact regex generator `rls-reviewer` validated byte-identical to the reviewed file, run server-side as a guarded `DO` block (no double-wrap; no DROP).
2. **`perf_fk_index_cover_remaining_gaps`** — 11 `CREATE INDEX` for FK columns Section A missed (`poll_votes.user_id`, `user_ministries.ministry_id`, `message_reactions.user_id`, etc.).
3. **`perf_fk_index_drop_redundant_dupes`** — dropped 58 of the Section-A indexes that duplicated a pre-existing full (non-partial) index on the same FK columns. Coverage preserved; removes write overhead + clears `duplicate_index`.

### Safety / review
- **`rls-reviewer` BEFORE (design review): GO** — no DROP, both helpers confirmed row-independent (`STABLE`, no-arg), no row-dependent call (`is_group_member`) wrapped, precondition 0 (no double-wrap), all 175 index columns + all 253 policy targets exist live, OLD/NEW boolean parity holds in allow AND deny directions.
- **Dry-run:** the Section B generator ran against live inside a rolled-back txn → `DRY_RUN_OK wrapped=253`, zero errors, before real apply.
- **`rls-reviewer` AFTER (live parity): GO — no regression.** Live rolled-back probes as leader/member/visitor/pastor + outsider across chat (`messages`/`group_members`), announcements (`announcements`/`announcement_views`), events (`calendar_events`/`event_plans`), directory (`profiles`): every allow/deny matched expectation; cross-tenant reads and writes denied both directions; `announcement_views` RETURNING trap clean (SELECT policy covers the inserted row). Advisor counts reconstructed to 0/0 from the catalog.

### Advisor scorecard (performance)
| finding | before | after |
|---|---|---|
| `auth_rls_initplan` | 129 | **0** |
| `unindexed_foreign_keys` | 86 | **0** |
| `duplicate_index` | 0 | **0** (peaked 53 mid-apply, cleaned) |
| `multiple_permissive_policies` | 112 | 112 — **out of scope** (see below) |
| `unused_index` | 20 | 143 — benign (new FK indexes, unused until traffic) |

### Deliberately NOT done
- **Section C — `multiple_permissive_policies` (112).** Consolidating 2+ permissive policies per table/role/action is a *semantic* merge (OR the predicates) needing per-table access-parity tests. Excluded from this mechanical migration; separate task.

## Deliverable B — Realtime WAL load (investigated; biggest concurrent-user lever)

`pg_stat_statements` shows Realtime is the DB's dominant workload BY FAR:
- Two WAL-poll queries: **5.7M calls, ~10.4 h** cumulative exec (359 + 264 min). Everything else is negligible.
- Subscription-refresh query (`pg_publication_tables` scan) fires per channel-subscribe at **55–137 ms** each — Central opens many channels per user.
- Side-finding: `pg_timezone_names` queried 1071× at **656 ms each** (~12 min) — something hits the tz catalog hot; worth caching.

### Root cause + concrete reduction plan
1. **Trim the publication — biggest safe win.** `supabase_realtime` publishes **9 tables**: `calendar_events, devotionals, event_blocks, group_members, meeting_notes, message_reactions, messages, prayers, verses`. The app only subscribes (`postgres_changes`) to **4**: `messages, message_reactions, group_members, meeting_notes`. The other **5 — `calendar_events, event_blocks, devotionals, prayers, verses` — have ZERO subscribers** anywhere in source; their WAL is decoded/polled for nothing. → `ALTER PUBLICATION supabase_realtime DROP TABLE …` those 5. Verified no app dependency (grep clean). This directly cuts WAL-poll volume.
2. **Reconcile publication vs subscriptions (correctness gap).** The app subscribes to `announcements, small_groups, event_confirmations, dgl_assignments` which are **NOT** in the publication → those live-update features silently receive nothing. Either add them to the publication (if the feature needs realtime) or delete the dead subscription code. Decide per-feature.
3. **Reduce per-user channel fan-out.** Home-app, chats, and plan each open multiple channels per user (`group-messages-*`, `reactions-*`, `read-receipts-*`, `own-memberships-*`, `typing-*`). Each subscribe triggers the 137 ms refresh query. Consolidate/broaden where possible.
4. **Cache the tz lookup** feeding `pg_timezone_names`.

Items 1–2 are a follow-up task (a publication migration ± app-code reconciliation, each verified). Item 1 alone is low-risk and high-value.

## ⚠️ SECURITY — pre-existing cross-tenant leak surfaced (NOT caused by this migration)

`rls-reviewer` flagged a **`block`** on `group_members` SELECT that predates this work (the migration only wrapped `auth_is_admin_or_leader()` in `(select …)`; the unscoped term was already there):

- **Policy:** `"Members can view their own group membership"` on `group_members` =
  `((user_id = (select auth.uid())) OR is_group_member(group_id, (select auth.uid())) OR (select auth_is_admin_or_leader()))`
- **Breach:** the third disjunct has **no ministry boundary** → any `admin/leader/deacon/elder/pastor` in ANY ministry can read EVERY group-membership row platform-wide.
- **Live evidence:** sandbox leader Alex saw **46** `group_members` rows though the sandbox owns only **16** (30 rows leaked from 5 other tenants).
- **Smallest fix:** scope that branch to the caller's ministry, mirroring the existing `group_members` DELETE policy:
  `((select auth_is_admin_or_leader()) AND group_ministry_id(group_id) = (select auth_ministry_id()))`
  Then re-probe: leader Alex should see 16, not 46.
- **Track:** separate ticket (RLS security), NOT folded into this perf branch. Needs its own rls-reviewer pass.

## Immediate lever (Brian's action)
**Upgrade Supabase free → Pro ($25/mo)** — dedicated compute (not shared nano) + higher realtime/connection limits. The migration + realtime trim compound on top of it. Only the account owner can click it (Dashboard → Settings → Billing).

## How to test it yourself
This is a backend/perf change — no new UI. To confirm nothing regressed:
1. **Advisor:** Supabase Dashboard → Advisors → Performance → `auth_rls_initplan` and `unindexed_foreign_keys` should both read **0** (were 129 / 86).
2. **Access still works (sandbox):** `/pick-ministry` → **"Brian's Sandbox"**, then open **Chat** (send a message in "Brian's Sandbox Chat"), **Announcements** (the pinned welcome post is visible), **Plan/Events**, and **Directory** (the 10 seeded members show). Everything should load and write exactly as before — the RLS rewrite is behavior-preserving.
3. **Isolation intact:** as a non-member account, "Brian's Sandbox" remains invisible (RLS unchanged).
