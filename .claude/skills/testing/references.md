# Testing References — load the section the task touches, not the whole file

> Situational companions to the core checklist in SKILL.md. The core routes here.

## Date / semester boundaries (any computed label used as a DB filter key)

1. **Print the computed value before writing queries.** `console.log(getSemesterLabel())` in the dev console or a node one-liner. Never assume the boundary logic is correct — `month <= 4` and `month <= 5` differ by a whole month (`getMonth() + 1` is 1–12; spring runs Jan–May so the spring guard is `month <= 5`).
2. **Confirm seeded test data uses the same label.** If the seed uses `spring_2026` but the app computes `summer_2026`, every query silently returns empty. Verify they match *before* testing.
3. **Test from both sides of every boundary.** For `month <= 5`: test May 31 (spring) and June 1 (summer). Off-by-one errors only appear at the boundary.

## Schema verification (before any server action with a join)

Before writing any Supabase query with a join (`select("..., otherTable(col, col)")`), verify the FK exists:

```bash
grep -n "REFERENCES.*otherTable\|otherTable.*REFERENCES" supabase/*.sql
```

If the FK is missing, PostgREST silently returns null or an opaque error. The fix is a two-step query: fetch the joining IDs, then fetch the full rows with `.in("id", ids)`. Real case: `form_responses.user_id → auth.users` (not `profiles`), so `select("user_id, profiles(...)")` failed at runtime.

## Server-action error handling (mandatory pattern)

- Every `"use server"` action body wrapped in `try/catch`; return `{ error: e.message }` — never let the action throw to the client (it becomes an opaque 500).
- Every client call to a server action needs `catch`, not just `finally`: `try { const r = await action(); if (r.error) setErr(r.error) } catch (e) { setErr(e.message) } finally { setLoading(false) }`.
- Supabase delete/insert/update return `{ error }` — always check it and return a descriptive message.

## Realtime channels

- Unique topic per resource (e.g. `meeting-note-{noteId}`).
- Cleanup must remove the channel synchronously from `supabase.realtime.channels` — NOT just `removeChannel()` (async; React Strict Mode re-uses the old channel on remount).
- Test with two browser tabs: updates appear in both without error.

## Playwright selector & wait rules

- Never `[style*="position: fixed"]` — Next + Tailwind emit classes, not inline styles. Find overlays by class: `d.classList.contains('fixed') && d.classList.contains('inset-0')`.
- Inspect the ACTUAL rendered DOM before writing any selector; prefer `getByRole`/`getByLabel`/`getByText`/`getByTestId`.
- `waitForFunction` / `expect` polling instead of `waitForTimeout` — fixed sleeps break on slow runs and cascade.

## Efficiency rules

- Write test assertions before implementation code — knowing "correct" shapes the build.
- Test the riskiest thing first: DB writes and permission boundaries before UI renders.
- Never re-run a failing test without a root-cause fix; never re-run a suite where one known root cause fails every test.
- Time-box debugging to 15 minutes; then re-read the source from the top — the answer is usually in the schema, the RLS policy, or a wrong selector.
- A fix touching more than 2 files usually means you're patching symptoms — re-examine the approach.

## Vercel deployment lag

Changes take **~75 seconds** to go live on `joincentral.app` after a push to main. Never say "it's live" immediately after pushing — say "deploy takes ~75s, check after it finishes," or watch the Vercel dashboard.
