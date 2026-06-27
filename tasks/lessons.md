# Lessons

- When changing a responsive nav, verify the desktop grid has one explicit track per visible region. A three-part header needs left, center, and right columns, not a two-column grid with an implicit third item.
- For warm, welcoming landing imagery, avoid heavy ink/plum overlays across the whole hero. Use a lighter warm scrim and localized contrast behind text so the image stays bright.

## Semester / date boundary bugs
- `getMonth() + 1` returns 1–12. The spring semester runs Jan–May, so the spring guard must be `month <= 5`, not `month <= 4`. Off-by-one on the boundary causes the entire month of May to fall into the wrong semester, breaking every DB query that uses that label as a filter.
- Always verify the computed semester label matches the seeded test data. If the seed uses `spring_2026` but the app computes `summer_2026`, the feature silently shows an empty state instead of the real data. Confirm the two match before testing.

## Server action error handling
- Every `"use server"` action must have a top-level `try/catch`. Without it, any unhandled DB error or exception causes Next.js to return a cryptic `500 Internal Server Error` ("An error occurred in the Server Components render") with no visible cause in the UI or standard logs. The fix: wrap the whole body in try/catch and return `{ error: e.message }` so the client can surface a real message.
- Every client-side call to a server action needs a `catch` block, not just `try/finally`. `finally` runs but does not catch — if the action boundary itself throws (network error, serialization failure, unhandled server exception), the error propagates as an unhandled Promise rejection and the UI shows nothing. Pattern: `try { ... } catch (e) { setError(e.message) } finally { setLoading(false) }`.
- Always check the return value of Supabase delete/insert/update and return the error with a descriptive message (not just "Failed to save"). Vague errors make production debugging impossible.

## URL State Persistence
Date: 2026-05-23

Rule: Every tabbed view must sync its active tab to the URL as a query parameter. This is not optional and should be implemented at the same time as the tabs themselves — never added manually later.

**Pattern:**
```typescript
// 1. Lazy init from URL on mount
const [tab, setTab] = useState<TabType>(() => {
  const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("mytab") : null
  return validTabs.includes(p ?? "") ? p as TabType : "default"
})
// 2. Setter that writes state + URL together
function setTabAndUrl(t: TabType) {
  setTab(t)
  const sp = new URLSearchParams(window.location.search)
  sp.set("mytab", t)
  router.replace(`/home?${sp.toString()}`, { scroll: false })
}
```

**URL params in use (as of 2026-05-23):**
- `?tab=` — top-level sidebar tab (home/announcements/chats/plan/etc.)
- `?team=` — active team ID in Plan tab
- `?chats=` — ChatsTab sub-tab (church/my)
- `?sotab=` — Student Org Board team tabs (General/Plan/Roster/Resources/Groups)
- `?ptab=` — PraiseTeam sub-tabs (schedule/setlist/slides/availability)
- `?evtab=` — EventPlanWorkspace sections (overview/checklist/roles/notes)
- `?sgltab=` — SmallGroupLeadersTab tabs (home/schedule)
- `?section=` — Profile section (spiritual-profile/journal)
- `?member=` — Directory member
- `?compose=` — Announcements compose/edit page (`new` = create, `{id}` = edit a specific announcement)
- `?view=` — Plan tab sub-page overlay (settings)

**Sidebar navigation must atomically clear `view` param:** `handleSidebarTabChange` clears `view=settings` and sets `tab` in one `router.replace` call. Two separate `replaceParam` calls race on `window.location.search` — the second overwrites the first's deletion.

**Team switch must clear all team-specific sub-params atomically:** On team change, clear `view`, `sotab`, `ptab`, `sgltab`, `evtab` in a single `router.replace` — same race condition applies to sequential calls.

## Deletion must always have confirmation
Date: 2026-05-24

**Rule: Every delete action in the app requires a two-step confirmation. No exceptions.**

