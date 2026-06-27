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
