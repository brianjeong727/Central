# Lessons

- When changing a responsive nav, verify the desktop grid has one explicit track per visible region. A three-part header needs left, center, and right columns, not a two-column grid with an implicit third item.
- For warm, welcoming landing imagery, avoid heavy ink/plum overlays across the whole hero. Use a lighter warm scrim and localized contrast behind text so the image stays bright.

## Edge-case-test pure algorithms by RUNNING them (group-generator audit)
- `lib/group-algorithm.ts` is pure (no server imports) — the reliable way to audit it is to IMPORT the real exported functions into a throwaway harness and execute the edge cases, not just reason about them. Runner: `npx --yes tsx@4 harness.ts` (this slot's Node is v20, which canNOT `--experimental-strip-types`, and `tsx` isn't a dep — so use `npx tsx`). Two gotchas: import via the ABSOLUTE path with the `.ts` extension (`import {...} from "/abs/path/lib/group-algorithm.ts"`) — tsx does NOT resolve the `@/` tsconfig alias; and macOS has no `timeout` binary. Running the real functions caught bugs that reading alone made ambiguous (e.g. proving a flag was a no-op).
- Bug pattern found & fixed (watch for it elsewhere): **a feature flag whose logic lives in only ONE code branch.** `separateVisitors` was only honored inside the `if (balanceByYear)` path; the `else` path shuffled visitors in with everyone → the toggle silently did nothing unless balance-by-year was also on. Fix: hoist the flag's handling so it wraps BOTH branches. Same class: `prevPairings` was passed into `runSmallGroupAlgorithm` but its nested `runAlgorithm` call hardcoded `smallGroupMode:false`, so the prev-pairing optimizer never ran → "avoid previous pairings" was a no-op in DGL mode. When a flag/param is threaded through nested calls, verify every hop actually consumes it.
- **Hardcoded year lists are time-bombs.** `YEAR_ORDER = [2025,2026,2027,2028]` meant any student graduating 2029+ (freshmen/sophomores *today*) fell into the "unknown" bucket and wasn't year-balanced. Replaced with buckets derived from the `graduation_year`s actually present in the pool. Never hardcode "current" graduating classes — derive from the data (or the current date).
- **Preview count must mirror the real pool build.** The group-source "X people in pool" preview counted raw `form_responses` rows, while generation deduped by `user_id` and kept only respondents with a profile — so the preview overstated and a form answered only by non-members showed responses yet generated "No people found." Make any count-preview run the SAME dedup + filter the actual operation uses. And the form-pool profiles query must carry `.eq("ministry_id", …)` on BOTH the preview and the generate path (Convention #8) — the server-action copy uses the admin client, which bypasses RLS, so the explicit scope matters most there.

## Semester / date boundary bugs
- `getMonth() + 1` returns 1–12. The spring semester runs Jan–May, so the spring guard must be `month <= 5`, not `month <= 4`. Off-by-one on the boundary causes the entire month of May to fall into the wrong semester, breaking every DB query that uses that label as a filter.
- Always verify the computed semester label matches the seeded test data. If the seed uses `spring_2026` but the app computes `summer_2026`, the feature silently shows an empty state instead of the real data. Confirm the two match before testing.

## Server action error handling
- Every `"use server"` action must have a top-level `try/catch`. Without it, any unhandled DB error or exception causes Next.js to return a cryptic `500 Internal Server Error` ("An error occurred in the Server Components render") with no visible cause in the UI or standard logs. The fix: wrap the whole body in try/catch and return `{ error: e.message }` so the client can surface a real message.
- Every client-side call to a server action needs a `catch` block, not just `try/finally`. `finally` runs but does not catch — if the action boundary itself throws (network error, serialization failure, unhandled server exception), the error propagates as an unhandled Promise rejection and the UI shows nothing. Pattern: `try { ... } catch (e) { setError(e.message) } finally { setLoading(false) }`.
- Always check the return value of Supabase delete/insert/update and return the error with a descriptive message (not just "Failed to save"). Vague errors make production debugging impossible.

## Navigation Persistence System (URL state)
Date: 2026-05-23 (system formalized 2026-06-29)

This is now a SYSTEM, not per-tab hand-rolling. The single source of truth is `app/home/nav-state.ts` — do not reintroduce a copy-pasted `replaceParam` or write `new URLSearchParams + router.replace` inline.

### The three rules
1. **Browse/read state persists** (URL): top-level tab, every subtab, and every "what am I viewing" selection. Reload restores you exactly.
2. **Create/edit/settings surfaces are EPHEMERAL** (plain React state, NEVER a URL param): compose/edit, team settings, congregation create, journal entry editor, form-fill, chat settings, create-chat. A reload drops you back to the underlying browse view, unsaved work gone. Tabs unmount on switch and remount on active-nav reset, so plain state gives this for free.
3. **Clicking the ACTIVE top-level nav resets that tab to its landing** (clears its params via `clearTabParams` + bumps `navResetKey` to remount the tab). **Switching to a DIFFERENT tab keeps SIDEBAR-LEVEL params but clears FOLDED-IN ones** (see rule 4) — you return to the same workspace/member/open-chat, but the folded sub-page within it (deep subtab, settings page, drill-in detail) resets to that section's default. (Reload still restores everything in the URL exactly — the leave/return reset only fires on in-app nav via `handleNavClick`.)
4. **Browse params split into two tiers** (`TAB_FOLDED_PARAMS` in `nav-state.ts`). SIDEBAR-LEVEL = "which item along the sidebar" — plan `team`/`rteam`, chats `chats`/`chat`, directory `member` — these PERSIST across leave/return. FOLDED-IN = deep subtabs + settings/finance sub-pages + drill-in detail — plan `sotab`/`ptab`/`sgltab`/`evtab`/`week`/`fsec`, profile `section`/`jtab`, settings `stab`, forms `fresp`, congregation `cq` — the SWITCH branch of `handleNavClick` nulls these so returning lands on the section default. **CRITICAL: a folded param that has a shell-owned `useState` mirror in `home-app` must ALSO be reset to its no-param default in the switch branch** (`profileSection`↔`section`, `studentOrgSection`↔`sotab`, `sglSection`↔`sgltab`, `financeTeamSection`↔`fsec`, `congregationView`↔`cq`, plus `studentOrgPlanningEvent`) — clearing the URL param alone won't reset shell state that survives the tab remount, and the reset default MUST equal the state's no-param `useState` initializer or you land on the wrong subtab. Folded params with only component-local state (`jtab`, `ptab`) reset for free via the `key={\`${activeTab}-${navResetKey}\`}` content remount on switch.

### The module (`app/home/nav-state.ts`)
- `useNavState()` → `{ setParam, setParams, clearTabParams }`. `setParams(mutations)` is canonical: ONE atomic `window.history.replaceState` (set non-null keys, delete null keys), reads `window.location.search` at call time, SSR-guarded. **It uses `history.replaceState`, NOT `router.replace`, on purpose:** `router.replace` re-ran the `/home` server component on every param change (URL updates took ~seconds, esp. in dev) AND didn't commit `window.location` synchronously, so a follow-up `setParams` read a stale URL and clobbered `?tab` (reload → wrong tab). `history.replaceState` is instant (no RSC refetch) and updates `window.location` synchronously, so the next write always reads the fresh URL. Next 16 keeps `useSearchParams()` in sync with it. `setParam` is the one-key convenience. `clearTabParams(tab, extra?)` deletes every `TAB_PARAMS[tab]` key in one replace.
- `TAB_PARAMS: Record<Tab, string[]>` — the per-tab registry of owned BROWSE params. **Every browse param a tab writes MUST be listed here**, or active-nav reset leaves it stale. Ephemeral surfaces are NOT in the registry (they're plain state, not URL).
- `TAB_FOLDED_PARAMS: Record<Tab, string[]>` + `ALL_FOLDED_PARAMS` — the FOLDED-IN subset of `TAB_PARAMS` (must be a strict subset per tab). The SWITCH branch spreads `...Object.fromEntries(ALL_FOLDED_PARAMS.map(p => [p, null]))` into its single `setParams` so leaving any tab clears every folded sub-page. Sidebar-level = `TAB_PARAMS` minus `TAB_FOLDED_PARAMS`. See rule 4 for the shell-state-mirror reset that must accompany it.
- `handleNavClick(tab)` in home-app is the single handler wired to BOTH desktop sidebar and mobile bottom-nav (keep them symmetric — never two different handlers).

### URL params in use (browse only; as of 2026-06-29)
- `?tab=` — top-level tab · `?chats=` — ChatsTab church/my subtab · `?chat=` — open conversation (desktop+mobile)
- `?team=`, `?sotab=`, `?ptab=`, `?evtab=`, `?sgltab=`, `?fsec=`, `?rteam=`, `?week=` — Plan tab / team sub-state
- `?member=` — Directory member · `?section=` + `?jtab=` — Profile section + journal subtab
- `?ann=` — open announcement detail overlay · `?cq=` — congregation responses detail · `?fresp=` — admin form-responses view · `?stab=` — Settings subtab
- **Removed (now ephemeral plain state):** `?compose=` (announcements editor), `?view=settings` (plan settings), `?cnew=` (congregation create).

### Atomic-replace traps (Convention #5)
- Never two `router.replace` in sequence for one logical navigation — they race on `window.location.search`. Build the full mutation and call `setParams({...})` once.
- **Open-from-another-tab is atomic:** opening a chat from any tab goes through `handleOpenChat` = `setParams({ tab:"chats", chat:id })` (one replace), NOT `handleNavClick("chats")` + a separate open.
- **Don't mirror a default into the URL from an effect.** The desktop "auto-open most-recent chat" sets local `globalOpenChat` only — it writes NO `?chat` (writing it would race the nav's `setParams`). Explicit opens own `?chat`; the auto-default doesn't need to persist.
- **A within-tab param write must ASSERT its owning tab — or a mount-fired write silently clobbers `?tab`.** Root cause of the "reload always goes to messages" bug: switching to Directory fires `setParams({tab:"directory"})` (replace #1), then Directory's mount auto-selects a member → `setParams({member})` (replace #2). `setParams` reads `window.location.search` at call time, but `router.replace` hasn't committed yet, so replace #2 reads the STALE `tab=chats` and writes it back — React renders Directory while `?tab` is stuck at `chats`, so reload lands on messages. Same trap for Plan's single-team auto-enter (`handleTeamChange` fires on mount). Fix: every within-tab writer (`handleMemberSelect`→`tab:"directory"`, `handleTeamChange`/`handleReceiptsTeamChange`→`tab:"plan"`, `handleProfileSectionChange`→`tab:"profile"`) includes its tab literal in the same one-shot `setParams`, so the explicit value overrides any stale read. Rule: **if a `setParams` can fire from a `useEffect` (mount-auto), it MUST carry `tab`** — never trust the in-flight URL to still hold the right tab. (Primary root fix is `setParams` using `history.replaceState`, which commits `window.location` synchronously so the stale read can't happen at all; the per-handler `tab` assertion is belt-and-suspenders kept for defense.)
- Invariant: `globalOpenChat` non-null ⟹ `activeTab === "chats"` (lazy-init from `?chat` only when `initialTab==="chats"`; the switch branch nulls it off-chats) — otherwise the fullscreen chat overlay leaks over another tab on reload.

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

**A wedged Turbopack cache can hang ONE route forever while the rest of the app is fine — and `rm -rf .next` alone does NOT clear it.** Real case: on a slot that had been restarted many times in a session, `/auth/callback` timed out at 120s (curl returned `000`) on every hit, while `/`, `/login`, `/home` all served in <0.1s. The route's own code was trivial (instant redirect when no `?code`), so the hang was Turbopack failing to compile that one route, never marking it ready. The wedge lived in **`node_modules/.cache` and `.turbo`**, which survive a `.next`-only wipe — that's why repeated `rm -rf .next` restarts never fixed it. Fix: wipe ALL THREE — `rm -rf .next node_modules/.cache .turbo` — then restart; the route recompiled in ~700ms. Diagnostic that isolates it: time individual routes with `curl -w "%{http_code} in %{time_total}s"`; if one route hangs (000/timeout) while others are instant, it's a wedged-cache compile hang, not a code or network problem. (This also masquerades as "auth is slow" / "sign-in struggles" when the hung route is `/auth/callback`.)

**Rule:** Keep exactly one `next dev` running. Don't run `npm run build` while it's up. Recovery: `pkill -9 -f next-server; pkill -9 -f "next dev"; lsof -ti:3000 | xargs kill -9; rm -rf .next node_modules/.cache; npm run dev`. Verify one logical server before testing.

**Verification gap (2026-06-27):** Re-hit this by running `npm run build` in a worktree whose `next dev` was live on the same `.next` — every route then 500s. It reached the user because the health check curled `/home`, which **307-redirects to `/login` before rendering**, so a render-time 500 is invisible. Always verify against a route that returns **200 by actually rendering** (`/`, `/login`) — a 307 proves nothing. A global Stop hook now enforces this automatically: `~/.claude/hooks/check-dev-500.sh` scans listening dev ports (3000–3005) for a 500 on `/` before Claude finishes and blocks the handoff if one is found.

## Visual changes — a passing build is not verification
Date: 2026-06-27

`npm run build` validates types/compile, never **appearance**. CSS regressions (background-clip resets, z-index, overflow, wrong color) pass the build and still render broken — shipped a greeting headline where the plum role word rendered as a solid plum block, build green the whole time. For any visual change, render and LOOK before claiming it works. If the surface is auth-gated (e.g. `/home`), screenshot the exact CSS in an isolated HTML harness with headless Chrome: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=out.png --window-size=W,H "file://harness.html"`.

**Specific trap that caused it:** the `background` **shorthand** resets `background-clip` to `border-box`. When layering a `.x-plum` variant rule over a `.x` base that relies on `background-clip: text`, the variant's `background:` shorthand silently clobbers the clip — the variant MUST re-declare `-webkit-background-clip: text; background-clip: text; color: transparent`, or the gradient fills the box as a solid block.

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
- **`useSWR` inside a `dynamic(..., { ssr:false })` chunk can silently fail to deliver fetched data — don't make it the source of truth for what renders.** Symptom: the chat sidebar (`ChatListPanel`, dynamically imported) intermittently showed "No church chats" on first load; re-clicking the Messages nav (a remount) loaded it. Deep debugging (instrument the fetcher + the render) proved: the key was correct, the `get_chat_list` RPC returned 10 rows, and `fetchChatList` returned 10 groups — yet the hook's `data` stayed **`undefined`** (`isLoading:false, isValidating:false, error:null`), and this happened for the MAIN-bundle `useSWR` for the same key too, so it is NOT a cache-isolation/SWRConfig-provider thing (there is one global cache, no `provider`). SWR just didn't commit the resolved data for that hook on the initial code-split mount. **Fix that finally worked: bypass SWR for display.** The parent (`home-app`, main bundle) fetches with a plain promise — `fetchChatList(key).then(setChatListData).catch(()=>{})` in a `useEffect` — and passes the array down as a `fallbackChats` prop; the panel renders `const allGroups = (data && data.length ? data : fallbackChats) ?? data ?? []`. A plain `fetch().then(setState)` reaching a rendered prop is deterministic; SWR's `data` is never trusted to populate the list. (Re-fetch `loadChatList()` in the realtime handler too, so the list still updates live.) **Rule: when a list lives in a `dynamic/ssr:false` component, fetch it in the static parent and pass it as a prop — don't rely on the chunk's `useSWR` data for the initial render.** Diagnostic technique that cracked it: log `{ keyArgsFULL, dataState: data===undefined?"UNDEFINED":array(len), isLoading, isValidating, error }` in the render AND `{ argsFULL, rows, err }` in the fetcher, then compare — identical keys + fetch returned rows + hook `data===undefined` ⟹ SWR delivery failure, not a key/RPC problem.
- Secondary hardening kept from the same investigation (good practice, but were NOT the root cause): a Supabase SWR fetcher should `if (error) throw error` (never return `[]` on failure — a transient blip becomes indistinguishable from genuinely-empty); an empty-state render should gate on `!isLoading && !error` (fold errored-no-data into the loading branch, never show "nothing here" on a failed/loading fetch); and a fire-and-forget `globalMutate(..., {revalidate:false})` whose updater can reject must be `.catch()`'d and must not coerce `undefined → []` (`current ? current.map(...) : current`), so a failed background refetch is a silent no-op, not a cache-poisoning write.
- **`rsvps` table has NO `ministry_id` column** — scoping is via the RLS join to `announcements`. RSVP writes must NOT add `ministry_id` (would error). Convention #8's "ministry_id on all writes" applies only to tables that carry the column.

## Multi-session / git hygiene — never run two Claude sessions in one working dir
Date: 2026-06-27

**Two Claude sessions in the SAME working directory corrupt each other.** A working tree has exactly one active branch; when session B runs `git checkout`, it yanks the branch out from under session A, so A's edits land on the wrong branch. Concurrent `npm run dev` (the `dev` script does `rm -rf .next`) and concurrent `git stash`/index ops then corrupt the Turbopack cache and leave stash-pop conflict markers (`<<<<<<< Updated upstream` / `>>>>>>> Stashed changes`) in source files. This actually happened and stranded a fix on the wrong branch.

**Rules:**
- One session per **git worktree** (separate dir, separate active branch, shared `.git`): `git worktree add ../central-<name> <branch>`. Run each session's dev server on a different port (`next dev -p 3001`). Use `EnterWorktree`/`ExitWorktree` to drive a session inside a worktree.
- **Never let verification subagents run `git stash`** to diff against HEAD — concurrent stash/pop is a prime corruption source. Compare lint output by reading it, not by stashing.
- Symptom of corruption: `Persisting failed: Unable to write SST file`, turbopack panics, missing `build-manifest.json`, or a persistent client-side exception that survives a `.next` clear. Recovery: kill ALL `next` processes, `rm -rf .next`, restart ONE server; your committed/pushed branches are the safe source of truth.

## Worktree sessions: keep branches FRESH against origin/main (separate axis from isolation)
Date: 2026-06-28

Worktrees solve **file-collision isolation** (two sessions can't stomp each other's working dir). They do NOTHING for **branch staleness** — every worktree still merges into the same `main`, so each peer merge makes the other branches staler. Two independent problems; the worktree workflow only fixes the first.

What this cost: a feature branch cut from a stale local `main` sat while peers merged **77 commits**. The eventual merge was a tangled semantic mess (same file rewritten on both sides) — had to abort and re-do the work on fresh `main`. Isolation was fine the whole time; freshness was the failure.

**Rules:**
- **Cut from `origin/main`, fetched — never a local `main`:** `git fetch origin && git worktree add ../central-<n> -b feat/x origin/main`. A bare `... main` uses a possibly-days-old local ref. (You can branch from `origin/main` from any worktree; the local `main` need not be checked out anywhere — only one worktree may hold it.)
- **Refresh on every peer merge, and before any PR:** `git fetch && git merge origin/main` (reinstall if deps changed). Small frequent merges are trivial; one deferred 77-commit merge is a disaster — same conflicts, far worse to resolve.
- **Keep branches short-lived.** The more parallel sessions, the faster `main` moves, the faster a long branch rots.
- Helper: `~/.claude/scripts/refresh-worktree.sh` — fetch → merge origin/main → reinstall-if-deps-changed, run from inside the worktree (refuses on a dirty tree or on `main`; stops on conflicts for manual resolution).

**One-liner:** worktrees make parallel *work* safe; a merge cadence makes parallel *branches* safe — you need both.

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

## Dev server vs `npm run build` share `.next` in a worktree slot
- Running `npm run build` (production) in a session worktree while that slot's `next dev` is live writes into the SAME `.next` directory and corrupts Turbopack's cache — the dev server then hangs (`curl` → 000) or 500s with `ENOENT .next/.../build-manifest.json` / "Unable to open static sorted file ...sst". The code is fine; only the cache is wrecked.
- Do NOT `rm -rf .next` while the dev server is running — it yanks the directory out from under the live process (same failure).
- To type-check/verify WITHOUT disturbing a live dev server, use `npx tsc --noEmit` (doesn't touch `.next`). Reserve `npm run build` for when dev is stopped.
- Recovery: `lsof -tiTCP:<port> | xargs kill -9` (kill ALL listeners — a half-killed old process causes EADDRINUSE on restart), `rm -rf .next`, then relaunch ONE `next dev`. Confirm a single listener before polling.

## Visual/layout changes MUST be visually verified before handoff — and two CSS footguns
- A build that passes + a clean static enforcer pass do NOT prove the UI renders correctly. The enforcer reads source, not rendered pixels. A layout bug (full-bleed where it should be a small button, overlap, wrong breakpoint visibility) sails straight through both. For ANY visual/layout change, look at it rendered (browser MCP screenshot at desktop 1440 + mobile 390) BEFORE handing to Brian. If browser MCP is unavailable (extension not connected), say so explicitly and treat the work as visually UNVERIFIED — do not present it as "ready to review" as if it were checked.
- **Footgun 1 — inline `style={{ display }}` overrides Tailwind `md:hidden`.** Inline styles beat classes, so `className="md:hidden" style={{ display: "inline-flex" }}` shows on ALL breakpoints — the responsive-hide silently fails. Put `display` in the className (`inline-flex md:hidden`), never inline, whenever a responsive display utility is involved.
- **Footgun 2 — a direct child of a `flex flex-col` (or `md:flex md:flex-col`) container stretches to full width** (default `align-items: stretch`). A button meant to be content-width becomes a full-bleed bar. Add `self-start` / `alignSelf: "flex-start"`. Both footguns combined produced a full-body-width "← back" bar leaking onto desktop in the SubpageShell.

## Worktree builds re-download Google Fonts every boot — the font-CDN trap
- Both `npm run dev` and `npm run build` start with `rm -rf .next`, and `next/font/google` (Bricolage Grotesque) is fetched from `fonts.gstatic.com` at compile time. There is **no persistent font cache** — the woff2 files live in `.next/dev/static/media/`, which the `rm -rf` wipes. So every dev/build boot re-downloads the fonts over the network.
- When the CDN is throttled/unreachable, the build fails with `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` (+ `Error while requesting resource` / `Connection timed out`) traced to `app/layout.tsx`. This looks like a code error but is purely a network/env blocker — nothing to do with your changes. Confirm with `curl --max-time 8 <the gstatic woff2 URL from the devlog>`; a slow/partial 200 means throttling.
- **Do NOT kill a healthy dev server to run a build.** A running dev server holds the only warm font cache (in its `.next`); killing it to build (both need sole `.next` — they collide, corrupting the turbopack cache with `Persisting failed: Unable to write SST file`) loses that cache, and a fresh boot can't re-download while throttled. You can strand localhost until the network recovers.
- Recovery: wait for gstatic to be reachable (throttling is often transient — it recovered within minutes), then build/restart. You can't borrow another slot's `.next` (it's keyed to that slot's HEAD/paths and would invalidate → refetch). To verify code correctness meanwhile, use `npx tsc --noEmit` (no font fetch).
- **`next build` (Turbopack) can hang at "Creating an optimized production build ..." (0% CPU, ~0 RSS) for reasons OTHER than the font CDN.** Seen 2026-07-01 in slot s2: build stalled indefinitely (5 attempts, 10-min timeouts) even after confirming (a) the other slots' dev servers were stopped so RAM was free (~450MB free + GBs reclaimable), (b) `.next`/`node_modules/.cache` cleared, (c) heap raised to 6 GB, (d) run outside the Bash sandbox, and (e) `fonts.googleapis.com`/`gstatic` returning fast 200/404. The hang is BEFORE any file compiles, so it is never caused by the diff under test. `npx tsc --noEmit` (full type-check, green) is the accepted correctness gate when the build won't converge; getting an actual `npm run build` to pass then needs Brian's own environment (fresh terminal / reboot) — don't burn more than ~2 attempts before surfacing it.

## RLS hardening — permissive `auth.uid() IS NOT NULL` policies silently defeat scoped ones
Date: 2026-07-01 (messaging-scale-500 RLS pass)
- Postgres RLS combines multiple PERMISSIVE policies for the same (table, cmd) with **OR**. So a leftover blanket policy like `group_members_select`/`_insert`/`_update` whose qual is just `auth.uid() IS NOT NULL` makes every carefully-scoped policy next to it a **no-op** — any authenticated user gets full access table-wide. When hardening, `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies` and hunt for these blanket permissive rows FIRST; they're the real hole, not the scoped policies. (`messages`/`message_reactions`/`group_members` all had duplicate/blanket policies predating the tracked migrations.)
- **Dropping a blanket policy promotes the scoped one to the REAL gate for the first time — verify the scoped policy actually covers every live code path before dropping.** Dropping `group_members_insert` (blanket) made the scoped "Authorized users can add group members" (admin/leader OR creator OR self) the effective gate — which would have BROKEN a regular member adding people to a `my`/group chat, because the UI's `canManage = (isChurch && isAdminOrLeader) || isMy` lets any member add in non-church chats. Fix was to widen the scoped INSERT policy to mirror the UI (`... OR (is_group_member(group_id, auth.uid()) AND groups.type <> 'church')`), not to accept the silent tightening. Lesson: for each blanket policy you remove, enumerate the client call sites for that (table, cmd) and confirm the surviving scoped policy passes each one; RLS that "was never actually enforced" can hide a feature's true access rules.
- The Supabase MCP auto-mode classifier will BLOCK a migration that *grants new rights* (RBAC widening) even when a related drop was approved — that widening needs its own explicit user sign-off. Split the migration: apply the unambiguously-safe drops, then escalate the grant as a separate decision.

## A worktree can rot into a Turbopack dev deadlock — recreate the worktree, don't reinstall deps
Date: 2026-07-03
- **Symptom:** a slot's dev server boots fine (`✓ Ready`) but **hangs forever on the first route compile** — devlog stuck at `○ Compiling /login ...`, the spawned `postcss.js` worker pinned at **0% CPU** (a deadlock, not slowness), every request returns nothing (curl `HTTP 000` until timeout). Reproduces across `.next` wipes, branch changes, and full dev restarts.
- **What it is NOT** (all verified before concluding): not the code (peer slots on the same `origin/main` compiled `/login` 200 in <3s), not the deps (`node_modules` byte-identical to a working slot — same `next-swc` `.node` checksum, same next version), not CPU starvation (freed ~5.6 cores by killing a runaway editor; still deadlocked), not a quarantine xattr, not a path-keyed cache outside `.next`. The corroborating tell: the same worktree's leftover `.next-trash-*` dir **would not `rm`** (a single clean `rm -rf` made zero progress on 297 MB) — the directory itself was in a bad filesystem state.
- **Root cause:** the worktree *directory's own filesystem state* is corrupt/stuck (bad inodes / stuck file ops). It is specific to that directory, not the path, deps, or system. Turbopack's file ops there hang at 0% CPU.
- **Fix — recreate the worktree fresh (new inodes):**
  1. Kill everything on the slot (`pkill -9 -f 'central-sN'`, free the port).
  2. `git worktree remove <dir> --force` will likely **hang deleting `node_modules`/`.next-trash`** — don't wait on it. Instead `mv <dir> <dir>-broken-<ts>` (an atomic rename is instant even while a stuck `rm` holds the dir) to free the path, then `git worktree prune`.
  3. `git worktree add --detach <dir> origin/main`.
  4. **Clone deps instantly with APFS copy-on-write from a healthy slot:** `cp -cR ../central-sGOOD/node_modules <dir>/node_modules` (no multi-minute `npm install`), then `ln -sf` the shared `.env.local`.
  5. Restart dev — fresh compile completes in seconds.
  6. Lazily `nice -n 19 rm -rf <dir>-broken-*` in the background (the stuck delete eventually clears once nothing contends).
- **Don't** burn time reinstalling `node_modules` (identical to a working slot ⇒ never the cause) or chasing CPU/watchers. Byte-identical deps + 0%-CPU compile deadlock ⇒ the directory is the problem ⇒ recreate it.
- Orthogonally useful find: an **app-translocated** editor (running from `/private/var/folders/.../AppTranslocation/...`, i.e. launched from quarantine) had two renderer procs pegged at ~280% CPU each (~5.6 cores), spiking system load to ~8. `ps aux | sort -nrk3 | head` finds runaway CPU fast; that translocated state is abnormal and worth killing on sight.

## Team icons — never render the raw `teams.icon` value

**Mistake:** the governance Team-Access matrix (settings-tab) and the founder admin panel rendered `{team.icon}` directly. `teams.icon` holds legacy emoji (💰/🏛️/🎵) and some rows even store a stray iconKey string ("users"), so the chip showed emoji or garbled literal text instead of the design-system glyph.

**Rule:** a team's visual is the `PlanLineIcon` stroked glyph keyed by its preset. Resolve it with `teamIconKey(team)` (`app/home/workspace-presets.ts`, source of truth: `presetIdForTeam` → preset `iconKey`, fallback `"clipboard"`) and render `<PlanLineIcon iconKey={teamIconKey(team)} bg="transparent" fg="var(--plum)" size={…} radius={0} />`. **Never** render `team.icon`/`teams.icon` in any list, matrix, chip, or picker. This is DESIGN_SYSTEM §"Do not: emoji as iconography" made concrete. Add `team_type` to the query if the row doesn't carry it (teamIconKey classifies by team_type then name).

## setState functional updaters must be pure — no server actions inside them (2026-07-10)
`SuperSwitcher.toggleOpen` called a "use server" action (`getSandboxTeams`) inside a `setOpen((v) => ...)` updater. React executes functional updaters during the render/reconciliation phase, so the action's Router integration fired mid-render → "Cannot update a component (Router) while rendering a different component." The bug was latent for as long as the component existed and only surfaced when Phase 5 mounted the component twice. Rule: side effects (server actions, fetches, other setState) live in the event-handler body or an effect — key off the closure's committed value (`if (!open) load()`), never inside the updater.
