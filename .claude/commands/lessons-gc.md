---
description: Folds tasks/lessons/inbox/ into tasks/lessons.md, then garbage-collects the canon — classify every entry as keep / promote / retire / compress, propose the changes per-item, apply only what Brian approves. The ONLY command that edits lessons.md. Run occasionally (quarterly-ish, or when the inbox has piled up), not per-task.
---

Garbage-collect `tasks/lessons.md`. The canon grows by folding in the inbox and has a promotion path (lesson → Layer 2 rule) but no retirement path — entries whose content has since been machine-enforced, promoted, or superseded still cost tokens on every read. This command folds, then prunes, WITH approval; nothing is deleted silently.

**This command is the ONLY thing that edits `tasks/lessons.md`** (CLAUDE.md #24). Sessions write new lessons to `tasks/lessons/inbox/<YYYY-MM-DD>-<kebab-slug>.md`, one file per lesson, because appending at EOF conflicts with every parallel session.

## Phase 0 — Fold the inbox (do this FIRST)

Read every file in `tasks/lessons/inbox/` except `README.md`. These are new lessons no one has curated yet.

- Append each into `tasks/lessons.md`, oldest filename-date first, so the canon stays roughly chronological.
- While folding, apply the SAME judgment as Phase 1 — an inbox entry can be COMPRESSed on the way in, or land straight in the PROMOTE/RETIRE pile if it's already superseded. Do not fold a duplicate of an existing entry; merge it into the sibling instead and say so.
- **Delete each inbox file you folded** (`git rm`), leaving `README.md`. An inbox file that survives a GC run will be folded twice on the next one.
- Report the fold as its own line in Phase 2: how many folded, compressed-on-entry, or merged into siblings.

If the inbox is empty apart from `README.md`, say so and continue.

## Phase 1 — Classify (read-only)

Read every entry in `tasks/lessons.md` (now including everything just folded) and sort it into exactly one bucket:

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
