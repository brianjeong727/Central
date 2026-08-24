## A defaulted boolean param on a handler swallows React's click event — and it means "skip the check" (2026-08-24)

The duplicate-account gate added `confirmedNotDuplicate = false` as a trailing
param on `doJoin` / `doCodeJoin` / `doRequest`. Three existing call sites passed
those handlers BARE:

```tsx
onClick={isCustomCode ? doRequest : onJoinTap}     // MouseEvent → confirmedNotDuplicate
pickers.genderGate(doCodeJoin)                     // whatever genderGate passes
```

React hands `onClick` a `MouseEvent`. It is truthy. So every join through that
button would have silently SKIPPED the duplicate check — the one thing the change
existed to add — while every test of the check itself still passed, because the
tests drove the other call sites.

`tsc` caught exactly one of the three (the `onClick`, where the signature
mismatch is visible). The two behind a callback-taking helper type-checked fine
and were found only by grepping every reference.

**Rules.**
- A handler that takes a flag is never passed bare. Wrap it: `() => doJoin()`.
  The arrow is what stops the next call site, and it costs nothing.
- When adding a trailing param to an existing function, `grep` EVERY reference
  before running anything — a passing type-check covers only the call sites where
  the argument type happens to clash.
- Prefer a flag whose default is the SAFE direction. Here it is (`false` = still
  check), which is why this was a near miss rather than a shipped hole. A
  `skipCheck` param defaulting the other way would have been unrecoverable.
