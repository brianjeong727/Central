# Lessons Learned

---

## 2026-05-21 — Group Generator (Groups tab, plan-tab.tsx)

### What was built
A 3-step group generation wizard inside the SOB plan tab. Users pick a pool source (everyone, RSVP list, form respondents), configure group count and diversity toggles, preview the generated groups with drag-and-drop adjustment, name the session, and save. Algorithm does year-bucket round-robin distribution with optional visitor spreading and small-group-mode penalty optimization. Sessions are persisted to `group_sessions`, `generated_groups`, `generated_group_members` tables. Session view has CSV export.

---

### What took the most time

**1. Supabase Realtime channel crash (React Strict Mode)**
The meeting notes collab (`useNoteCollab`) was crashing with `cannot add presence callbacks after subscribe()`. Root cause: `supabase.channel(topic)` returns the *existing* channel object if the same topic is already in `supabase.realtime.channels`. React Strict Mode double-invokes effects (mount → cleanup → remount). `supabase.removeChannel()` is async — the channel is not removed from `this.channels` by the time the second mount runs. So the second mount gets the already-subscribed channel and then tries to call `.on("presence", ...)` on it, which throws.

Fix required understanding Supabase internals: synchronously splice the channel out of `supabase.realtime.channels` in the cleanup function before calling `unsubscribe()`. Also needed try-catch around `.on("presence", ...)` as a defense layer.

This was not a bug in the Groups feature itself — it was pre-existing in the meeting notes feature and only surfaced when the test harness triggered it during navigation. Lost roughly 2 hours here before isolating the root cause.

**2. Playwright test selector — `[style*="position: fixed"]` vs `.fixed.inset-0`**
Wrote all wizard helper functions (`clickNext`, `clickGenerate`, `clickSave`, `setNumGroups`, `setSessionName`, `selectSource`) scoped to `document.querySelector('[style*="position: fixed"]')`. The wizard renders with `className="fixed inset-0 z-[85]"` — Tailwind classes, not inline styles. The selector returned null every time. Had to rewrite all helpers to use `classList.contains('fixed') && classList.contains('inset-0')`. This was about 45 minutes of debugging because the screenshots showed the wizard was rendering correctly — the issue was purely in how the test found it.

**3. `clickSave` timing — fixed 3000ms wasn't enough**
Saving 10 groups required 10 sequential Supabase inserts (one per group) plus 10 member batch inserts. With 3000ms timeout, the test moved on before the save completed. The next test's `openWizard` saw the previous wizard still open (in step 3, still saving), clicked a background button that did nothing, and then all subsequent selectors found the wrong wizard state. Caused 5+ cascading test failures from a single timing bug.

---

### What had to be redone mid-way

**Test helper functions** — rewrote all 6 (`clickNext`, `clickGenerate`, `clickSave`, `setNumGroups`, `setSessionName`, `selectSource`) after discovering the Tailwind class issue. First version was completely unusable.

**`generate-groups.ts` form pool query** — original: `from("form_responses").select("user_id, profiles(id, name, graduation_year, role)")`. `form_responses.user_id` references `auth.users`, not `profiles`. No FK between them → PostgREST returns an error. Rewrote to two-step: get `user_id` list from `form_responses`, then `.from("profiles").select(...).in("id", userIds)`. Should have checked the schema before writing the query.

**`chats-tab.tsx` build error** — two calls to `handleRemoveMember` which doesn't exist (actual function is `stageRemoveMember`). Caught only during `npm run build` after writing unrelated code. Should have been caught at write time.

---

### Edge cases missed the first time

**`form_responses.user_id → auth.users` (not `profiles`)** — Only the `rsvps` table has a FK to `profiles`. `form_responses` doesn't. The PostgREST join `profiles(...)` silently returns an error. Missed because I assumed all user_id columns follow the same pattern. One `grep "REFERENCES" supabase/forms_migration.sql` would have caught it.

