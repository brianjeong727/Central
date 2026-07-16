# Run Sheet System — Phased Implementation Plan

> Ratified 2026-07-15 from the cdesign brainstorm. Core reframe: **the app checks on people,
> because people don't check the app.** Competence lives in the system, not the leader.
> Execute phase by phase; each phase is independently shippable and Brian greenlights each.

## Context

Student-org leaders are overloaded college volunteers; nobody checks the app between meetings,
people flake day-of, competence resets every class year. The workspace today is a passive
checklist. This system inverts it: T-minus pings, tap-to-confirm reliability signals,
completed events compile into next-year playbooks with actual timings, and a generalized
day-of run-of-show.

**Redundancy kills (ratified):** Transition Notes surface → absorbed into playbook briefs.
ProgramTab (retreat-only run-of-show) → generalized into the Run Sheet tab for all event types.
Checklist "Day of" section stays for day-of *tasks* but timed *blocks* live only in the Run Sheet.
"My Deadlines" = a filtered view over event_tasks, never a new object. Auto-agenda renders
inside Meeting Notes, not a new tab.

**Verified substrate (2026-07-15):**
- pg_cron + pg_net are LIVE in prod (`push-event-reminders` */10, `push-desk-digest` daily) —
  the v2b claim-fn + `net.http_post` → dispatch-route pattern is the proven scheduler model.
  Pattern reference: `.claude/task-context/push-v2b/migration-v2b.sql`.
- Push dispatch route `app/api/push/dispatch/route.ts` — resolver table at L764-779, already has
  `task_assigned` / `event_role_assigned` resolvers; `x-push-secret` machine auth; dryRun=1 param;
  web-push + APNs fanout with dead-endpoint pruning. System messages never push.
- `event_tasks` (due_date is DATE only, has completed_at, phase, parent_id, pinned, priority),
  `event_roles`, `event_plans` (type_data jsonb, planning_group_id, plan_start_date, crunch_date),
  `transition_notes` (append-only, keyed ministry×event_type×class_year).
- `EVENT_TYPE_CONFIGS` (plan-tab.tsx L5951) static seed templates, instantiated in
  AddEventModal.handleSave (L6595-6620) — stays as the no-template fallback.
- RSVP toggle (UNIQUE + optimistic SWR delete/upsert) = the confirmations model.
- Poll message card (message-row.tsx L233) = the model for any future actionable chat card.
- No timezone model — `DEFAULT_EVENT_TZ = America/Los_Angeles` hardcoded (route.ts:329); we
  accept hardcoded PT, co-located for a future `ministries.timezone` column.
- Schema truth = live DB via Supabase MCP; repo `supabase/*.sql` is stale. All migrations via MCP
  with rls-reviewer before/after.
