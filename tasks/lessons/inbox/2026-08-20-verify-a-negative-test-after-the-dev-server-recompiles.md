## A "does this test actually fail without the fix?" check must wait for the dev server to recompile (2026-08-20)

Standard practice after writing a regression spec: disable the fix, re-run, confirm the spec goes
red. Done in one Bash call — edit the source, immediately run Playwright — it reported **PASS**,
which would have been read as "this spec does not guard anything" and sent me rewriting a spec that
was already correct.

The spec was fine. Next's dev server had not finished recompiling the edited module, so the browser
was still being served the FIXED bundle. The edit was real on disk and irrelevant in the browser.

Re-running the identical check after driving a dozen requests at the route (giving Turbopack time to
rebuild) produced the expected failure — `a dm row should exist for the admin/member pair` — proving
the guard real.

**The rule:** a negative check against a running dev server is only valid once the server has
actually served the changed code. After toggling source, either

- hit the route repeatedly until it has demonstrably rebuilt, then run; or
- restart the dev server; or
- assert on something that proves which bundle is live before trusting the result.

The failure mode is silent and it points the WRONG WAY — a false PASS on a negative check reads as
"weak test", and the natural response is to weaken or rewrite a spec that was already doing its job.
Both directions of a red/green check need the same "is the server serving this code yet?" discipline
that [[e2e-stale-compile]] would cover generally.

Related: this is the same class as reading a measurement before the layout settles — see the
`settled()` two-identical-reads pattern in `e2e/mobile-screen-sweep.mobile.spec.ts`. Read once, and
you measure whatever frame you landed on.
