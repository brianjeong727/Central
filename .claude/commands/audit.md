---
description: Full-codebase, READ-ONLY health audit. Finds duplicate files, likely-dead (ghost) files, hardcoded values that should be tokens/components, and DESIGN_SYSTEM.md violations. Produces ONE categorized report with per-item recommended actions. Deletes and fixes NOTHING on its own — every action is approved by Brian per-item. Heavyweight; run occasionally, not per-commit.
---

This is a full-codebase health audit. It is READ-ONLY in its scanning phase and acts on NOTHING without Brian's per-item approval. Load `.claude/skills/orchestration/SKILL.md` for escalation/multiple-choice conventions, then run the audit as follows.

## Phase 1 — Scan (read-only, dispatch existing agents — do not reimplement their logic)

Spawn the `explorer` (read-only) for STRUCTURAL findings and the `enforcer` (read-only) for DESIGN-SYSTEM findings. Assemble their results into one report. Categories:

### A. Duplicate files
Exact or near-duplicate implementations — parallel reimplementations of the same component, copy-pasted logic, two files doing one job. Report each pair/group with paths and what overlaps. Distinguish true duplication from intentional variants (flag the latter as "likely intentional — confirm").

### B. Ghost files (likely dead — HIGHEST false-positive risk, handle with care)
Files nothing reaches. For EACH candidate, report: the file, WHY it looks dead (no imports / no route / no reference), a CONFIDENCE level (high/medium/low), and the evidence checked. Brian approves against evidence, never against a bare filename.

**NEVER flag these as ghosts — they are reached by the framework or by string-matching, not by the JS import graph (exclude them entirely from this category):**
- `proxy.ts` (middleware)
- any `app/**/page.tsx`, `layout.tsx`, route handlers, `route.ts` (file-system routing)
- anything under `.claude/` (agents, skills, commands — reached by Claude Code)
- vanity-URL targets reached via `proxy.ts` string matching (`/announcements`, `/forms`, `/settings`, `/profile`, `/messages`, `/events`, etc.)
- tab files mounted by `app/home/home-app.tsx` via state (`activeTab`), not static import
- `lib/*` clients and helpers referenced dynamically
When unsure whether something is framework-reached, mark confidence LOW and explain — do not assume dead.

### C. Hardcoded values that should be unified (Brian's #1 target)
Inline hex colors, off-scale spacing (anything not on 4/6/8/10/12/14/18/22/28/36/40/56), raw borders/type values that duplicate a token, and parallel reimplementations of a canonical component (avatar that isn't MonogramChip, tab strip that isn't PlanSubTabStrip, inline button styles, etc.). Group by the token/component each SHOULD consume. This is a refactor list, not a deletion list.

### D. DESIGN_SYSTEM.md violations
Anything the Enforcer flags against a "Do not" or the §0 north star in live code: plum as surface/fill, white instead of cream, pill tabs, gradients outside the (shell-retired) hero, weight 600 on body/UI text, modal-where-navigation-belongs, retired patterns reproduced (plum gradient hero, multi-shape avatars). Report with the section violated.

## Phase 2 — Report to Brian

Present ONE report, the four categories above, each item with its recommended action as multiple choice. Do not act yet. Per category:
- **A (duplicates) / B (ghosts):** per item → ( ) Approve deletion  ( ) Keep  ( ) Explain. Ghosts show confidence + evidence inline.
- **C (hardcoded):** per item → ( ) Queue unification into the build loop  ( ) Leave for now  ( ) Explain. (Approving sends it through the normal Engineer→Tester→Enforcer loop with Brian's visual sign-off at the end.)
- **D (design violations):** report only, grouped — these are not auto-fixed; Brian decides whether each becomes a build task.

## Phase 3 — Act ONLY on approvals
- Approved A/B items: delete the file, then run `npm run build` to confirm nothing broke. If the build fails, STOP and report — the "ghost" wasn't a ghost; do not force it.
- Approved C items: enter each as a scoped task in the build loop, one at a time, never as a mega-refactor.
- Nothing in D acts without Brian explicitly turning it into a task.

## Hard rules
- The scan phase writes NOTHING. Only approved Phase-3 actions touch files.
- Never batch-delete. Each deletion is individually approved and individually build-verified.
- A failed build after a deletion immediately reverses the assumption — surface it, don't push through.