**Clamping when requested groups > pool size** — Was in the algorithm from the start (line: `Math.min(Math.max(1, params.numGroups), pool.length)`) but wasn't tested until T5. The clamp works correctly; the test just needed to verify it.

**Test cascade from slow saves** — Didn't account for the fact that saving 10 groups is not instantaneous. The test assumed each `clickSave` + 3000ms was sufficient before moving to the next test. For 1-3 groups it would have been fine, but 10 groups exposed the gap.

---

### Testing steps that were unnecessary or redundant

Running the full 10-test suite 3+ times while the root selector issue (`[style*="position: fixed"]`) was still unfixed. Every test after T1 was guaranteed to fail for the same reason. Should have fixed the selector, verified T1 passes, then run the full suite.

Running T3–T7 before fixing the `clickSave` timing issue. All of those failures were downstream of T2 not closing before T3 started. One targeted fix would have unblocked all of them.

---

### What would be done differently

1. **Read the DOM before writing selectors.** Take a screenshot of the feature at the `openWizard` step, inspect the classes on the overlay, then write the selector. Never guess.

2. **Check all FK relationships before writing any join.** For every `select("..., otherTable(col)")`, run `grep "REFERENCES" supabase/*.sql` for that table. 30 seconds. Prevents silent PostgREST errors.

3. **Use `waitForFunction` instead of `waitForTimeout` for async operations.** Every place the test waits for a state change (wizard closes, save completes, step transitions) should use `page.waitForFunction(() => ...)` with a reasonable timeout, not a fixed sleep. Fixed sleeps fail on slow days and pass on fast ones.

4. **Test one failure at a time.** When multiple tests fail, fix the first one completely before running again. Don't re-run a suite where you know tests 3–10 will cascade from test 2's failure.

5. **Isolate Supabase Realtime cleanup as its own concern.** The Strict Mode double-invoke issue is not specific to meeting notes — it will affect any feature using `supabase.channel()`. Should have a reusable cleanup pattern documented from the first time it was solved.

---

### What the testing skill should prevent next time

- Writing Playwright selectors without inspecting the actual rendered DOM → selector rules section
- Writing PostgREST joins without verifying FK exists → schema verification section
- Fixed-timeout waits for async state → `waitForFunction` rule
- Running full test suites when a known root cause affects every test → "never run the same failing test twice without a root-cause fix" rule
- Marking a feature done after only happy-path testing → definition of done checklist

---

### Time estimate vs actual

**Estimated:** 3–4 hours (wizard UI + algorithm + DB writes + basic testing)

**Actual:** ~8–10 hours across two sessions

**Why it differed:**
- Realtime crash was pre-existing but surfaced during testing: +2h
- Playwright test infrastructure (building, debugging selectors, fixing timing): +2–3h (test harness was written from scratch and included significant selector debugging)
- `form_responses` FK bug: +30min
- Cascading test failures from timing: +30min

The feature implementation itself (wizard UI + algorithm + server action + DB schema) was on estimate. All the overrun was in testing infrastructure and debugging issues that should have been caught earlier with the schema check rule.

## 2026-07-18 — Event fixtures vs. datetime display
- calendar_events stores modal-typed times as `+00:00` but every surface renders with local `toLocaleTimeString/DateString` — so ANY seeded fixture (and any modal-created event) displays shifted by the viewer's UTC offset. Seed scripts must write America/New_York-offset timestamps (see seed-ccsf-events.mjs etOffset) until the storage convention is fixed app-wide. KNOWN BUG to fix in a dedicated pass: store/display disagree for user-created events.
- Static e2e fixtures with "near-today" due dates (countdown.spec's Summer Retreat, seeded ~Jul 16) drift into different badge states as days pass — countdown.spec's "Auto-DM sent" assert broke by 7/18 with zero code change. Fixture due dates need re-anchoring relative to run time, not fixed dates.
- Playwright has no getByDisplayValue (that's Testing Library) — assert inputs with getByPlaceholder(...).toHaveValue(...).
