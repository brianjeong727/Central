# Events with sub-events: what belongs at which level

**Status: DECIDED AND BUILT** — `feat/event-container`, 2026-07-30. Written first as
an open question alongside the Run of Show rename (`feat/run-of-show-dates`), which
fixed the *symptoms* under "Already fixed" and left the model alone; resolved the same
day. Kept as the record of what was decided and why, not as a live question.

## What shipped

A **container** is an event whose `extraTabs` include `sub_events` and which is not
itself a child — derived in `EventPlanWorkspace` as `isContainer`. `extraTabs` is fixed
at creation, so a parent's tab set never rearranges the moment its first night is
added (which a `has children` check would do mid-planning). The surfaces live in
`app/home/tabs/event-container.tsx`, fed by one batched `useContainerRollup`.

| Surface | Container behaviour |
|---|---|
| `runsheet` | **Read-only merged week timeline** — every night's blocks stitched chronologically, grouped by date, drilling into the night that owns each. No editable blocks on the week. |
| `roles` | The week's own roles under **WEEK-SPANNING**, then **ACROSS THE NIGHTS**: an editable staffing table covering every night. |
| `checklist` | The week's own list, then a read-only **ACROSS THE NIGHTS** roll-up of the nights' open items. |
| `sub_events` | Unchanged, now fed by the shared rollup instead of repeating its own three queries. |

**Where a night's lead is entered: on the night.** The staffing table writes the
*night's own* `event_roles` row — the identical statement the night's own screen
issues — so the week is a second place to *work*, never a second place data lives.
Verified end-to-end: assigning from the week updates the row in the database (checked
by direct query, not the UI) and the same person then shows on the night's own Roles
tab.

Nothing is stranded: blocks written on the week itself before this surface under an
"On the week itself" section rather than disappearing, matching the orphaned-block
rule shipped in `93fd4d2`.

Also removed: `canHaveSubEvents`, a field declared on all 7 presets and read nowhere.
`extraTabs` was already the real signal; two competing flags is how this drifts again.

## Still open

- Should a container's readiness roll up from its nights into one number? The data is
  there (`ContainerChild.done/total`); no surface aggregates it yet.
- Should a night inherit the week's roster/roles as defaults? Deliberately not built —
  too magical for v1.
- Nesting stays capped at one level.

---

*Original framing below, kept because the reasoning is the justification.*

---

## The question

> "If I have someone as a role to lead a specific sub-event, where do I enter that
> info in? On the event level or the sub-event level? It gets confusing. We need to
> figure out what should intuitively live at the event level and the sub-event level."

Welcome Week has a Run of Show. So does Popsicle Social, which is one night *inside*
Welcome Week. Welcome Week has a Roles & Leads tab. So does every night. Nothing in
the product says which one is the real place to put anything.

## Why it happens

`plan-tab.tsx` (`EventPlanWorkspace`) hands **every** event the identical four core
tabs, with no notion of container vs leaf:

```ts
const coreTabs: ActiveSection[] = ['overview', 'checklist', 'roles', 'runsheet']
```

`parent_event_id` is used for exactly two things today:

1. Filtering children out of the top-level events list (`plan-tab.tsx:1128`).
2. Feeding the `Sub-events` tab, which is offered only when `!parentEventId` —
   i.e. nesting is capped at one level (`plan-tab.tsx:6816`).

It carries **no** semantics beyond that. A child gets the same workspace as a
standalone event; a parent gets the same workspace as a leaf, plus a list.

## The observation that motivates this

Welcome Week, as a thing to *plan*, has almost nothing in it. The real work lives in
the nights. What genuinely belongs to the week itself is thin and umbrella-shaped:

- the list of nights
- a shared budget
- the roster of who is around all week
- a handful of week-level tasks ("grab everyone's contacts by the end")

Everything with a clock or a person standing somewhere — a run of show, a role
assignment, a day-of confirmation — belongs to **the thing that actually happens**,
which is the sub-event.

## A shape worth arguing about (not a decision)

Treat a parent with sub-events as a **container**, not an event:

| | Container (Welcome Week) | Leaf (Popsicle Social) |
|---|---|---|
| Sub-events list | ✅ its primary surface | — |
| Countdown / checklist | ✅ but umbrella-scoped only | ✅ |
| Roles & Leads | roster-level ("who's around this week") | ✅ the real assignment surface |
| Run of Show | ❌ — it has no single day-of timeline | ✅ |
| Budget | ✅ rolls up from children | contributes upward |

Open sub-questions this raises:

- Does a parent's readiness roll up from its children's checklists? (`SubEventsTab`
  already computes per-child done/total — the data is there.)
- Should a child inherit the parent's roster / roles by default, with per-night
  overrides?
- Is "container" a stored flag, or purely derived from `has children`? Derived is
  cheaper but flips a parent's tab set the moment its first child is added, which
  is jarring mid-planning.
- One level of nesting is currently hard-capped. Does that hold?

## Already fixed (do not re-litigate these here)

Handled in `feat/run-of-show-dates` — they were symptoms of the above, not the
model problem itself:

- Run of Show day headers no longer print "Day N"; they're date-only.
- The day span is a calendar-day count, not a timestamp walk (a 5 PM → 2 PM
  three-day retreat used to render two days).
- Blocks stranded past a shortened end date surface instead of silently vanishing.
- Overview now shows the event's end date **and day count** — the absence of which
  is why a Welcome Week seeded at the preset's `durationDays: 14` sat unnoticed
  against a shorter reality.
- Sub-events dated outside the parent's range are flagged (named, not corrected —
  `end_date` stays the user's to set).
- The dead "Program" module (a blank tab that duplicated Run of Show by name) is
  retired.

## Relevant code

| What | Where |
|---|---|
| Core tab set handed to every event | `app/home/tabs/plan-tab.tsx` (`EventPlanWorkspace`, `coreTabs`) |
| Sub-events list + per-child readiness | `app/home/tabs/plan-tab.tsx` (`SubEventsTab`) |
| Sub-event creation (inherits nothing from the parent) | `app/home/tabs/plan-tab.tsx` (event modal, `parentEventId`) |
| Preset day-durations that seed `end_date` | `app/home/event-presets-data.mjs` (`durationDays`) |
| Run of Show blocks | `event_blocks` (`day_index` is relative to the parent's `start_date`) |
