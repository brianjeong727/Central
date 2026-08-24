## Deleting `.next` yourself before `npm run dev` wedges the dev server — every route 404s but `/` (2026-08-24)

Hit twice in one session. After `rm -rf .next && npm run dev -- -p 3002`, the
server starts clean ("✓ Ready in 17s"), `/` returns 200, and EVERY other route —
`/login`, `/ministries`, `/signup`, `/privacy` — returns **404**, each with a real
compile time in the log. No error anywhere.

It is not the app. `npm run dev` is already `rm -rf .next && next dev`, so doing
it yourself first means two deletes against the same directory on an
**iCloud-synced path** (this repo lives under `~/Desktop`), and CLAUDE.md already
warns that `rm -rf .next` can block for minutes there. The second delete races the
starting server's writes and it comes up with a half-populated route manifest.

**Rule: never pre-delete `.next` before `npm run dev`.** Kill the port, then let
the dev script own the delete. Both times, restarting WITHOUT the manual `rm -rf`
fixed it immediately.

**The expensive part was the misdiagnosis.** The 404s appeared right after an edit,
so the edit looked guilty; A/B-ing it (`git checkout` the file, restart, test)
"confirmed" that — because the restart, not the revert, was what fixed it. If an
A/B changes TWO things (your file *and* the server), it has proven nothing. Restart
first, re-measure, and only then start bisecting your own diff.
