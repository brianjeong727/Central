## `/ship`'s build guard kills the slot's dev server — restart it before handing back (2026-08-08)

**What happens.** `/ship` runs `npm run build` as its quality gate. That script is
`rm -rf .next && next build`, and the slot's `next dev` is serving out of that same
`.next`. The directory is deleted underneath the running server, so every route
starts returning **HTTP 500** — and the failure appears AFTER the merge, when the
work looks finished.

It fired twice in one session (both `/ship` runs). It is not a flake; it is what
the command does every time the dev server happens to be up, which is almost
always in a session slot.

**The fix, in order:**

```bash
lsof -ti:<slot port> | xargs kill -9   # before the build guard
# …build, push, merge…
rm -rf .next && npm run dev -- -p <slot port>   # after
curl -s -o /dev/null -w '%{http_code}' http://localhost:<slot port>/   # expect 200
```

Always `-p <port>`: `next dev` ignores the `PORT` env var, so a bare launch binds
3000, collides with the shared checkout, and wedges while holding the slot's
`.next`.

**Why the Stop hook is not enough.** It catches the 500 and blocks the handoff,
which is the safety net working — but by then the merge has already landed and the
session ends on a broken server. Treat the restart as part of shipping, not as
cleanup prompted by the hook.

**Health check before reporting:** `/` and `/login` should be `200`; `/home`
returning `307` is CORRECT (the auth redirect for an unauthenticated curl), not a
failure. Reading that 307 as an error is its own small trap.

`scripts/verify.sh` got this right from the start — it frees the port, builds, then
restarts and polls. `/ship` did not, because its guard was a bare `npm run build`.

**FIXED 2026-08-09** — `.claude/commands/ship.md` now frees the port before the
build (step 3) and restarts + polls a rendered route before reporting (step 8).

The part worth keeping after the fix: **writing this lesson down did not stop it
happening again.** It was captured after the second occurrence, and the very next
ship broke the server the same way — the lesson sat in a file nobody re-reads
mid-task, while the failure sat in a command that ran unchanged. A recurring
operational failure needs the fix in the RUNBOOK that executes, not a note about
the runbook. Prefer editing the command over recording the mistake.
