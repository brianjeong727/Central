## A failing e2e auth.setup is usually upstream, and `--no-deps` routes around it (2026-08-16)

Three consecutive Playwright runs died in `auth.setup.ts` — `page.waitForURL` timing
out at 30s with the login button stuck on "Signing in…". `46 did not run`, so the
whole batch reported nothing. The same specs had passed four times earlier in the
session against identical code.

It was not the code and not the dev server (`/`, `/login`, `/home` all healthy; the
second PID on the port was a Chrome tab holding a socket, not a rival server). The
Supabase **auth** logs showed request durations of **8–15.4 seconds** — ten requests
over 7s — against a 30s test timeout that must also cover page load, the POST and the
navigation. Latency drifts, so the setup passes or fails depending on when you run it.

Two things worth keeping:

**Diagnose before re-running.** `mcp__supabase__get_logs(service:"auth")` gives the
durations directly. Note the log payload is double-escaped JSON — the outer fields
(`"status":"200"`) and the inner ones (`\\"duration\\":123`) need different regexes,
and a naive `grep -c 429` matches request-ID substrings, not HTTP statuses. I "found"
two 429s that did not exist before parsing properly.

**`--no-deps` reuses the cached session.** `auth.setup.ts` writes `e2e/.auth/admin.json`
and `e2e/.auth/member.json`; the projects consume them via `storageState`. Running
`npx playwright test --no-deps <specs>` skips the setup project and uses whatever
state is already on disk. With sessions from an earlier successful login, the blocked
batch went **43 passed / 0 failed** immediately. Valid whenever the setup is the only
thing failing and the tokens have not expired — it is a diagnosis tool, not a way to
paper over a genuine auth regression, so confirm the failure is latency (or that your
diff touches no auth path) before reaching for it.

**Corollary on reading a blocked run:** "2 failed, 46 did not run" is not a signal
about the 46. Do not report a batch as failing when only its prerequisite failed —
and do not report it as passing either. Say which.

Related: [[never-npm-run-build-against-a-live-dev-server]].
