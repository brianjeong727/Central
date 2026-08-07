## Commit BEFORE checking out base files to A/B a fix — `git checkout --` restores from HEAD, not from your edits (2026-08-05)

Proving a new regression spec actually catches the bug means running it against the
old code. The obvious move is:

```
git checkout origin/main -- src/thing.ts   # revert to base
<run the spec — it should fail>
git checkout -- src/thing.ts               # "put mine back"
```

The last line does NOT put yours back. `git checkout -- <path>` restores from the
INDEX/HEAD, and HEAD is still the base commit — so it re-applies the same base
version and the uncommitted fix is gone with no stash, no reflog entry, nothing to
recover from. I lost a finished (typechecked, verified) change this way and had to
retype it.

**Rule: commit the fix FIRST, then A/B against base.** With the work committed,
`git checkout origin/main -- <paths>` is safe because `git checkout HEAD -- <paths>`
genuinely restores your version afterwards.

This also happens to be what the orchestration skill already asks for — commit the
completed work before dispatching verifiers — so the safe order and the standing
rule agree. The A/B itself is worth doing: it is the difference between "my spec
passes" and "my spec passes *and* fails without the fix", which is the only version
that proves the spec guards anything.

Related: [[2026-08-05-e2e-auth-rate-limit-looks-like-a-regression]]
</content>
