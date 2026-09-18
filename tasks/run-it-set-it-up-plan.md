# Run it / Set it up — the plan (design pass R3, remaining two items)

> **Status (2026-09-18): Phases 1, 2 and 3 are BUILT on `feat/quick-create` (stacked on
> `feat/home-doing-plane`), with the sweeps K2 K3 K6 K7(36px) K8 K9 K10 and N22 (+ its
> BLOCKING lint). K11 is DECIDED (Brian, 2026-09-18: §8.5 (a) — a "Create your first team"
> landing for leader tier) and in progress. Still open: K1 (phone primitives, ~20 surfaces),
> C8 (the flat-row pass), K7's PocketBackRow deletion (Congregation ×2), the
> Small-Group-Leaders set-up (its own pass).**
> A plan is a CLAIM, never evidence (lessons inbox 2026-08-17). Before acting on any
> box below, grep the code. Delete this file when the last phase ships.

Source: `tasks/design-pass/10-the-system.md` §3 R3 and §5; `02-event-workspace.md` §2/§3/§6;
`01-plan-workspaces.md` §3 C, §5. Already shipped from R3 (do NOT redo): the six truth fixes
(`feat/truth-fixes`), Home caps + curated Featured + compact checklist, the event member
tier (`feat/home-doing-plane`).

## The one rule this whole plan enforces

Every hub and workspace shows only the **doing** plane. Everything that configures the
plane — ladders, roles & permissions, categories, fund allocation, group generation,
season rollover, Curate, Compile, governance — sits behind ONE row, "Set it up", at the
foot of the hub it configures. Never a second tab strip, never a settings gear that
duplicates Church Settings. Doing = what someone does this week; set-up = what someone
does once a season.

## Phase 1 — Quick-path event creation (≈2 days) — DONE 2026-09-17

**Intent.** "New event → Quick social" is sold as light and delivers a 59-control modal
ending in an editable T-minus table (`01-plan-workspaces.md` §5). A quick path creates
from **title + date + place** and lands in the plan with the phases already right for the
horizon. Ladder editing lives INSIDE the event behind "Adjust the planning schedule".

**Anchors.** `AddEventModal` (`app/home/tabs/plan-tab.tsx` ~6616–7330): the path chooser
(~7134, every preset + Start from scratch — shipped in truth-fixes), the details form, and
`<CountdownLadderEditor>` (~7292) mounted inside CREATE. Ladder helpers:
`countdownPresetPhases`, `ladderOf`, `DEFAULT_COUNTDOWN_PRESET` (`countdown-ladder-editor`).
The ladder is stored on `event_plans` (see `refreshSignal` comment ~8060).

