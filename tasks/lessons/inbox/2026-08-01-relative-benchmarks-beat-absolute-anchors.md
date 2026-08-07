## Relative benchmarks delete whole classes of sync bug that absolute anchors create (2026-08-01)

Event planning ran on two overlapping models: `event_plans.plan_start_date` + `crunch_date`
(absolute DATE anchors) and a hardcoded `PHASE_META` T-minus ladder in `countdown-tab.tsx`.
Replacing both with ONE stored, per-plan ladder of RELATIVE offsets
(`event_plans.countdown_phases`) deleted three separate pieces of machinery outright:

- **The date-shift stopgap** (`plan-tab.tsx`, ~13 lines + its own comment admitting it was a
  stopgap). Because `sectionOf` bucketed by comparing a task's `due_date` to an ABSOLUTE
  `crunch_date`, moving an event had to shift the anchors by the same `dayDelta` as the tasks —
  or every task collapsed into Crunch and Planning emptied. Offsets need no shift.
- **The first-time seeding write**, which derived plan-start = event−1mo / crunch = event−1wk and
  persisted it. It had to count back from the MINISTRY's calendar day, because seeding off the
  viewer's day gave a Tokyo leader different phase boundaries than an ET leader for the same
  event. A relative ladder has no such hazard: it means the same thing in every timezone, so
  there is nothing to pin down once.
- **The rollover re-basing** (`season-rollover.ts`), which shifted both columns by the season
  delta. The ladder copies verbatim.

**Why:** an absolute anchor derived from another value has to be re-derived every time that value
moves, and every re-derivation is a place to get it wrong. The bug isn't the arithmetic — it's
that the arithmetic exists at all. The tell was already in the codebase: the stopgap's comment
said "Relative benchmarks make this whole shift unnecessary," and the e2e suite had a dedicated
test asserting the shift stayed in lockstep. **A test that exists only to prove two derived
values track each other is evidence one of them shouldn't be stored.**

**How to apply:**
- When a stored value is DERIVED from another stored value, prefer storing the relationship
  (offset, ratio, rule) over the derived result. Then a change to the source needs no migration
  of the derivative.
- Before adding "shift B whenever A moves" logic, ask whether B should be expressed relative to A
  instead. If the answer is yes, the shift code is the bug, not the fix.
- Deriving a per-tenant value from a calendar day is a timezone hazard by construction
  (Convention #23). Relative offsets sidestep it entirely — there is no day to project.
- When replacing a model, REWRITE the tests that encoded the old contract rather than deleting
  them: `event-time-propagation.spec.ts` tests 5 and 8 now assert the ladder is *untouched* by a
  date move, which is a stronger property than the lockstep-shift they used to assert.
- Two models for one concept is the real defect. `PHASE_META` (display) and plan-start/crunch
  (storage) were bridged by `sectionKeyForPhase(key, hasCrunch)` — a function whose whole job was
  translating between two encodings of the same idea. A translation layer between your own models
  is a merge waiting to happen.

Related: [[url-state-persistence]]
