## Repeated e2e runs hit Supabase auth rate limits, and the flake looks exactly like a regression (2026-08-05)

`e2e/auth.setup.ts` logs both sandbox users in through the REAL `/login` UI on every
`npx playwright test` invocation. Run the suite six or eight times in quick
succession — normal when you are A/B-ing a fix — and Supabase starts throttling the
sign-ins. What you see downstream is NOT an auth error:

- `page.goto: Test timeout of 30000ms exceeded`
- `expect(received).not.toBeNull()` on a row a click should have created
- a *different* subset of tests failing on each run
- eventually the honest signal: `[setup] › authenticate member` itself fails

The first three are indistinguishable from a real regression in whatever you just
changed, and the failing set moving between runs is the only early tell.

**Rule: a shifting failure set across identical runs means infrastructure, not your
diff.** Stop bisecting, wait ~2 minutes, re-run. Both times this session, the suite
went fully green after a cooldown with no code change.

Corollaries worth keeping:

- **Failure-set instability is the diagnostic.** A real regression fails the same
  tests every time. If run N fails tests {1,9} and run N+1 fails {4}, the variable
  isn't the code.
- **A timeout is not an assertion failure.** `page.goto: Test timeout` never means
  "the feature is broken" — it means the server or the session didn't answer. Read
  the error *kind* before reading the test name.
- **Prefer running ONE spec file while iterating.** The long serial runs are what
  burn the rate-limit budget; save the multi-file run for the final gate.

Related: [[2026-08-05-commit-before-ab-testing-against-base]]
</content>
