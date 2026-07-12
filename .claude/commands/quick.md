---
description: Explicit solo-lane confirmation for a trivial change (rename, copy tweak, one-line fix). Since the lane doctrine made SOLO the default, this command just short-circuits lane deliberation — main session edits directly, verify.sh gates it, commit, push decision. No subagents. NOT for schema/RLS, permissions, design-system changes (/designchange), or anything multi-file/structural — those triggers force the orchestrated lane regardless of this flag.
---

Brian has flagged this change as QUICK — he's pre-answered lane selection: SOLO, no deliberation. Load `.claude/skills/orchestration/SKILL.md` for the conventions, then:

1. **Sanity-check the premise.** If the change actually touches an orchestrated-lane trigger (schema/RLS, permission semantics, shared token/component ripple, multi-file structure), STOP and say so in one sentence — the trigger wins over the flag.
2. **Make the edit yourself.** Main session, direct edit. Re-read the file first.
3. **Gate it:** `scripts/verify.sh --port <slot port>` (add `--e2e` if the change is user-facing — trivial ≠ unverified).
4. **Commit once** on the current feature branch. Never main.
5. **Close with the Step 7 push decision** — one human sentence, the diff, the buttons.

The change Brian wants follows:

$ARGUMENTS
