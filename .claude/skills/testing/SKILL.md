# Testing Skill

Activates on **every task** — any feature built, changed, or fixed. "It works on the happy path" is not done; handing over something that requires the user to find bugs is a failure.

Situational depth lives in `references.md` (same dir) — load ONLY the section the task touches (routing below), not the whole file.

## Pre-code: answer these five before writing implementation code

1. What tables does this read from / write to?
2. Does every join have a real FK? (→ references.md §Schema verification — never assume)
3. What are the failure modes if a DB call returns null or throws?
4. What does the UI show with no data yet?
5. Which roles can access this — and what exactly is blocked for each?

Can't answer all five → read the schema and PRD first.

## The checklist (every item before marking any task complete)

1. **Happy path** — the full user action completes and the result is persisted, not just rendered.
2. **Empty state** — non-broken UI before any data exists (copy/CTA/loading, never a blank screen or JS error).
3. **Edge cases** — 0 items, 1, 2, the maximum (clamp, don't crash), duplicate inserts (RSVP toggle must not create two rows).
4. **Permission boundaries** — test ≥2 roles; verify the restriction holds in the UI AND at the DB level (server action / RLS). A UI role check alone is never sufficient.
5. **DB persistence** — after any write, refresh the page or query Supabase directly. "It appeared in the UI" is not evidence (optimistic updates lie).
6. **Error states** — every failure mode has visible feedback (toast/inline/disabled); nothing fails silently. Pattern: references.md §Server-action error handling.
7. **Realtime** (if used) — unique topic per resource, synchronous channel cleanup, two-tab test (references.md §Realtime).
8. **Mobile** — 390px: no horizontal overflow, ≥44px touch targets.
9. **Concurrency** — any resource two users can touch simultaneously has a UNIQUE constraint or conflict handling (`ON CONFLICT DO NOTHING` / optimistic locking), not hope.

## Sandbox verification & self-test handoff (every task)

Verify against **Brian's Sandbox** — the private prod sandbox ministry `6c68111b-0248-45ba-9ab1-169ee33f62c9` (`is_sandbox=true`), NOT the automated E2E tenants (`is_sandbox=false`). For every feature/phase:

1. **Seed what it needs** — real rows via Supabase MCP scoped to `6c68111b…` (users, teams, events, plans, tasks, confirmations…). Never mock. When seeding messages/announcements, disable `notify_new_message`/`notify_new_announcement` in one tx, insert, re-enable (push is live in prod — this avoids phone spam).
2. **Play it out end-to-end** in that ministry (sim / browser / SQL probes) as the relevant role — super POV switching works here (`is_sandbox=true`). Build-and-assume is not verification.
3. **Leave the fixtures in place** so Brian can self-test.
4. **Write a "How to test it yourself" section** in the handoff — the exact seeded rows (event titles, member names, IDs) + the click path (`/pick-ministry` → "Brian's Sandbox" → …), so Brian verifies without you.

Cast, push-safety trick, and teardown details live in memory `project-personal-sandbox` — load it before seeding.

## Routing into references.md

| Task involves… | Read |
|---|---|
| Computed semester/year/cohort labels as filter keys | §Date/semester boundaries |
| A Supabase join in a server action | §Schema verification |
| Any server action | §Server-action error handling |
| Supabase Realtime | §Realtime channels |
| Writing/fixing Playwright specs | §Playwright selector & wait rules |
| A debugging session going in circles | §Efficiency rules |
| Testing on joincentral.app after a push | §Vercel deployment lag |

## Definition of done

Happy path ✓ empty state ✓ edge cases (0/1/max) ✓ ≥2 roles verified (UI + DB) ✓ persistence confirmed in Supabase ✓ errors visible ✓ realtime cleanup (if applicable) ✓ 390px layout ✓ seeded + exercised in Brian's Sandbox ✓ "How to test it yourself" section written ✓ `scripts/verify.sh` passes. Any unchecked → not complete.
