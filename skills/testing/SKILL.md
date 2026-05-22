# Testing Skill

## When to activate

This skill activates on **every single task** — automatically, without being asked. Any time a feature is built, changed, or fixed, the checklist below is not optional. "It works on the happy path" is not done. Handing the user something that requires them to find bugs is a failure.

---

## Pre-code: write the test plan first

Before writing any implementation code, answer these questions in your head (or in tasks/todo.md):

1. What database tables does this feature read from and write to?
2. Does every table join have a real FK in the schema? (grep the migration files — never assume)
3. What are the failure modes if a DB call returns null or throws?
4. What does the UI show when there is no data yet (empty state)?
5. What roles (admin / leader / member / visitor) can access this feature — and what exactly is blocked for each?

If you cannot answer all five before writing code, go read the schema and PRD first.

---

## The testing checklist

Run every item before marking any task complete.

### 1. Happy path
The main flow works end-to-end as intended — not just "it renders" but the user can complete the full action and the result is persisted correctly.

### 2. Empty state
What does the user see before any data exists? There must be a non-broken UI (empty-state copy, a CTA, or a loading indicator — never a blank screen or a JS error).

### 3. Edge cases
- 0 items in a list
- 1 item
- 2 items (the minimum meaningful set)
- The maximum (e.g. requesting more groups than people — must clamp, not crash)
- Duplicate inserts (e.g. RSVP toggle must not create two rows)

### 4. Permission boundaries
Test with at least two different roles. For any feature that admin/leader sees but member/visitor should not, verify the restriction holds in the UI **and** at the DB level (RLS). Never assume a role check in the UI is sufficient — verify the server action or RLS policy blocks the request too.

### 5. Database persistence
After any write (create, update, delete), do one of:
- Refresh the page and confirm the data is still there, OR
- Query Supabase directly (admin client in a test script) and assert the row exists with the correct values

"It appeared in the UI" is not evidence of persistence — optimistic updates can lie.

### 6. Error states
Wrap every DB call in a try/catch or check the error return. For each failure mode:
- Is there visible user feedback (toast, inline error, disabled button)?
- Does it fail silently? If so, fix it.

**Server action error handling is mandatory — not optional:**
- Every `"use server"` action body must be wrapped in `try/catch`. Without it, any DB error becomes a `500 Internal Server Error` in production with no visible message. Return `{ error: e.message }` from the catch — never let the action throw to the client.
- Every client call to a server action needs `catch`, not just `finally`. Pattern: `try { const r = await action(); if (r.error) setErr(r.error) } catch (e) { setErr(e.message) } finally { setLoading(false) }`.
- Supabase delete/insert/update return `{ error }` — always check it and return a descriptive message, not just "Failed to save."

### 7. Realtime
If the feature uses Supabase Realtime (`supabase.channel(...)`):
- Verify the channel is created with a unique topic per resource (e.g. `meeting-note-{noteId}`)
- Verify the cleanup function removes the channel synchronously from `supabase.realtime.channels` — NOT just calls `removeChannel()` (which is async and won't prevent React Strict Mode from re-using the old channel on remount)
- Test by opening two browser tabs and confirming updates appear in both without error

### 8. Mobile
Open the feature at 390px width. Confirm:
- Nothing overflows horizontally
- Buttons are tappable (min 44px touch target)
- The layout is readable without horizontal scroll

### 9. Concurrent actions
For any resource that two users might touch simultaneously (RSVPs, chat messages, group edits), verify the DB has a UNIQUE constraint or the server action handles conflicts. "INSERT ... ON CONFLICT DO NOTHING" or optimistic locking is required — not just hoping it doesn't happen.

---

## Date / semester boundary verification

Any time a feature uses a computed label (semester, academic year, cohort) as a DB filter key:

1. **Print the computed value before writing queries.** `console.log(getSemesterLabel())` in the dev console or a node one-liner. Never assume the boundary logic is correct — `month <= 4` and `month <= 5` differ by a whole month.
2. **Confirm seeded test data uses the same label.** If the seed script uses `spring_2026` but the app computes `summer_2026`, every query silently returns empty. Verify they match *before* testing, not after a confusing empty-state bug.
3. **Test from both sides of every boundary.** For `month <= 5` (spring through May): test May 31 (spring) and June 1 (summer). Off-by-one errors only appear at the boundary.

---

## Schema verification — run before every server action

Before writing any Supabase query with a join (`select("..., otherTable(col, col)")`), verify the FK exists:

```bash
grep -n "REFERENCES.*otherTable\|otherTable.*REFERENCES" supabase/*.sql
```

If the FK is missing, PostgREST will silently return null or an opaque error. The fix is a two-step query:
1. Fetch the joining IDs from the first table
2. Fetch the full rows from the second table using `.in("id", ids)`

This came up directly: `form_responses.user_id → auth.users` (not `profiles`), so `select("user_id, profiles(...)")` failed at runtime. Would have been caught in 30 seconds with the grep above.

---

## Efficiency rules

**Write test assertions before implementation code.** Knowing what "correct" looks like shapes what you build.

**Test the riskiest thing first.** DB writes fail more often than renders. Permission bugs are invisible from the happy path. Test those before the UI.

**Never run the same failing test twice without a root-cause fix.** If the test failed, identify the specific line/query/selector causing it before re-running. Running again hoping it was a fluke wastes time and obscures real bugs.

**Time-box debugging: 15 minutes per bug.** If you have not made progress in 15 minutes, stop. Read the relevant source file from the top. Question every assumption. The answer is almost always in the schema, the RLS policy, or a wrong selector — not in the code you're currently looking at.

**If a fix touches more than 2 files, re-examine the approach.** A 3+ file fix usually means you're patching symptoms rather than fixing the root cause.

---

## Selector rules for Playwright tests

Never use `[style*="position: fixed"]` to find an overlay. Next.js + Tailwind does not emit inline styles — it emits CSS classes. Use:

```js
// Wrong
document.querySelector('[style*="position: fixed"]')

// Correct
Array.from(document.querySelectorAll('div')).find(d =>
  d.classList.contains('fixed') && d.classList.contains('inset-0')
)
```

Before writing any Playwright selector, open the dev server, take a screenshot, and inspect the actual rendered classes of the element you want to target.

**Use `waitForFunction` instead of `waitForTimeout` for async state.** Fixed timeouts are fragile — a slow DB write will break a test that uses `waitForTimeout(3000)` to "wait for save to finish." Instead:

```js
// Wrong
await page.waitForTimeout(3000)

// Correct
await page.waitForFunction(() => !document.querySelector('.wizard-indicator'))
```

---

## Definition of done

A feature is not done until:

- [ ] Happy path works end-to-end
- [ ] Empty state renders without errors
- [ ] Edge cases (0, 1, max) handled and tested
- [ ] Permission check verified for at least 2 roles
- [ ] Data confirmed in Supabase after writes
- [ ] Error state is visible (not silent)
- [ ] Realtime channels cleaned up correctly (if applicable)
- [ ] Layout verified at 390px width
- [ ] `npm run build` passes with no type errors

If any item is unchecked, the task is not complete.
