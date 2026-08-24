## Two e2e specs are red on `main` for reasons unrelated to any current change (2026-08-24)

Both found while running neighbouring suites. Neither is a flake — each fails the
same way every run.

1. **`young-adult-cohort.mobile.spec.ts`** — drives `getByRole("button", { name:
   /edit profile/i })` and times out. Profile v2 (`ae09273`) moved mobile editing
   in-place; "Edit profile" now renders only in the DESKTOP branch of
   `profile-tab.tsx`. That commit added `profile-v2.mobile.spec.ts` and never updated
   this one. Consequence: the young-adult chat MOVE — the thing that spec exists to
   guard, and which its own header says shipped broken for months — is unguarded at
   phone width.

2. **`push.spec.ts` › "published announcement: recipients include both sandbox
   users…"** — asserts an EXACT recipient array of two ids. The E2E Sandbox gained
   five more members on 2026-08-17/18 (`grace.lee@`, `daniel.cho@`, `sarah.kim@`,
   `james.park@`, `e2e.dm.third@`) from other specs' fixtures, so the resolver
   correctly returns six. The assertion should be "contains X, excludes the author",
   not an exact set: an exact-set assertion over a SHARED sandbox is a time bomb, and
   this is it going off.

Neither was fixed in the change that found them — both belong to other workstreams,
and rewriting a recipient-resolution assertion in passing risks weakening a real one.
