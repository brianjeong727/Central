## E2E fixtures with absolute dates rot silently as real time walks past them (2026-08-05)

Two specs were failing on `main` for the same reason: their fixtures hardcoded
absolute dates that were future when written and are now past.

**`event-time-propagation.spec.ts`** created its parent/child events at fixed
`2026-08-03` / `2026-08-04`. By 2026-08-05 the child night was yesterday, so it
no longer rendered in the timeline and test 2 — which reads the sub-event
disclosure row off the UP-NEXT event's default-open panel — timed out.

**`countdown.spec.ts`** asserts badge states (overdue / armed / fired) that are
all functions of *where today falls inside the task spread*. The seeded retreat
was 2 days out, so every task was past-due and the "armed with a future fire day"
state had become **unreachable** — no task could be both future-dated and more
than 2 days pre-event.

**Rules:**
1. An e2e fixture date must be expressed relative to today, never as a literal.
   Anchor once (`const ANCHOR = addDaysYMD(todayInZone(zone), N)`) and derive
   every other date from it, preserving the authored offsets. Then the deltas the
   assertions depend on can never drift apart.
2. Pick the anchor from what the *product* requires, not from convenience. Two
   traps found here:
   - "Up next" means the next event that **starts in the future** — an event
     already in progress is not up-next, so a fixture straddling today fails a
     test that needs it up-next.
   - The anchor must also beat any OTHER seeded event on the same team. The
     retreat at +2 days was stealing up-next from the propagation fixture.
3. Prefer a re-anchor in `beforeAll` that recomputes the delta from the current
   date each run. It is idempotent and self-healing — the fixture can never rot
   again — and it beats a one-off re-seed, which only moves the expiry date.

**Related:** these had been failing unnoticed because CI's e2e job never runs —
see [[ci-e2e-false-green]]. One of the two breakages (the countdown rail's
`defaultCollapsed`) was introduced by a PR that merged green.
