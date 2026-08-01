# Proposal — stop `tasks/lessons.md` conflicting on every parallel session

**Status: PROPOSAL. Nothing implemented.** Raised 2026-07-31 after the file conflicted twice in one evening's merges. Brian decides; do not restructure the file without his approval, and the CLAUDE.md rule in Option A is ask-then-write.

## The problem

`tasks/lessons.md` is append-only and every writer appends at **EOF**. Two sessions that each learn something produce two commits touching the same final line, so git conflicts **every time** — not occasionally. It is guaranteed whenever sessions run in parallel, which the slot model (`s1`/`s2`/`s3`) actively encourages.

It is a *content-free* conflict: both sides are always correct and the resolution is always "keep both." That is the tell that the file's shape, not the writers, is wrong.

Observed twice on 2026-07-31 alone — merging `main` into `feat/event-time-propagation`, then again merging that into `feat/timezone-correctness`. Both resolutions were mechanical concatenation.

Current state: **57 entries, 418 lines, 24 references** across 16 files.

## Why "dated sections with a stable sort" does NOT fix it

It was floated as an option; it should be rejected. Sections keyed by date only help if the colliding sessions are on *different* days. Parallel sessions are the same day by definition — they'd land in the same section, at the same insertion point, and conflict identically. It adds sorting ceremony for no reduction in conflicts.

Separate **files** are the only structure git can merge without a human, because git's unit of conflict is the file.

---

## Option A — inbox directory + curated canon (recommended)

Keep `tasks/lessons.md` as the **curated, readable canon**. Add an append-only **inbox** that sessions write to instead:

```
tasks/lessons.md              ← the canon. Human-ordered, GC'd, read at session start.
tasks/lessons/inbox/          ← new entries land here, one file per lesson.
    2026-07-31-nullable-boolean-filter.md
    2026-07-31-ci-stacked-pr-trigger.md
```

- A session writing a lesson creates `tasks/lessons/inbox/<YYYY-MM-DD>-<kebab-slug>.md` containing exactly one `## Heading (date)` + body — the same format entries use today.
- **Two sessions can never touch the same file**, so the conflict disappears structurally rather than by convention.
- `/lessons-gc` gains one job: fold inbox entries into `lessons.md` (in whatever order reads best), then delete them. That is a batch, human-approved operation — the only time `lessons.md` is edited, and never concurrently.

**Cost:** the canon goes briefly stale between GC runs, so a fresh session must read both. Mitigated by the rule text below telling it to.

### Exact text — CLAUDE.md Layer 3 (replaces the current pointer paragraph, ~line 181)

> `tasks/lessons.md` holds specifics discovered from a mistake or a non-obvious surprise: things a fresh Claude would plausibly get wrong again. **Read it AND `tasks/lessons/inbox/` at session start** — the inbox holds entries not yet folded into the canon.
>
> **Never append to `tasks/lessons.md` directly.** Every writer appends at EOF, so two parallel sessions conflict on the same final line every time — a content-free conflict whose resolution is always "keep both." Write a new lesson as its own file: `tasks/lessons/inbox/<YYYY-MM-DD>-<kebab-slug>.md`, one lesson per file, same `## Heading (date)` + body format. Separate files are the only shape git merges without a human. `/lessons-gc` folds the inbox into the canon and clears it — that batch is the ONLY thing that edits `lessons.md`.
>
> A lesson stays in Layer 3 while it's narrow or situational; once it proves general and load-bearing, propose promoting it into a Layer 2 Critical Convention.

### Exact text — Layer 2 Critical Convention (new, ask-then-write)

> **24. Lessons are written as inbox files, never appended to `lessons.md`:** a new lesson goes to `tasks/lessons/inbox/<YYYY-MM-DD>-<kebab-slug>.md`, one lesson per file. Appending to `tasks/lessons.md` conflicts with every other parallel session at EOF — guaranteed, not occasional, because the slot model runs sessions concurrently. Only `/lessons-gc` edits `lessons.md`, folding the inbox in as an approved batch.

### Also needs updating under Option A

- `.claude/commands/lessons-gc.md` — add the fold-and-clear step; it currently only prunes the single file.
- `.claude/skills/orchestration/SKILL.md` line ~49 — the doc-gate table row reads ``| `lessons.md` | Auto-write, never ask. |``; becomes ``| `tasks/lessons/inbox/*.md` | Auto-write, never ask. Never append to `lessons.md` directly. |``
- `.claude/skills/orchestration/orchestrated.md` line ~108 — "a note of any lessons.md entries auto-written" → "…any inbox lesson files written".
- The other 20 references are *citations* of specific lessons (e.g. `destructive-git-guard.sh` citing "§Tester stash clobber") and stay valid — the canon keeps its path.

---

## Option B — do nothing, resolve by convention

Keep one file; accept the conflict; always resolve by concatenating both sides.

**Honest case for it:** the resolution is trivial and mechanical, and today's two conflicts cost perhaps a minute each.

**Case against:** it is a recurring tax with a fixed cost per merge, it trains the habit of resolving `lessons.md` conflicts on autopilot (which is how a *real* conflict in that file eventually gets concatenated wrongly), and it scales with the number of parallel sessions — which is a thing you deliberately built infrastructure to increase.

---

## Recommendation

**Option A.** It removes the conflict class outright rather than making it cheaper, and it gives `/lessons-gc` a clearer job than it has now. The migration is additive — no existing entry moves, no citation breaks, and the canon keeps its path — so it can land in one small PR and be reverted by deleting a directory.

If you want the smallest possible change instead: Option A **without** the new Layer 2 convention, relying on the Layer 3 text alone. The convention is worth having because this is a behavioral rule that a fresh session will otherwise violate on its first lesson.
