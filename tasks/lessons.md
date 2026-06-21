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

**How to apply:** See §14 of `skills/design-system/DESIGN_SYSTEM.md` for the exact implementation pattern. Always use two state variables: `confirmId` (pending confirmation) and `deleting` (in-flight). Never use `window.confirm()`.

**Common mistake to avoid:** Using `window.confirm()` or a modal for small items in lists/tables. The inline pattern is always preferred — it keeps focus in place and feels native to the UI.

## Font alias tech debt (Bricolage migration)
Date: 2026-06-21

After switching to Bricolage Grotesque as the sole typeface, 22 component files that hardcode `var(--font-instrument-serif)` or `var(--font-inter)` were kept untouched. Compatibility is maintained via CSS aliases in `app/globals.css` `:root`:
```css
--font-instrument-serif: var(--font-bricolage-grotesque);
--font-inter:             var(--font-bricolage-grotesque);
```

**Tech debt:** The variable names now lie — a developer reading `var(--font-instrument-serif)` in a component will not know it renders Bricolage unless they trace the alias in `globals.css`. If the typeface is ever changed again, update the aliases and do NOT introduce a new variable with the old name. If a full per-file migration is done, delete the alias block and remove this lesson.
