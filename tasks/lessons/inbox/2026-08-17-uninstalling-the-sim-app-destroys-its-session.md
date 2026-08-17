## Uninstalling the sim app to clear a cache also destroys its session (2026-08-17)

The simulator was rendering blank after a dev-server restart. Suspecting the
WebView had cached a bundle from the window where the server was 404ing, I ran
`xcrun simctl uninstall app.joincentral` and reinstalled via `cap run`.

It came back blank again — because the app was now **signed out**. The devlog said
it plainly: `AuthApiError: Invalid Refresh Token: Refresh Token Not Found`, then
`GET /login 200`. Uninstall wipes the app container, and the Supabase session lives
there. The blank screen after the reinstall was a DIFFERENT failure from the blank
screen before it, with the same appearance.

**Two rules.**

1. **Uninstall is not a cache-clear — it is a logout.** Getting the session back
   means typing a password, which Claude must never do, so this converts a problem
   I could investigate into one only Brian can finish. Reach for a reload or a
   fresh `cap run` (which reinstalls over the container and KEEPS it) first; treat
   uninstall as the last resort and say out loud that it will sign the app out.
2. **Two identical-looking symptoms are not evidence of one cause.** "Still blank"
   read as "my fix didn't work," when in fact the first blank was one thing and the
   second was one I had just created. Before retrying a remedy, re-derive the
   symptom from the SERVER side — the devlog named the second cause in one line and
   would have named it before the reinstall too.

Corollary on when to stop: this was the fourth blank launch. The orchestration
doctrine says two failures on the same point ends the retry loop and escalates. The
useful move at attempt two was not another remedy, it was `curl -A "…CentralShell"`
against the routes — which is what finally showed `/` → 307 → `/login` and settled
that the shell was signed out, not broken.

Related: [[never-npm-run-build-against-a-live-dev-server]],
[[2026-08-16-e2e-auth-setup-is-an-upstream-dependency]].
