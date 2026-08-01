## A normally-red suite is not "known noise" — it is where real failures hide (2026-08-01)

Lane 2 (slot s2) had **26 failing specs**, long written off as "lane 2 is only seeded with the
tenant and two users." Diagnosing all 26 individually instead of blanket-skipping them found
**only 14 were actually about seeding**. The other **12 were real defects in the tests**, invisible
because nobody looks at a suite that is always red:

- **4 push specs hardcoded `http://localhost:3001`** — slot s1. Run from any other slot, every
  dispatch POST hit a **sibling worktree's dev server** (different branch, different code) while
  the assertions read *this* slot's database. Results were meaningless in both directions.
  Derive it: `` `http://localhost:${process.env.E2E_PORT ?? 3001}/api/push/dispatch` ``.
- **`perf-wave23` asserted three of the app's four greetings.** `home-tab.tsx` greets
  "Good night, " for hour >= 21; the regex was `morning|afternoon|evening`. The AUTH/MIDDLEWARE
  spec — the one guarding the `proxy.ts` embed regression — failed *every evening* and passed
  every morning. Any assertion on time-derived copy must enumerate the whole ladder.
- **`complete-profile-gate` raced the routing cache.** `proxy.ts` caches routing data INCLUDING
  profile-completeness in the signed `central-mw` cookie for 5 minutes. `auth.setup` mints a
  fresh one seconds before the test, so nulling the DB columns changed nothing and the gate
  never fired. It passed only when the cookie happened to be older than the TTL — order- and
  clock-dependent. Clear the cookie when testing a routing decision the proxy caches.
- **Six specs had simply drifted from the app** — the mobile settings hub (`?pset`), the
  `BackChevron` rename ("Back", not the old labeled row), a subpage title ("Team settings"),
  and a new default "Needs action" filter that hid a spec's own seeded row.

**The habit to copy:** when a suite is chronically red, run the failing specs on the *known-good*
lane first. Anything that fails there was never a lane problem. That single step reclassified 12
of these 26 in minutes, and it is what separates "skip it" from "fix it."

**Skip only fixture-absence.** Blanket-skipping the rest would have *disabled* coverage rather
than decluttered it — the opposite of the goal. Prefer making a spec lane-agnostic (derive
`sandbox().ministryName()` / `adminName()` / `memberName()` rather than hardcoding
"E2E Sandbox" / "E2E Admin", which differ by a ` 2` suffix on lane 2) — that keeps the coverage
in BOTH lanes instead of throwing it away.

Result: 26 failed → **0 failed, 132 passed, 21 skipped**, and the suite got *faster*
(15.1m → 6.0m) because failures burn timeouts.
