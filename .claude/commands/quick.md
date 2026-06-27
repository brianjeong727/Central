---
description: Fast lane for trivial changes (renames, copy tweaks, a one-line fix). Engineer makes the edit, build/type-check confirms it, commit, push decision. SKIPS the Enforcer and Explorer — use only when the change touches no design rules, no architecture, and no permissions. NOT for design changes (use /designchange) or anything multi-file or structural.
---

This is a QUICK-LANE change — trivial, low-risk, no ceremony. Load `.claude/skills/orchestration/SKILL.md` for the human-voice, commit, and push-decision conventions, then run this stripped path instead of the full loop:

1. **Expand briefly.** Confirm with yourself what's being changed and that it's genuinely trivial. If expansion reveals the change is NOT trivial — it touches multiple files, a shared component, a token, RLS/permissions, or design-system surface — STOP and tell Brian in one sentence that this needs the full loop (or /designchange), and don't proceed on the quick lane.
2. **Dispatch the `engineer`** to make the edit.
3. **Build check only.** Run `npm run build` (type-check included). NO Enforcer, NO Explorer, NO E2E, NO screenshots. The build passing is the bar.
4. If the build fails, kick back to the engineer and retry — silently, same as the normal loop. Don't surface a self-healing build break to Brian.
5. **Commit once** on the current feature branch with a clear message. Never main (the hook backstops this).
6. **Hand off and ask the push decision** (Step 7 of the skill): lead with one human sentence, show the diff, then:
   ( ) Push it
   ( ) Push it, but I have a note
   ( ) Don't push — needs work

The change Brian wants follows:

$ARGUMENTS