# Plan — replace plan/crunch dates with customizable T-minus benchmarks

Raised by Brian 2026-07-30 during the event-time-propagation fix, in response to enforcer BLOCK B1. **Not built in that task** — this is its own workstream. Captured verbatim in intent so it isn't lost.

> **Status 2026-07-31:** still open. The timezone pass (`feat/timezone-correctness`) landed since this was written and changes two of its assumptions:
> - The **prerequisite is gone.** That pass fixed the UTC-store/local-display bug this plan listed as "arguably a prerequisite" — event times are now true instants rendered in `ministries.timezone`, and `lib/tz.ts` is the one conversion layer any benchmark math should use.
> - The **stopgap this plan says to delete is now real code.** `AddEventModal.handleSave` shifts `plan_start_date`/`crunch_date` by the event's date delta, marked `STOPGAP` in-comment. Deleting it is part of this work, not a separate cleanup.
> - `event_plans.plan_start_date`/`crunch_date` are DATE columns and stay tz-immune — do NOT convert them through a zone (see `tasks/lessons.md`, "Date-only columns are not timezone problems").

## Brian's words

> "this is its own bug we need to fix. we need to remove the plan start and crunch start idea entirely. if u look at countdown, we changed the format to T-4 weeks or T-3 weeks, so on. so i think for creating the event info, instead asking for plan and crunch dates, it should ask for which benchmarks they would want. and have a presetted recommended benchmarks and it's completely customizable to them. and if they want to change it later, they can change it in the edit event whenever."

## What this replaces

`event_plans.plan_start_date` and `event_plans.crunch_date` — two absolute dates, hand-set at event creation in `AddEventModal` (`app/home/tabs/plan-tab.tsx:6455-6471` seed, `:6863` crunch input, `:6604` write). They are the anchors `EventPlanWorkspace.sectionOf` (`:8092-8098`) uses to bucket checklist tasks into Planning / Crunch phases, and they render as Overview facts (`:8556-8557`).

**Why they're broken:** they are absolute dates that do not move when the event moves, while the countdown UI has already migrated to a relative T-minus format. B1 is the concrete symptom — shifting task due dates without shifting these anchors collapses every task into Crunch and empties Planning. The two representations disagree.

## The shape Brian wants

- Event creation asks **which benchmarks** the team wants, not two dates.
- Benchmarks are **relative** (T-4 weeks, T-3 weeks, T-1 week, …) — matching the countdown format already shipped.
- A **recommended preset set** is offered by default.
- Fully **customizable** — add, remove, retime.
- **Editable later** from Edit event, at any time.

## Why relative fixes B1 by construction

A benchmark stored as an offset from the event date has nothing to re-anchor: move the event and every benchmark moves with it automatically. The whole class of "one anchor moved, the other didn't" bugs disappears, and the stopgap delta-shift added in commit `016069e` gets deleted.

## Known scope when this is picked up

- **Schema:** `event_plans.plan_start_date` / `crunch_date` retire; benchmarks need a home (a new table, or jsonb on `event_plans`). Migration + backfill converting existing absolute dates to offsets. **Mandatory `rls-reviewer` gate, twice.**
- **Consumers to migrate:** `sectionOf` phase bucketing (`:8092-8098`), Overview facts (`:8556-8557`), the countdown display, the `refreshSignal` plan re-fetch (`:7728-7758`), task seeding at creation (`:6621-6635`), and `season-rollover.ts` (which currently recomputes absolute dates).
- **Delete on arrival:** the plan-window delta-shift stopgap in `016069e` (`handleSave`), and the `crunch_date` input in `AddEventModal` (`:6863`).
- Design: the benchmark picker is net-new UI — needs the design system consulted, and possibly a `/designchange` if it introduces a new pattern.

## Related, worth folding in or at least deciding on

- **C6** (from `findings.md`): shortening an event's date range silently orphans `event_blocks` with a higher `day_index`. Same family of "the event moved and something derived didn't follow" bugs.
- The **UTC-store / local-display timezone bug** (`lessons.md:96`) — still unfixed, and it distorts every date this feature touches. Arguably a prerequisite.
