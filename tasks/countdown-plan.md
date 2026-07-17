# Countdown — the planning-side Run Sheet (build plan for the next session)

> Ratified with Brian 2026-07-16. This is the CAPSTONE of the Run Sheet arc: the checklist
> reimagined as a T-minus timeline that makes the whole "app taps humans" machinery VISIBLE.
> Build in a FRESH SESSION from `~/Desktop/CENTRAL OS/central-s1 2` (full orchestration lane —
> reconciler + engineer + tester + enforcer; the prior session was pinned to a dead path and
> couldn't spawn subagents). Load the orchestration skill FIRST.

## The decision
- **"Countdown"** = a NEW tab that **REPLACES the Checklist tab** — the planning T-minus timeline.
- **"Showtime"** = the day-of run-of-show blocks tab I already built (currently labeled **"Run of show"**)
  → **RENAME its label to "Showtime"** (the `runsheet` section key can stay; just the display label).
- Two separate tabs, NO auto-morphing (Brian's instinct, confirmed). Countdown for the lead-up,
  Showtime for the day.

## Source mock (import + reconcile)
cdesign project `213d178e-14fd-48e0-a958-dcc1ccd40588`, file
`explorations/run-sheet/Run Sheet - Planning.html`. Import via the claude_design MCP →
**reconciler** (its sole trigger) → manifest → build. (The "My Deadlines" reconciliation in Phase 1
is the template for this flow.) Expect the usual snaps: `--danger`/`--gold`/`--success` as status →
the reconciler decides per Brian's color rulings (Phase 1 held the line: attention = plum; but note
this mock uses a risk/overdue RED semantic — that's a real design-system question to surface, since a
red "overdue/no-reply" risk badge may be worth allowing here like the deadline-urgency debate).

## What it is (maps 1:1 onto what's already built)
Same `event_tasks`, regrouped by **T-minus phase** (T−4wk · T−3wk this week · T−1wk · T−2days),
computed from each task's `due_date` relative to `calendar_events.start_date` (PT). Each task row shows:
- **Trigger badges** — the nudge state per task:
  - `armed` (plum-tint): a nudge is scheduled ("Auto-DM fires Thu", "Confirm-taps go out T−2 days").
  - `fired` (ivory): already sent — READ FROM `notification_ledger` (subject_type='event_task',
    offset_key due_tomorrow/due_today) or the confirmation rows.
  - `overdue` (red outline): "Nudged 2× — no reply" — from `event_confirmations.status='escalated'` or
    an incomplete past-due assigned task.
  - ⚠ These are only fully truthful once the run-sheet cron is LIVE (still dormant — go-live after
    prod deploy). Wire them to the ledger/computed state so they light up the moment the cron runs.
- **Playbook whispers** — the `--cream-3` inline note: institutional memory at the point of need.
  Source: `event_tasks.brief` (Phase 2 instantiation copies template briefs onto tasks) + the
  template's provenance. e.g. "Last year flyers arrived late, so the playbook moved this to T−4."
- **Risk + reassign-by-load** — an overdue task glows red with a **Reassign** popover suggesting
  people BY CURRENT LOAD (Tim: 1 task, Dana: 0, Sarah: 5). This ABSORBS Phase 4's load counts.
- **Right rail** (3 cards):
  - **Readiness** — segments + "5 of 12 tasks done · 42%" (already computed in the workspace).
  - **"Fires next — no one has to remember"** — the upcoming auto-fire queue (armed nudges, sorted by
    fire date). Derived from tasks' due dates + the tick logic (due−1/due, T−2 confirm, escalation).
  - **Load this month** — per-member open-task bars (Sarah 5 … Dana 0), "reassign surfaces Tim/Dana
    first." Needs the Phase-4 RPC `member_open_counts(team_id)` (spec in run-sheet-plan.md Phase 4).

## Preserve (it's still the checklist)
All current Checklist operations must survive the redesign: task CRUD, assignment, complete-toggle,
subtasks (parent_id, 1 level), pinning, priority, the inline add-row. Countdown is a re-presentation
+ augmentation of the SAME data — not a greenfield replacement. Reuse `event_tasks` + its existing
write paths in `plan-tab.tsx` (EventPlanWorkspace).

## Schema / backend needed
- **`member_open_counts(p_team_id uuid)` RPC** (Phase 4) — (user_id, open_tasks, pending_confirms).
  SECURITY INVOKER; aggregates event_tasks×plans×calendar_events for the team + event_confirmations.
  (This is the one new DB object; rls-reviewer gate applies — run it BEFORE/AFTER.)
- Everything else reads existing tables: event_tasks, event_confirmations, notification_ledger,
  event_tasks.brief. No new tables.

## Wiring / files
- `plan-tab.tsx` EventPlanWorkspace: replace the `checklist` section render with the Countdown
  timeline (or a new `CountdownTab` component / file `app/home/tabs/countdown-tab.tsx`). Keep the
  section key or rename `checklist`→`countdown` (update coreTabs + sub-tab label + nav-state).
  Rename the `runsheet` tab LABEL to "Showtime".
- Reassign popover → reuse the assignee-picker pattern; load counts from the RPC (SWR
  `["load-counts", teamId]`).
- Trigger-badge helper: compute armed/fired/overdue per task from due_date + ledger + confirmations.

## Sequencing / dependencies
- Stacked on Phase 2 (#192) + Phase 3 (#193). Branch the Countdown work off the latest of those
  (or off main once they merge). Confirm merge order first.
- The badges' full truth depends on the **cron go-live** (Phase 1 migration 04 — still held until
  prod deploy). Build badges now wired to ledger/computed state; they animate live on go-live.
- Absorbs **Phase 4** (load counts) — no separate Phase 4 needed after this.

## Verify
Full lane: reconciler manifest → engineer build → tester (build + e2e click-through) → Tier-2
enforcer (both viewports, cdesign adoption, permission-adjacent). Drive it in **Brian's Sandbox** on
the seeded **Summer Retreat** (tasks assigned to Brian, confirmations pending) + **Spring Retreat**
(has a compiled template for whispers). Leave fixtures; hand off with a "how to test it yourself" guide.

## Names recap
Countdown (planning, replaces Checklist) · Showtime (day-of, renamed from "Run of show").
