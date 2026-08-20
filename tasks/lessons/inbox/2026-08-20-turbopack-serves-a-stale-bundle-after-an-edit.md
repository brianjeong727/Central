## Restart the dev server before you believe an e2e result (2026-08-20)

Twice in one session the slot's `next dev` kept serving a STALE module after a
source edit, and both times the wrong conclusion was one step away:

1. Added `useSwipeToReply` to the `components/central` barrel. `tsc` passed and
   the export was plainly in the file, but the running server insisted
   *"The export useSwipeToReply was not found in module .../index.ts … All exports
   of the module are statically known"* and 500'd `/home`. Nothing was wrong with
   the code. A restart fixed it.
2. Removed an `overflow-x: clip` from a row and re-shot the screen. The
   screenshot was byte-for-byte unchanged, which read as "the fix did nothing" —
   so the next move would have been to change something that was already correct.
   A DOM probe showed the row still computing `overflow-x: clip` from the old
   bundle; after a restart it read `visible` and the geometry was right.

The dangerous version is the third case: **proving a regression test actually
catches the bug.** Reverting the fix, re-running, and seeing the test still PASS
looks exactly like "this test is decorative" — the conclusion being that the test
is worthless, when in fact the browser never received the reverted code. Restart,
re-run, watch it fail, restore, watch it pass. A test whose failure you have not
personally seen is a test you have not verified.

Rule: after editing a module that a running spec loads, restart the slot's dev
server before drawing any conclusion from a screenshot, a DOM probe, or a
pass/fail. `scripts/verify.sh` already restarts it for you; an ad-hoc
`npx playwright test` does not.

Related: [[measure-realtime-payloads-dont-infer-them]],
[[probe-the-service-dont-reason-about-it]].
