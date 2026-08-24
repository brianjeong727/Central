## Two e2e users sharing a hardcoded name is a fixture that assumes no uniqueness rule (2026-08-24)

`young-adult-join.spec.ts` creates its users with a unique EMAIL and a constant
NAME ("YA Join"), and joins both to the same ministry. The moment a
one-account-per-ministry check landed, the second test stopped at the
duplicate-account interstitial and reported "the join must complete" — which
reads exactly like the join action broke.

It had not. The product had gained a rule the fixture predated.

**Rules.**
- Vary every field a future uniqueness or matching rule could plausibly key on —
  name as well as email — not just the one the DB currently constrains. Stamp them
  from the same value so they stay correlated and greppable.
- When an unrelated spec starts failing right after a behavioural change, ask
  "did the fixture rely on something I just made illegal?" BEFORE debugging the
  action. Here the answer was in the fixture's third line.
- Also worth noting the inverse, which cost the most time this session: a failing
  spec is NOT evidence you broke it. `member-profile-tap.spec.ts` failed the same
  run and was pre-existing. A/B it — save your file, `git checkout` the base
  version, re-run, restore — before spending anything on a fix.
