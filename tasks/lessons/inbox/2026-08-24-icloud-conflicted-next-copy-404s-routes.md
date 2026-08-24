## An iCloud "conflicted copy" of `.next` makes dev serve intermittent 404s (2026-08-24)

**Symptom.** `next dev` starts clean, `/` returns 200, and `/login`, `/signup`,
`/ministries` or `/api/push/dispatch` return **404** — not 500, not an error overlay,
and nothing in the dev log but `GET /login 404 in 1912ms (compile: 1226ms)`. The route
COMPILES and is then not found. `npm run build` lists the same route happily. A restart
sometimes fixes it and sometimes does not, which is what makes it read as flake.

**Cause.** This repo lives under `~/Desktop`, which iCloud syncs. iCloud had made a
conflicted duplicate of the build directory: `ls -d .next*` showed **`.next` AND
`.next 2`**. Restarting resolves it only when the restart happens to leave the working
copy consistent, which is why it looked random.

**Fix.** `rm -rf ".next 2"`, then a normal restart. Check for it the moment a route
404s that has no business 404ing — one `ls -d .next*` settles in a second what
otherwise costs several restart cycles.

**Cost.** Today this masqueraded three separate times as "my change broke the app":
once during the founder-gate work (reverted the fix to test, `/login` 404'd on CLEAN
`origin/main` — which is what proved it was environmental), once as a "route not
found" on `/api/push/dispatch` that turned out to return a correct 401 after a clean
restart, and once as a stale bundle during the poll redesign.

**Related trap, same family.** `next dev` also serves a STALE client bundle after a
source file is swapped underneath it (e.g. `git show origin/main:file > file` to test
"does my new test fail without the fix?"). That produced a false PASS twice. Kill the
server, remove `.next`, restart, and only then run the negative check — and prefer
`mv .next .next-stale-$$ && (rm -rf .next-stale-$$ &)` over a plain `rm -rf`, which can
block for minutes under iCloud.