**Build.**
- [ ] Quick presets (social, ministry) and every rich preset: the create form is title ·
      date/time · place (+ the preset's name as the eyebrow). No ladder, no extras chips,
      no budget category in the modal. Extras/category come from the preset.
- [ ] Ladder auto-picked by horizon at save (short/standard/long from days-to-event —
      `01` §5 "T−1 WEEK = 14" is the bug this closes). Existing `handleSave` ladder write
      stays; only the UI leaves the modal.
- [ ] "Start from scratch" keeps a compact form but STILL no ladder editor (it is set-up).
- [ ] Inside the event (Phase 2's Set-it-up row): "Adjust the planning schedule" opens the
      same `CountdownLadderEditor` on the plan (edit mode already exists in the edit-event
      modal — move, don't fork; the edit-event modal loses the ladder block too).
- [ ] Phone: the create sheet is a `PocketSheet` with Pocket fields (K1 — `01` §4.1 block).
      This is the day-one flow every leader completes; do it here, not in a later sweep.
- [ ] e2e: `event-presets.spec.ts` extended — quick create is ≤ 4 controls; the plan's
      ladder matches the horizon; ladder editable from inside the event.

**Decisions already made:** B2 §6.3 (a) keep the ladder, plain-window labels later, editor
out of create. `01` §7.5 (b) — hidden behind "we'll remind you… change".

## Phase 2 — "Set it up" on the EVENT workspace (≈2 days) — DONE 2026-09-17

**Intent.** The event's set-up (ladder editor, extras chips, budget category, Compile /
Run-it-back, planning-chat config) leaves the doing plane. B2 §3.1/§3.6.

**Anchors.** `EventPlanWorkspace` (~8021): desktop `PlanSubTabStrip` `sections` (~8881),
mobile hub `HUB_META` rows (~9307). Compile card on past events (grep `Compile`, ~6710
"Run it back"). Extras = `extraTabs` on the plan.

**Build.**
- [ ] One "Set it up" row at the FOOT of the mobile hub (below Jump-into-planning rows,
      own kicker "SET-UP") and one "Set it up" ghost action on desktop Overview's section
      rule (Zone C, not the page header — Convention #15). Both open a single set-up
      surface: `SubpageShell` on phone, a right-side pane or subpage on desktop.
- [ ] Set-up surface contents, in this order: Adjust the planning schedule (ladder) ·
      Optional modules (Run of Show / Acts / Teams / Transport as switches) · Budget
      category & funds (canEditBudget only) · Compile as a playbook (past events only) ·
      Danger: delete event. Every commit staged behind Save (Convention #21).
- [ ] Optional modules OFF by default for quick paths; a module's tab/door appears only
      when on. (B2 §3.4 — extras as content, not peers.) Presets turn theirs on.
- [ ] Compile card leaves every past event's Overview; lives in set-up. Its payoff
      ("Run it back") stays at create time as today.
- [ ] Member tier: the row is `canEdit`-only.
- [ ] e2e: hub row count for a quick social = Overview · Countdown · Roles (+ Run of Show
      only once switched on); set-up surface stages and saves; member never sees the row.

**Decisions:** B2 §6.5 (b) keep two levels for containers, fix roll-ups later; §6.4
(announce) NOT in scope — separate feature.

## Phase 3 — "Set it up" on the TEAM workspace hubs (≈3 days) — DONE for the board + finance hubs 2026-09-17; SGL open

**Intent.** `01` §3 C. Roster confirm, roles & permissions, receipt categories, fund
allocation, group generation, season rollover go behind one row per workspace hub.

**Anchors.** `StudentOrgTeamHome` (~1222; sections, `rolloverSource` ~1451, season
rollover ~1909), `RotationsTab` `newSemesterTrigger` (~2138), groups `generateTrigger`
(~2004/11551), team settings (`workspace-settings`), Receipts categories
(`receipts-workspace.tsx`), Finance Allocation (`finance-workspace.tsx`).

**Build.**
- [ ] Board hub (phone) + desktop workspace home: doing = What's coming (events), Meeting
      notes, Calendar; "Set it up" row → Team settings (roster, roles & permissions —
      staged behind Save, `01` §7.7 (a)), Season (rollover / new semester), Categories,
      Allocation (finance team). Generate groups stays a body create on Groups (it makes
      a collection) — NOT set-up.
- [ ] SGL hub: doing = Schedule (my availability + this week's rotation), Bible study;
      set-up = roster confirm, rotation publisher, new semester.
- [ ] Home: Curate moves off the hero rule into Home's own "Set it up" (leaders only) —
      or stays as the single ghost; decide at build from the B4 §4.1 answer (Featured is
      curated now, so Curate is the one set-up control Home has).
- [ ] Church Settings: unchanged in this phase (R1 territory).
- [ ] e2e: each hub's row set at both widths; member sees no set-up row.

## Follow-on sweeps ratified with the rule block (each is one task; sizes are guesses)

| Sweep | Size | Note |
|---|---|---|
| K1 desktop primitives at phone width (~20 surfaces) | 1 wk | Phase 1 does the create sheets |
| DONE — K2 solid plum as selection → tint (9 sites) | ½ day | N6/N9 |
| DONE — K3 `--line-2` as fill → `--pocket-track` (7) | ½ day | |
| K4 600 → 500 on 15px list rows | — | no desktop sites; the phone rows are ratified 15/600 |
| DONE — K6 ghost creates → plum in the collection slot | ½ day | |
| K7 retired tiers — 36px DONE; PocketBackRow (Congregation ×2) OPEN | ½ day | |
| DONE — K8 22 raw `<select>`s in the event workspace + native date masks | 1–2 days | shared `Select` exists |
| DONE — K9 off-palette values | ½ day | hex ratchet already blocks new ones |
| DONE — K10 chrome-rhythm escapes (Receipts, compose) | ½ day | extend the sweep, never the band |
| K11 Plan zero-team landing for leader tier | 1 day | DECIDED 2026-09-18: (a) Create your first team |
| DONE — N22 integer type sizes (196 sites) + lint | 1 day | ratified; mechanical |
| C8 flat-row pass across Plan/Receipts | 2 days | ratified as "commit as one task" |

**Order:** Phase 1 → Phase 2 → K8 (the event workspace is open anyway) → Phase 3 → the
half-day sweeps in one batch → K1 → C8 → K11 after Brian's §8.5 call.
