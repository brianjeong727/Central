## Never `npm run build` in a slot with its dev server running (2026-08-08)

Hit twice in one session, both times mid-verification, both times costing a
confusing detour:

1. The Stop hook caught `/` returning **500** on :3002.
2. The full mobile e2e run died in `auth.setup.ts` — "authenticate admin" and
   "authenticate member" both failed, 55 tests never ran. That looks like broken
   auth or a bad fixture. It was neither.

Both are the same cause: `next build` and `next dev` share `.next`, and running
the build while the dev server is live corrupts it out from under the server.
Every route then 500s, and *whatever ran next* inherits the blame — which is why
it presented as an auth failure the second time. The symptom never points at the
cause.

**`scripts/verify.sh` already solves this** and is the reason it opens with
`▶ freeing port`: it kills the dev server FIRST, then builds, then restarts the
server, then polls for ready. That ordering is the whole point of the script.

So: never reach for a bare `npm run build` in a session worktree. Run
`scripts/verify.sh --port <slot port>`. If a build genuinely has to run alone,
free the port first and restart dev afterwards — but there is no reason to
hand-roll what verify.sh already does correctly.

Corollary for reading failures: when a test suite dies in `auth.setup.ts` or
every route 500s right after a build, suspect `.next` before suspecting the app.
Check `curl localhost:<port>/` — a 500 on a route that worked minutes ago is a
corrupted build directory, not a regression in the code under test.