Use the inline confirm pattern — first click reveals "Delete / Cancel" inline; second click (on "Delete") executes the action. Never trigger a delete on a single click.

**Why:** Users have accidentally deleted tasks, categories, and other data because the X button fired immediately. The cost of a single-click delete is high (data loss), the cost of a two-step confirm is zero (one extra click).

**How to apply:** See §14 of `.claude/skills/design-system/DESIGN_SYSTEM.md` for the exact implementation pattern. Always use two state variables: `confirmId` (pending confirmation) and `deleting` (in-flight). Never use `window.confirm()`.

**Common mistake to avoid:** Using `window.confirm()` or a modal for small items in lists/tables. The inline pattern is always preferred — it keeps focus in place and feels native to the UI.

## PlanSubTabStrip placement — always outside the padded content wrapper

`PlanSubTabStrip` manages its own horizontal alignment internally: its label row uses `md:pl-14` (56px) and its hairline uses `md:mx-14`. It must be placed **outside** any `px-5 md:px-14` content wrapper. If placed inside, the outer and inner paddings stack → tabs appear ~112px from the left on desktop (double-padded = wrong).

**Rule:** Place the strip as a sibling to `TabPageHeader` at the component root, NOT inside the scrollable body div. Desktop-only instance: `<div className="hidden md:block"><PlanSubTabStrip .../></div>`. Mobile-only instance (if needed): `<div className="md:hidden"><PlanSubTabStrip .../></div>` inside the content wrapper (mobile has no `px-14` applied by the strip, so it reads the outer `px-5` correctly).

**Check before adding any strip:** Find the content div with `px-5 md:px-14` and make sure the strip is **not** inside it.

## Tab strip / hairline mounting — proven structure, do not re-derive
Date: 2026-06-21

The `PlanSubTabStrip` + `TabPageHeader` interaction is the most failure-prone pattern in the app. Five iterations to get right (alignment, border-on-wrong-div, duplicate hairline, wrong-line-removed, finally correct) because each attempt re-derived padding/margins from scratch instead of copying the proven structure.

**Proven structure (copy exactly, never re-derive):**
- `TabPageHeader` keeps its soft inset bottom `InsetHairline` (`var(--line)`, 0.65 opacity, 56px inset) on **every** page including strip-bearing ones — never suppress it.
- The strip's under-tabs divider must match that treatment exactly:
  ```tsx
  <div className="md:mx-14" style={{ height: 1, background: "var(--line)", opacity: 0.65 }} />
  ```
  NOT a hard full-width `borderBottom: "1px solid #E8E2D2"`.
