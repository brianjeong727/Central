---
description: Flag this task as an authorized design-system change. Pre-authorizes the DESIGN_SYSTEM.md doc edit (no separate approval), triggers propagation to every usage, and surfaces any usage that didn't inherit (inline drift). Does NOT skip visual sign-off.
---

This task is an authorized DESIGN-SYSTEM CHANGE. Brian has declared that this prompt is meant to alter the design system.

Load `.claude/skills/orchestration/SKILL.md` and apply its "/designchange handling" section in full. In summary, for THIS task only:

1. Make the change at the TOKEN / COMPONENT source — never inline.
2. Propagate: find every usage and confirm it inherits the change. Surface any usage that did NOT inherit — that usage was a hardcoded inline value (this is a free inline-drift audit; report the list).
3. The Enforcer no longer flags "this differs from the old value" — the new value is the rule. It STILL blocks incoherence (fights the north star, breaks a "do not", collides with an unrelated component). The flag authorizes A change, not ANY change.
4. Auto-update DESIGN_SYSTEM.md to match — the flag pre-authorizes this doc edit, so do not ask separately.
5. This pre-authorizes ONLY the doc gate. Visual sign-off is unchanged — Brian still reviews on localhost. Do not collapse both gates.

The actual change Brian wants follows below:

$ARGUMENTS