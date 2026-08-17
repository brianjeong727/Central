## A test fixture that takes a slower path than real users is a SEEDING bug, not a timeout (2026-08-17)

**What happened.** `e2e/auth.setup.ts` started timing out — `waitForURL(/\/home/)` blowing
its 30s budget — and it failed identically on unmodified `main`, so it read as an
environmental flake on a loaded machine. The obvious fix was to raise the timeout.

The page snapshot at failure said otherwise: the submit button was
`"Signing in…" [disabled]`. The click worked; the chain behind it was just slow. Timing
each hop directly:

```
signInWithPassword   1.08s
getUser              0.69s
user_ministries      0.36-1.04s   → returned []
profiles fallback    0.35s        → only runs BECAUSE the previous returned []
→ then navigate to /home          ≈ 7.2s end to end
```

`handleLogin` reads `user_ministries` first and only falls back to `profiles.ministry_id`
when that comes back empty. **Both e2e fixtures had zero `user_ministries` rows**, because
they were inserted straight into `profiles` and never went through
`joinMinistryByCode` / `submitMinistryApplication` / `approveMinistry` — which are what
write that table. So the harness was exercising a two-query fallback path that no real
user takes, on every single test run.

Seeding the four fixture rows: 7.2s → 4.1s warm, and `auth.setup` passes in 5.8s / 4.6s.

**The rule.** When a fixture is slow or flaky, check whether it reaches the code by the
same route a real user does. A fixture created by direct table inserts skips whatever the
real signup/join path writes, and every one of those omissions is a branch your tests take
and your users don't — or worse, the reverse. Raising the timeout would have preserved the
divergence *and* hidden it.

**The near-miss worth recording.** Counting rows made it look like a product bug: 429 of
444 profiles-with-a-ministry had no `user_ministries` row, i.e. "96% of users take a wasted
query". I nearly proposed reordering the login queries on that basis. Broken down by
cohort it was 403 load-test fleet accounts, 4 e2e fixtures, 10 sandbox seeds, 5 App-Store
demo accounts and 5 deleted-account tombstones. **Real users: zero missing.** The table is
healthy; the seed data is what is anomalous.

In a database that is mostly fixtures, an aggregate over all rows is a statement about your
seeding, not about your users. Group by cohort before believing any such number.

Related: [[a-perf-number-from-a-loaded-machine-is-not-a-number]]
