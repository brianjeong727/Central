---
description: FINAL SHIP — merge the current branch to main and push. Brian-only, manual-trigger. Assumes Brian has already given visual sign-off; executes immediately with no confirmation. Typing it IS the approval. Never invoked by the loop or any automated flow.
---

This is a FINAL SHIP. Brian typed this himself — he has already reviewed and approved the current branch. Execute immediately. No confirmation prompt, no re-running the loop.

Steps:
1. Confirm you are NOT already on main/master. If you are, stop — nothing to merge; say so in one line.
2. Capture the current branch name. If there are uncommitted changes, commit them first with a clear message — never silently drop them.
3. **Final build guard:** run `npm run build` ONCE. If it FAILS, STOP — do not merge a red build to main. This is the only thing that halts the command.
4. **Drop the single-use sentinel** so the main-branch-guard permits exactly one authorized push:
   `touch "$CLAUDE_PROJECT_DIR/.claude/.ship-authorized"`
5. Merge the current branch into main and push main. The guard will consume the sentinel and allow this one push; it re-arms immediately after.
6. **Clean up:** if the sentinel still exists for any reason (e.g. the push didn't reach the guard), delete it: `rm -f "$CLAUDE_PROJECT_DIR/.claude/.ship-authorized"`. The sentinel must never persist past this command.
7. Report in one human sentence what shipped and confirm main is pushed.

Never leave the sentinel file behind. Never create it outside step 4. Never re-verify visual correctness (Brian already signed off).