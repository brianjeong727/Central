## "We already did that on web" — check the branch before you rebuild it (2026-08-06)

Brian asked me to make mobile match a web change that retired plan-start/crunch in
favour of a T-minus ladder. The change existed — as ONE commit on
`feat/countdown-ladder`, written five days earlier, **never merged, no PR ever
opened**, by then 30 commits behind main. Building "mobile to match web" would have
meant reimplementing a 931-line feature (presets, a ladder editor, 259 lines of
e2e) that already existed, and guaranteeing a brutal conflict if the branch ever
landed.

**Rule: when a request references existing work, verify it is ON MAIN before
writing anything.** `git log --all --grep=<concept> -i` then
`git merge-base --is-ancestor <sha> origin/main`. Two commands, ~20 seconds, and
here it changed the entire shape of the task.

Two things made the false memory believable, and both are worth knowing:

- **The DB was already migrated.** All 80 `event_plans` rows carried a backfilled
  `countdown_phases` while every code path still read the retired columns. A
  migration landing without its code is a genuinely confusing half-state — the
  schema says the feature shipped and the app says it didn't. When a commit plans
  "additive migration now, drop columns later", the un-merged window is exactly
  this trap.
- **An unrelated change made it LOOK done.** Desktop Overview showed no
  plan-start/crunch pair — not because the ladder shipped, but because a later
  event-panes pass had deleted the desktop facts grid for its own reasons. The
  surface Brian happened to check was clean by coincidence.

Corollaries:

- **A branch with no PR is invisible.** Nothing surfaces it in review, in CI, or in
  `gh pr list`. If work is worth keeping, open the PR the day it is written even if
  it is not ready to merge — otherwise its only trace is a name in `git branch -a`.
- **Merge INTO the current tree, not the other way.** Checking out a 30-commit-stale
  branch rewinds the whole worktree; branching from HEAD and merging the stale
  branch in reaches the same commit with a diff the size of the feature. On this
  repo (iCloud-synced `.git`) the difference was a 2-minute hang versus instant.
- **Resolve conflicts by DECISION, not by side.** Each of the four here needed a
  different answer — take theirs (the ladder editor), take mine (the rewritten
  Overview), take both (two functions plus a rewritten comment), take neither
  verbatim (`onGoRunSheet` was deleted on main after the branch was written).
  `--ours`/`--theirs` wholesale would have been wrong every time.

Related: [[2026-08-01-relative-benchmarks-beat-absolute-anchors]]
</content>
