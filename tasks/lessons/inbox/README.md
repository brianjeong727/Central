# Lessons inbox

New lessons land here as **one file per lesson**. `/lessons-gc` folds them into
`tasks/lessons.md` (the curated canon) and clears this directory.

## Why this exists

`tasks/lessons.md` is append-only and every writer appends at **EOF**. Two sessions
that each learn something produce commits touching the same final line, so git
conflicts **every time** — guaranteed, not occasional, because the slot model
(`s1`/`s2`/`s3`) runs sessions concurrently by design.

It's a content-free conflict: both sides are always right and the fix is always
"keep both." Separate files are the only shape git merges without a human, because
git's unit of conflict is the file.

## Writing one

Filename: `<YYYY-MM-DD>-<kebab-slug>.md` — the date makes ordering obvious at a
glance, the slug makes the filename greppable.

Body: exactly one lesson, in the same format the canon uses.

```markdown
## Short imperative title — the rule, not the symptom (YYYY-MM-DD)
What was believed, what was actually true, and the mechanism. Name the tell that
distinguishes this class from its neighbours, so a fresh session recognises it.
Include the concrete detail (file, column, error code) — a lesson with no specifics
is unfalsifiable and gets ignored.
```

Write the title as the RULE, not the incident: "Nullable boolean filters must admit
NULL" outlives "the auto-chats bug."

## Rules

- **Never append to `tasks/lessons.md` directly.** That is the conflict this
  directory exists to remove.
- One lesson per file. Two lessons in one file can't be folded independently.
- Don't edit another session's inbox file — write your own.
- Never delete an inbox file except as part of a `/lessons-gc` fold.
- Read this directory **and** the canon at session start; the canon is stale between
  GC runs by design.
