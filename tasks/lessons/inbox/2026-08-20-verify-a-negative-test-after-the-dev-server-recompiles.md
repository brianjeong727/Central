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

**The rule:** an e2e result against a running dev server is only valid once the server has actually
served the changed code. **RESTART the dev server** (`npm run dev` opens with `rm -rf .next`, so it
is a clean slate) and re-run.

Do NOT rely on warming the route with requests. It bit again the same day, in the other direction —
a genuinely correct fix in `app/home/tabs/profile-tab.tsx` reported as broken across three runs, and
a dozen `curl /home` calls in between changed nothing. Two reasons that warm-up is worthless here:
`/home` 307s for an unauthenticated request so nothing under it compiles at all, and the tab files
are `next/dynamic` chunks that are only built when a signed-in page actually asks for them. A clean
restart fixed it on the first attempt and the debug line appeared immediately.

The generalisation: **when an e2e result disagrees with a careful reading of the code, suspect the
bundle before you suspect the code.** Both times, the instinct was to go rewrite something that was
already right — once a spec, once a feature.

The failure mode is silent and it points the WRONG WAY — a false PASS on a negative check reads as
"weak test", and the natural response is to weaken or rewrite a spec that was already doing its job.
Both directions of a red/green check need the same "is the server serving this code yet?" discipline
that [[e2e-stale-compile]] would cover generally.

Related: this is the same class as reading a measurement before the layout settles — see the
`settled()` two-identical-reads pattern in `e2e/mobile-screen-sweep.mobile.spec.ts`. Read once, and
you measure whatever frame you landed on.
