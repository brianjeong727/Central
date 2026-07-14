---
description: Periodic garbage-collection pass over tasks/lessons.md — classify every entry as keep / promote / retire / compress, propose the changes per-item, apply only what Brian approves. Lessons are append-only between runs; this is the retirement path that keeps the file from growing into another context tax. Run occasionally (quarterly-ish or when the file feels bloated), not per-task.
---

Garbage-collect `tasks/lessons.md`. The file is an append-only learning log with a promotion path (lesson → Layer 2 rule) but no retirement path — entries whose content has since been machine-enforced, promoted, or superseded still cost tokens on every read. This command prunes it WITH approval; nothing is deleted silently.

## Phase 1 — Classify (read-only)

Read every entry in `tasks/lessons.md` and sort it into exactly one bucket:

- **KEEP** — still a live, situational lesson a fresh session would plausibly violate. No action.
- **PROMOTE** — proven general and stable; belongs as a CLAUDE.md Layer 2 rule (or an addition to an agent/skill doc). Propose the exact destination text. Note: the CLAUDE.md ask-then-write rule applies to the destination edit.
- **RETIRE** — the content is now enforced elsewhere and the entry is dead weight. Cite the enforcement: an ESLint rule, check-hex, a hook (e.g. destructive-git-guard supersedes the stash-clobber prompt rules), verify.sh, a CLAUDE.md convention that carries the same text, or code that made the failure impossible. An entry is only RETIRE if the citation is checkable — "probably covered" is KEEP.
- **COMPRESS** — the lesson is live but the entry rambles (long war story, superseded detail, duplicate of a sibling entry). Propose the tightened text (aim: the rule + the one-line why; cut the narrative).

Cross-check RETIRE/COMPRESS candidates against the actual enforcing artifact (read the ESLint config / hook / convention) — never retire against memory.

## Phase 2 — Report to Brian (multiple choice per item)

One report, grouped by bucket. KEEP items are listed as a one-line inventory (no decision needed). For each PROMOTE / RETIRE / COMPRESS item:

( ) Apply — promote/delete/replace as proposed
( ) Keep as-is
( ) Explain

Include the before/after byte count of the file if all proposals were applied.

## Phase 3 — Apply ONLY approvals

- Approved RETIRE: delete the entry.
- Approved COMPRESS: replace with the proposed text.
- Approved PROMOTE: write the lessons.md deletion; the CLAUDE.md/doc destination edit follows its own gate (ask-then-write — the approval in Phase 2 covers it if Brian approved the exact text).
- Commit the result on the current feature branch with a message listing counts per bucket.

Hard rules: never delete a KEEP, never batch-apply unapproved items, never rewrite an entry's meaning while compressing.