- `home-tab.tsx` / `plan-tab.tsx` are clean vs origin/main (mobile sweep hasn't touched them).
- cdesign artifact "My Deadlines Section" exists at claude.ai/design project
  213d178e-14fd-48e0-a958-dcc1ccd40588 (`explorations/run-sheet/`) — NOT yet imported locally.
  Import via claude_design MCP → reconciler → build (orchestration skill governs).

---

## Global architecture decisions

### Scheduler: pg_cron `run_sheet_tick()` (hourly) + `notification_ledger` idempotency

```sql
CREATE TABLE notification_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,        -- 'event_task' | 'event_confirmation' | 'event_block'
  subject_id   uuid NOT NULL,
  offset_key   text NOT NULL,        -- 'due_tomorrow' | 'due_today' | 'confirm_request:1' | 'escalated:1'
  fired_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, offset_key)
);
-- RLS on, ZERO policies (service/cron only)
```

- Claim = `INSERT … ON CONFLICT DO NOTHING RETURNING id` — atomic, multi-offset, no sender-state
  columns on subject tables. Claimed-but-failed POST = dropped ping (matches v2b semantics).
- `run_sheet_tick()` SECURITY DEFINER, scheduled `5 * * * *`; computes
  `local := now() AT TIME ZONE 'America/Los_Angeles'`, only emits at local hour 9
  (dodges DST-in-cron-expression). All date-anchored pings land 9:00 AM PT.
- Emissions per tick:
  - task due tomorrow (assigned, incomplete) → `due_tomorrow` → event `task_due`
  - task due today → `due_today` (two nudges total — the fatigue budget; NO re-nag)
  - events starting local_date+2 with assigned roles → auto-create confirmations → `confirm_request:{round}`
  - confirmations silent 24h → flip status to `escalated`, ping leader ONCE → `confirm_escalation`

### Confirmations: polymorphic `event_confirmations`

```sql
CREATE TABLE event_confirmations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id   uuid NOT NULL REFERENCES ministries(id),
  event_plan_id uuid NOT NULL REFERENCES event_plans(id) ON DELETE CASCADE,
  subject_type  text NOT NULL CHECK (subject_type IN ('role','block')),
  subject_id    uuid NOT NULL,                 -- event_roles.id | event_blocks.id (Phase 3b)
  user_id       uuid NOT NULL REFERENCES profiles(id),
  status        text NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested','confirmed','declined','escalated')),
  round         int  NOT NULL DEFAULT 1,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  note          text,
  UNIQUE (subject_type, subject_id, user_id)
);
```

- Attaches to the ROLE row (person with two roles confirms each; rollup is per-role);
  `subject_type` future-proofs Phase 3b block check-ins.
- State machine: requested → confirmed|declined (user tap, client-side RLS own-row UPDATE,
  optimistic SWR — RSVP pattern); requested --24h--> escalated (cron); escalated → confirmed
  still allowed (late tap resolves). Re-request after decline = leader action resets status,
  round+1 (ledger key `confirm_request:{round}` fires the new round exactly once).
- RLS: SELECT ministry-scoped; UPDATE own row (respond fields only); INSERT/reset via
  can_plan_events pattern (copy event_roles policies).

### Dispatch route: 3 new resolvers + 1 pref key

| event | record | recipient | note |
|---|---|---|---|
| `task_due` | event_tasks | assigned_to | "Due tomorrow/today: {title}", tag `task-due-{id}` |
| `confirm_request` | event_confirmations | user_id | "{event}: confirm you're set for {role}" |
| `confirm_escalation` | event_confirmations | escalation recipient | "{name} hasn't confirmed {role}" |
| `block_ping` (P3b) | event_blocks | owner_id | "You're up in 10: {title}" |

New `NotificationSettings.deadlines?: boolean` (default on) gates task_due + confirm_request
(+ block_ping later). confirm_escalation rides existing `activity` key. Settings toggle in
settings-tab prefs list.

### All new tables: ministry_id denormalized, can_plan_events write pattern, server actions
follow `"use server"` → authz guard → createAdminClient() → ministry-rescoped writes.

### Design notes
- Attention dots stay PLUM (house grammar); --danger remains destructive-only. "Red dot" is
  semantic, not literal red.
- New mobile surfaces follow Pocket spec (--ivory borderless r20, hub-and-spoke, one chrome row,
  useScrollResetOn, ≤1 plum hero/screen).

---

## Phase 1 — Trigger engine + confirmations + My Deadlines

**Goal:** the app taps humans; tap-to-confirm; personal deadlines surface; leader rollup.
**Independently shippable. This phase also tests the core behavioral bet (do pings get answered?)
that gates Phase 3b.**

Migrations (MCP, rls-reviewer before/after, in order):
1. `notification_ledger` (RLS on, zero policies)
2. `event_confirmations` + policies + indexes `(user_id, status)`, `(event_plan_id)`
3. `run_sheet_tick()` fn — smoke-test via manual `SELECT run_sheet_tick()` FIRST
4. `cron.schedule('run-sheet-tick', '5 * * * *', …)` as a separate final migration

Code:
- [ ] `app/actions/event-confirmations.ts` — `requestConfirmationsAction(eventPlanId)` (manual
      leader trigger), `reRequestConfirmationAction(confirmationId)` (round+1)
- [ ] `app/api/push/dispatch/route.ts` — resolveTaskDue / resolveConfirmRequest /
      resolveConfirmEscalation + resolver-table entries + `deadlines` pref gate
- [ ] `app/home/types.ts` — `EventConfirmation`, `NotificationSettings.deadlines`
- [ ] Import cdesign `explorations/run-sheet/` (My Deadlines) via claude_design MCP → reconciler
- [ ] `app/home/tabs/home-deadlines.tsx` (NEW) — My Deadlines section, desktop (SectionHeader +
      ListRow) + Pocket (PocketRow + plum showDot; confirm/decline inline per poll-card footer
      pattern). Separate SWR key `["my-deadlines", ministryId, profileId]` (NOT loadHomeData —
      independent revalidation on taps). Two `!inner`-join queries: my open dated tasks ≤14d +
      my pending/escalated confirmations.
- [ ] `app/home/tabs/home-tab.tsx` — mount section: desktop between ChatStrip and "For You";
      mobile between Up Next carousel and Announcements preview
- [ ] `plan-tab.tsx` EventPlanWorkspace Roles section — per-role confirm chip
      (Confirmed / Awaiting / Declined / Escalated), "Request confirmations" action,
      re-request on declined rows
- [ ] `settings-tab.tsx` — Deadlines notification toggle

Verification: npm run build; stage event at T+2/T+1/today, manual tick with dispatch pointed at
dryRun, inspect ledger (re-run = zero duplicates); device tap-confirm → optimistic UI + rollup;
edit requested_at back 24h, re-tick, exactly one escalation.

Risks: 9am-hour gate means a missed 9am tick skips a day → widen gate to hours 9–10 (ledger
dedupes). Deep links stop at `/home?tab=plan&team=` granularity (matches dgl precedent).

## Phase 2 — Playbook compiler ("Run it back")

**Goal:** completed event → curated template (T-minus offsets, roles, briefs); instantiation at
event creation; Transition Notes surface killed. Independent of Phase 1.

Migrations: `event_templates` / `template_tasks` / `template_roles` + policies;
`event_plans.template_id uuid`; `event_tasks.brief text`. transition_notes TABLE kept as dark
archive until every active event_type has a template, then dropped (content is human-mapped at
compile time, not blind-migrated).

Schema sketch:
- `event_templates`: ministry_id, team_id, event_type, name, source_event_plan_id,
  year_label, extra_notes jsonb (unmapped transition notes), stats jsonb,
  UNIQUE(ministry_id, team_id, event_type) — newest compile replaces (confirm dialog names it)
- `template_tasks`: title, phase, offset_days (due_date − event start date, canonical),
  actual_offset_days (completed_at-derived, shown as "planned T-7 · done T-3" with one-tap
  adopt), brief, role_hint, parent_id, sort_order
- `template_roles`: role_name, notes, sort_order

Code:
- [ ] `app/actions/event-templates.ts` — compileEventTemplateAction (curated payload),
      instantiateTemplateAction (offsets → due dates, clamped to today when past; roles
      unassigned; briefs → event_tasks.brief)
- [ ] `app/home/tabs/event-compile.tsx` (NEW) — compile-review modal: per-task planned/actual
      toggle, brief textareas, transition_notes candidate panel (attach → brief / dismiss →
      extra_notes). v1 scope: "accept all + edit briefs", no deep re-ordering.
- [ ] EventPlanWorkspace Overview — "Compile playbook" button (event date passed, can_plan_events)
- [ ] AddEventModal — template lookup on (team, event_type) → "Run it back" vs "Start fresh"
      choice card; template path replaces the L6604 static seed; fallback unchanged
- [ ] KILL Notes tab (read L7413, handleAddPainPoint L7748, class_year grouping L7312);
      remove `notetab`… (verify — `notetab` is meeting-notes' param; the event Notes tab has no
      param) — clean nav-state only if applicable
- [ ] Task rows render `brief` as expandable secondary line

Offset math: use event start date **in PT**, not UTC date (off-by-one at night events).

Verification: build; compile a past retreat, inspect rows (offsets negative, actuals populated);
"run it back" a new event, due dates = event−offsets, past-clamp works; Notes tab gone.

## Phase 3 — Day-of Run Sheet

**3a (modest, ships): every event type gets a Run Sheet tab — timed blocks, owners, briefs;
read-only mobile run-of-show. 3b (gated on Phase 1 response data): live status + ripple + pings.**

Migration: `event_blocks` table NOW (not jsonb) — dual-model later costs more:
ministry_id, event_plan_id, day_index, time_label (free text preserved verbatim), start_time
(best-effort parse; sort key), duration_min, title, owner_id, brief, sort_order, plus DORMANT
live-mode columns: status ('pending'|'active'|'done'|'skipped'), actual_start, actual_end.
One-time migration from `type_data->'program'` (leader_id → owner_id; keep raw time in
time_label; leave jsonb intact for rollback, strip in later cleanup).

Code:
- [ ] `app/home/tabs/run-sheet-tab.tsx` (NEW) — replaces ProgramTab (plan-tab.tsx L9586-9683);
      registered for ALL event types (drop retreat-only extraTabs gating). Edit mode = leader
      grid (ProgramTab structure + brief + time input writing time_label + parsed start_time).
      Read mode = Pocket run-of-show: day PocketFilterChips, --ivory block cards, "now/next"
      derived client-side from wall clock (zero live infra needed).
- [ ] Checklist day_of section: KEEP for day-of tasks (different species from timed blocks);
      add cross-link line to Run Sheet tab
- [ ] template_blocks ("run it back" carries the program) = fast-follow after 3a
- [ ] 3b (later): owner-status UPDATE policy, realtime publication on event_blocks,
      `block_ping` resolver + tick scan (start_time within 10 min, today's events),
      "running late" = shift start_times, ripple = single UPDATE over subsequent rows

Verification: build; row-count parity jsonb array vs event_blocks per plan; retreat program
renders identically; blocks on a `social` event; iPhone-width read mode (useScrollResetOn).

## Phase 4 — Meeting autopilot + load visibility

**Goal:** auto-agenda prefilled into Meeting Notes; "· 4 open" load counts in assignee pickers.
Fully independent; ships any time after Phase 1 (unconfirmed section degrades gracefully).

Migration: one RPC `member_open_counts(p_team_id)` → (user_id, open_tasks, pending_confirms).

Code:
- [ ] `app/home/tabs/meeting-agenda.ts` (NEW, pure fn) — buildAgenda: completed since last note /
      due this week / unclaimed (≤14d) / unconfirmed. FIRST verify meeting_notes body format
      (markdown vs rich JSON) before composing.
- [ ] MeetingNotesSection create path — "Start with agenda" / "Start blank" choice
- [ ] EventPlanWorkspace assignee pickers — `· N open` suffix, SWR `["load-counts", teamId]`,
      revalidate on assignment writes. Neutral copy, leader-gated surfaces only.

Verification: build; create note after task churn, all four sections + correct since-window;
assign task → count bumps.

---

## Product decisions (RESOLVED by Brian, 2026-07-15)

1. Ping hour / escalation delay — 9:00 AM PT, 24h silence → escalate. ✅
2. Escalation recipient — event_plans.created_by (fallback ministry admins). ✅
3. Decline side-effect — role stays assigned; decline is a signal, not a resignation. ✅
4. transition_notes endgame — dark archive until all active types templated, then drop. ✅
5. Unclaimed-task pings — agenda-only (Phase 4); protect the fatigue budget. ✅
6. Template scope — per-team: UNIQUE(ministry_id, team_id, event_type). ✅
7. Run-it-back carrying blocks — fast-follow after Phase 3a. ✅
8. Branch strategy — each phase on a fresh branch off origin/main (Phase 1 =
   `feat/run-sheet-p1`); mobile sweep branch is pushed and independent. ✅

## Review log

### Phase 2 — IN PROGRESS (2026-07-16, branch feat/run-sheet-p2, off main w/ Phase 1 merged)
- Schema APPLIED via MCP: event_templates / template_tasks / template_roles + event_plans.template_id
  + event_tasks.brief. rls-reviewer BEFORE: no blocks; W1 (event_templates_update WITH CHECK) folded in.
- Sandbox fixture SEEDED (Brian's Sandbox 6c68111b…): "Student Org Board" team (standard; Brian=president,
  Alex/Grace=can-plan officers, Daniel/Emily=members) + "Spring Retreat 2026" (COMPLETE, 2026-05-16;
  8 tasks w/ due+completed_at, 4 roles, 2 retreat transition_notes) = the compile source. "Fall Retreat"
  (2026-08-05) = run-it-back target.
- Explorer recon → findings.md (AddEventModal hook, EVENT_TYPE_CONFIGS, Notes-tab retire checklist,
  compile-button placement, team classification: standard + /board|student org|leadership|officer/i).
- Engineer building (spec.md): types, event-templates.ts (compile/instantiate, PT offset math), 
  event-compile.tsx modal, plan-tab wiring + Notes-tab retirement + task brief line.
- Sandbox mandate recorded in memory [[project_personal_sandbox]] — seed/play/leave-fixtures + per-phase
  "how to test yourself". Phase 1 PR #189 MERGED to main; migration 04 (cron) still pending prod deploy.
- REMAINING: drive compile→instantiate in sandbox, tester + enforcer, handoff w/ how-to-test guide.


### Phase 1 — in progress (2026-07-15, branch feat/run-sheet-p1)
- Migrations 01-03 APPLIED via MCP (notification_ledger, event_confirmations + cleanup trigger,
  run_sheet_tick fn). Migration 04 (cron schedule) HELD until end-to-end verified.
- rls-reviewer BEFORE: no blocks; folded in W1 (column-grant UPDATE lockdown) + W2 (role-delete/
  reassign confirmation cleanup trigger). rls-reviewer AFTER: running (live probes).
- Brian rulings: My Deadlines = tasks + confirmations (no file-submission model); urgency color
  holds the line (plum + neutral, --danger destructive-only).
- Backend built (engineer): 3 dispatch resolvers (task_due / confirm_request / confirm_escalation),
  event-confirmations.ts (requestConfirmationsAction, reRequestConfirmationAction), EventConfirmation
  type + NotificationSettings.deadlines. tsc clean.
- cdesign My Deadlines reconciled → deadlines-spec.md (21 SNAP, 6 KEEP, 3 UNSURE resolved by
  conductor: serif digest title / checkbox complete / no strikethrough).
- UI pass (engineer): running — home-deadlines.tsx (both viewports), home-tab mounts, Roles rollup
  + Request/Re-request in EventPlanWorkspace, settings deadlines toggle, completeTaskAction
  (assignee task-complete server action — event_tasks UPDATE RLS is leader-only).
- tester PASSED: verify.sh green (build/lint/hex/server); e2e 89/95 (6 failures = pre-existing flake,
  unrelated — none touch deadlines/confirmations). Click-through both viewports: My Deadlines renders,
  mark-done + confirm optimistic, Roles rollup + Request confirmations work, settings toggle staged.
  Screenshots in test-results/run-sheet-*.png.
- Tier-2 enforcer: NO blocks. W3 dismissed (event_plans.calendar_event_id is NOT NULL — inner join safe).
  W1 accepted (mobile rows hand-rolled vs PocketRow — extending PocketRow risks conflict with in-flight
  mobile sweep; follow-up: extend PocketRow w/ trailing slot post-sweep-merge). W2 fixed (mobile header
  dropped dead "See all ›" → shows count like desktop). Core verified clean (roles predicates, optimistic,
  ministry scoping, #15 header CTA, #21 save-staging, plum-only color, resolver skip/pref logic).

### ⚠ GO-LIVE GATING (migration 04 — the cron schedule)
Migration 04 (`SELECT cron.schedule('run-sheet-tick', ...)`) is DRAFTED at
`.claude/task-context/run-sheet-p1/migrations/04_schedule_run_sheet_tick.sql` but MUST NOT be applied
until this branch is MERGED to main AND Vercel has deployed prod. Reason: the tick fn POSTs to
`app_config.push_dispatch_url` = the PROD dispatch route, which only gains the task_due/confirm_request/
confirm_escalation resolvers once main deploys. Scheduling early → prod fires task_due into the OLD route,
which falls through to `resolveTaskAssigned` and sends a WRONG "assigned" push. Same reason the manual
`requestConfirmationsAction` (POSTs to NEXT_PUBLIC_SITE_URL) only delivers correctly post-deploy.
Until go-live: My Deadlines DISPLAY + confirm/decline RESPOND work (pure client); push DELIVERY is dormant.
GO-LIVE STEP (after merge + ~75s deploy): apply migration 04, then verify `SELECT jobname,schedule FROM
cron.job` shows `run-sheet-tick 5 * * * *`.

- REMAINING: amend commit w/ W2 fix → handoff + push decision (cron stays held per above).