- Tab labels are inset via an **inner** `md:pl-14` div; the hairline div is a **sibling** below the label row — never mix padding and the hairline on the same element.
- Active 2px plum marker sits on the hairline via `marginBottom: -1` on buttons (the button row height = H-1; the 1px hairline div below absorbs that 1px, so the button's active border overlaps the hairline).

**When touching any tab strip or header hairline:** copy this structure exactly.

## Visual/layout changes — defer screenshot sign-off to the user
Date: 2026-06-21

Multiple times in the planning-migration session, a layout fix was reported "verified" when the screenshot showed it was still wrong (wrong line removed, duplicate hairline, misalignment). Browser-MCP self-verification consistently missed what the human eye caught immediately.

**Rule:** For any layout, alignment, hairline, or spacing change — describe what changed and exactly what to look for, then hand back to the user for screenshot confirmation. Do not self-certify visual correctness. End with "I changed X, look for Y" — not "verified correct."

## Font alias tech debt (Bricolage migration)
Date: 2026-06-21

After switching to Bricolage Grotesque as the sole typeface, 22 component files that hardcode `var(--font-instrument-serif)` or `var(--font-inter)` were kept untouched. Compatibility is maintained via CSS aliases in `app/globals.css` `:root`:
```css
--font-instrument-serif: var(--font-bricolage-grotesque);
--font-inter:             var(--font-bricolage-grotesque);
```

**Tech debt:** The variable names now lie — a developer reading `var(--font-instrument-serif)` in a component will not know it renders Bricolage unless they trace the alias in `globals.css`. If the typeface is ever changed again, update the aliases and do NOT introduce a new variable with the old name. If a full per-file migration is done, delete the alias block and remove this lesson.

## Shell migration — tab root div must be a flex container
Date: 2026-06-22

Learned from the Planning tab scroll bug: when a tab is migrated onto the standard desktop shell pattern, the `md:flex md:flex-col md:h-full md:overflow-hidden` classes must be on the **tab component's own root div**, not only on the wrapper in `home-app.tsx`. If missing from the root div, the content area grows to full content height and gets clipped by the wrapper's `overflow: hidden` instead of scrolling — the page looks broken on desktop.

**Rule:** When migrating any tab, match `DirectoryTab`'s root div structure exactly: `<div className="pb-2 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">`. Check this first when a migrated tab shows clipped or non-scrolling content on desktop. See CLAUDE.md Convention #13.

## Role-gated public routes — never route CTAs directly to auth or wizard pages
Date: 2026-06-22

"Register your ministry" CTAs previously pointed to `/signup?intent=register`. This broke for logged-in users: `proxy.ts` bounces ALL logged-in users off `/signup` to `/home`, ignoring query params. Admins trying to register a second ministry got silently redirected home with no error.

**Rule:** When a CTA should behave differently based on auth state or role, create a dedicated server-component route in the public paths list that does the routing:
- Not logged in → redirect to appropriate auth flow
- Correct role → redirect to the feature
- Wrong role → render a gate page with a clear explanation

**Applied to:** `/register-ministry` (→ no auth: `/signup?intent=register`, admin-tier: `/onboarding`, non-admin: gate UI). See `app/register-ministry/page.tsx` and CLAUDE.md Convention #14.

## Auth shared components — `EyeButton` replaced `PasswordToggle`
Date: 2026-06-22

When `app/(auth)/shared.tsx` was rewritten to be the canonical shared file, the old exports (`GoogleIcon`, `PasswordToggle`) were removed. `update-password/page.tsx` still imported `PasswordToggle` — the build failed. The new canonical export is `EyeButton` (same props interface: `show`, `onToggle`).

**Rule:** After replacing or renaming exports in a shared file, grep for all import sites before marking the task done: `grep -r "from.*/(auth)/shared"`. This catches pages like `update-password` that were not part of the immediate refactor.

## Dev server — never run two `next dev`, never `build` against a live dev cache
Date: 2026-06-26

The `dev` script is `rm -rf .next && next dev`. If a second `npm run dev` starts (or `npm run build`, which also `rm -rf .next`, runs while `next dev` is live), the two processes delete and rewrite each other's Turbopack cache mid-flight. Symptoms: `Failed to restore task data (corrupted database or bug)`, `Unable to open static sorted file …sst`, `Another write batch or compaction is already active`, surfaced in the browser as **Internal Server Error** or an infinite "Compiling…". It is NOT a code bug — `curl` may hit the healthy instance while the browser hits the broken one, which is the tell.

**Rule:** Keep exactly one `next dev` running. Don't run `npm run build` while it's up. Recovery: `pkill -9 -f next-server; pkill -9 -f "next dev"; lsof -ti:3000 | xargs kill -9; rm -rf .next node_modules/.cache; npm run dev`. Verify one logical server before testing.

## Audit findings are SURFACE reads — verify actual values before unifying
Date: 2026-06-26

The explorer/enforcer audit flags duplicates and "matches" by pattern, but the read is shallow and was wrong repeatedly. Before unifying ANY "duplicate," read the actual values on both sides:
- A1 "the same mono-label object copy-pasted 8×" was actually THREE families: `MONO_STYLE` (10px/0.06em), an eyebrow (11px/1.4px), and a scattered 11px/0.04–0.12em label family. Flattening them would have shrunk every eyebrow and changed tracking — a visual regression, not a dedup.
- A3/A4 "getInitials/formatDate duplicated" were NOT duplicates: different output (whitespace/unicode handling; `"Jun 26, 2026"` vs `"Fri, Jun 26"`). Merging would change behavior.
- A8 "inline hairline matches InsetHairline" — the component was 56px on ALL viewports; the inline was `md:mx-14` (responsive, 0 on mobile). A naive swap adds a 112px mobile inset.

**Rule:** "looks identical" ≠ "is identical." For any consolidation, have the engineer read both definitions and confirm byte-equal behavior; if values genuinely differ, do NOT force-fit — report it. A half-done dedup that flattens real variation is worse than none.

## Hex→token sweep recipe (zero-visual when token == literal)
Date: 2026-06-26

When a CSS var is DEFINED as the exact hex it replaces (verify in `app/globals.css`), swapping raw hex → `var(--token)` is provably zero-visual, so localhost sign-off is just "does it look identical?" Scripted two-pass regex, per file, case-insensitive:
- Pass A (Tailwind arbitrary): `\[#HEX\](?!/)` → `[var(--token)]` — negative lookahead protects `/opacity`.
- Pass B (inline-style/literal): `(?<!\[)#HEX\b` → `var(--token)` — lookbehind protects bracket leftovers; `\b` protects 8-digit alpha.

**Always LEAVE:** Tailwind opacity-modified arbitrary hex (`bg-[#3E1540]/95` — `/opacity` does NOT compute on a `var()` color in Tailwind v4), `rgba(...)`, 8-digit alpha hex, `<meta theme-color>` / `themeColor` (browser chrome needs a literal), and any hex NOT in the token map. Verify with a symmetric diff (equal insertions/deletions = pure 1:1 swaps) and a final grep proving zero plain target hexes remain outside the intended exceptions. Off-token hexes that have no matching token (e.g. `#ECE8DE`) need an explicit snap decision, not a silent merge.

## Performance: chat-list RPC, tab code-splitting, SWR caching
Date: 2026-06-27

- **`get_chat_previews` deliberately EXCLUDES archived groups** and returns no `archived` column. Do NOT reuse it for any list with an "Archived" section (e.g. `ChatListPanel`) — archived chats vanish. The sibling RPC `get_chat_list(p_user_id, p_ministry_id)` includes archived groups + a `group_archived` boolean. Both are `STABLE SECURITY DEFINER, search_path=public`, take user id + ministry id as args. Mirror the pattern; don't invent a new one.
- **ChatListPanel N+1** fired `1 + 2N` queries per desktop mount; replaced with one `get_chat_list` RPC. The **mobile** `ChatsTab` loader (~line 3451) still has the same `Promise.all(groups.map(...))` N+1 — reuse `get_chat_list` there too in a later pass.
- **Tabs are code-split:** `home-app.tsx` lazy-loads the 9 non-Home tabs via `next/dynamic(..., { ssr:false })` with skeleton `loading` fallbacks; only `HomeTab` is eager. New tabs follow the same pattern. Heavy libs imported inside a tab (e.g. `@emoji-mart/data`, ~2MB) must be lazy-loaded at point-of-use, not module-level.
- **Skeletons live in `components/central/skeletons.tsx`** (`SkeletonBlock` + per-tab skeletons). Motion is the `.skeleton-pulse` opacity pulse in `globals.css` (calm, reduced-motion aware). Use instead of bare `<Spinner/>`.
- **SWR cache (Phase 2a):** `SWRConfig` in home-app (`revalidateOnFocus:false, keepPreviousData:true, dedupingInterval:5000`). Home/Announcements/Directory tabs fetch via `useSWR` with ministry-scoped keys, so revisiting a tab paints from cache instantly. Writes use optimistic `mutate(asyncFn, { optimisticData, rollbackOnError, revalidate:false })`. Skeleton shows only on first load (`isLoading || !data`). Chats + Plan tabs are NOT yet converted (Phase 2b).
- **`rsvps` table has NO `ministry_id` column** — scoping is via the RLS join to `announcements`. RSVP writes must NOT add `ministry_id` (would error). Convention #8's "ministry_id on all writes" applies only to tables that carry the column.

## Multi-session / git hygiene — never run two Claude sessions in one working dir
Date: 2026-06-27

**Two Claude sessions in the SAME working directory corrupt each other.** A working tree has exactly one active branch; when session B runs `git checkout`, it yanks the branch out from under session A, so A's edits land on the wrong branch. Concurrent `npm run dev` (the `dev` script does `rm -rf .next`) and concurrent `git stash`/index ops then corrupt the Turbopack cache and leave stash-pop conflict markers (`<<<<<<< Updated upstream` / `>>>>>>> Stashed changes`) in source files. This actually happened and stranded a fix on the wrong branch.

**Rules:**
- One session per **git worktree** (separate dir, separate active branch, shared `.git`): `git worktree add ../central-<name> <branch>`. Run each session's dev server on a different port (`next dev -p 3001`). Use `EnterWorktree`/`ExitWorktree` to drive a session inside a worktree.
- **Never let verification subagents run `git stash`** to diff against HEAD — concurrent stash/pop is a prime corruption source. Compare lint output by reading it, not by stashing.
- Symptom of corruption: `Persisting failed: Unable to write SST file`, turbopack panics, missing `build-manifest.json`, or a persistent client-side exception that survives a `.next` clear. Recovery: kill ALL `next` processes, `rm -rf .next`, restart ONE server; your committed/pushed branches are the safe source of truth.

## Don't run `next build` and `next dev` in the same worktree at once
Date: 2026-06-27

`npm run build` (next build) and `npm run dev` (next dev) BOTH write to the same `.next` directory. If a dev server is live in a worktree while verification/build cycles run `npm run build` in that SAME worktree, they corrupt each other's Turbopack persistent cache — symptom: `Failed to write page endpoint`, `Failed to restore task data (corrupted database or bug)`, missing `.sst` / `build-manifest.json`, Turbopack panics, and the dev server returns 500 even though `npm run build` passes standalone. The code is fine; only the cache is poisoned.

**Rule:** while actively running engineer/tester build cycles in a worktree, keep that worktree's dev server STOPPED. Start the dev server only for a testing handoff, after the build cycles are done — and don't run `npm run build` again while it's up. Recovery if it happens: kill the dev server, `rm -rf .next`, restart. (Caused by the `git worktree move` era too: a moved `.next` carries stale absolute paths — always `rm -rf .next` after moving a worktree.)

## Adding a dependency: update the lockfile the project ACTUALLY uses (pnpm here)
Date: 2026-06-27

This repo commits BOTH `package-lock.json` (npm) and `pnpm-lock.yaml` (pnpm), but **Vercel builds with `pnpm install --frozen-lockfile`**. When `swr` was added via `npm install --legacy-peer-deps`, only `package-lock.json` updated — `pnpm-lock.yaml` stayed stale. Local `npm run build` passed (npm had swr), but EVERY Vercel deploy failed at the install step in 4–7s with `ERR_PNPM_OUTDATED_LOCKFILE` (lockfile not up to date with package.json). The code was never the problem.

**Rules:**
- When adding/removing a dependency, run **`pnpm install`** (this project uses pnpm on Vercel) and commit the updated **`pnpm-lock.yaml`**. Don't add deps with npm here.
- A fast Vercel failure (a few seconds, before compilation) is almost always the **install step** (lockfile/peer mismatch), NOT a code/type error. A passing local `npm run build` does NOT prove the Vercel install will succeed if the two package managers' lockfiles diverge.
- Diagnose Vercel failures from the actual build log (`mcp__vercel__get_deployment_build_logs`, errorsOnly) before guessing.
- To verify before pushing, run the exact thing Vercel runs: `pnpm install --frozen-lockfile` (exit 0 = good).
