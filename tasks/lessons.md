# Lessons

- When changing a responsive nav, verify the desktop grid has one explicit track per visible region. A three-part header needs left, center, and right columns, not a two-column grid with an implicit third item.
- For warm, welcoming landing imagery, avoid heavy ink/plum overlays across the whole hero. Use a lighter warm scrim and localized contrast behind text so the image stays bright.

## Edge-case-test pure algorithms by RUNNING them (group-generator audit)
- `lib/group-algorithm.ts` is pure (no server imports) — the reliable way to audit it is to IMPORT the real exported functions into a throwaway harness and execute the edge cases, not just reason about them. Runner: `npx --yes tsx@4 harness.ts` (this slot's Node is v20, which canNOT `--experimental-strip-types`, and `tsx` isn't a dep — so use `npx tsx`). Two gotchas: import via the ABSOLUTE path with the `.ts` extension (`import {...} from "/abs/path/lib/group-algorithm.ts"`) — tsx does NOT resolve the `@/` tsconfig alias; and macOS has no `timeout` binary. Running the real functions caught bugs that reading alone made ambiguous (e.g. proving a flag was a no-op).
- Bug pattern found & fixed (watch for it elsewhere): **a feature flag whose logic lives in only ONE code branch.** `separateVisitors` was only honored inside the `if (balanceByYear)` path; the `else` path shuffled visitors in with everyone → the toggle silently did nothing unless balance-by-year was also on. Fix: hoist the flag's handling so it wraps BOTH branches. Same class: `prevPairings` was passed into `runSmallGroupAlgorithm` but its nested `runAlgorithm` call hardcoded `smallGroupMode:false`, so the prev-pairing optimizer never ran → "avoid previous pairings" was a no-op in DGL mode. When a flag/param is threaded through nested calls, verify every hop actually consumes it.
- **Hardcoded year lists are time-bombs.** `YEAR_ORDER = [2025,2026,2027,2028]` meant any student graduating 2029+ (freshmen/sophomores *today*) fell into the "unknown" bucket and wasn't year-balanced. Replaced with buckets derived from the `graduation_year`s actually present in the pool. Never hardcode "current" graduating classes — derive from the data (or the current date).
- **Preview count must mirror the real pool build.** The group-source "X people in pool" preview counted raw `form_responses` rows, while generation deduped by `user_id` and kept only respondents with a profile — so the preview overstated and a form answered only by non-members showed responses yet generated "No people found." Make any count-preview run the SAME dedup + filter the actual operation uses. And the form-pool profiles query must carry `.eq("ministry_id", …)` on BOTH the preview and the generate path (Convention #8) — the server-action copy uses the admin client, which bypasses RLS, so the explicit scope matters most there.

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
- `?member=` — Directory member · `?section=` + `?jtab=` — Profile section + journal subtab · `?pset=` — Profile mobile settings hub/section (folded; gear → Notifications/Account/Danger)
- `?ann=` — open announcement detail overlay · `?cq=` — congregation responses detail · `?fresp=` — admin form-responses view · `?stab=` — Settings subtab
- **Removed (now ephemeral plain state):** `?compose=` (announcements editor), `?view=settings` (plan settings), `?cnew=` (congregation create).

### Atomic-replace traps (Convention #5)
- Never two `router.replace` in sequence for one logical navigation — they race on `window.location.search`. Build the full mutation and call `setParams({...})` once.
- **Open-from-another-tab is atomic:** opening a chat from any tab goes through `handleOpenChat` = `setParams({ tab:"chats", chat:id })` (one replace), NOT `handleNavClick("chats")` + a separate open.
- **Don't mirror a default into the URL from an effect.** The desktop "auto-open most-recent chat" sets local `globalOpenChat` only — it writes NO `?chat` (writing it would race the nav's `setParams`). Explicit opens own `?chat`; the auto-default doesn't need to persist.
- **A within-tab param write must ASSERT its owning tab — or a mount-fired write silently clobbers `?tab`.** Root cause of the "reload always goes to messages" bug: switching to Directory fires `setParams({tab:"directory"})` (replace #1), then Directory's mount auto-selects a member → `setParams({member})` (replace #2). `setParams` reads `window.location.search` at call time, but `router.replace` hasn't committed yet, so replace #2 reads the STALE `tab=chats` and writes it back — React renders Directory while `?tab` is stuck at `chats`, so reload lands on messages. Same trap for Plan's single-team auto-enter (`handleTeamChange` fires on mount). Fix: every within-tab writer (`handleMemberSelect`→`tab:"directory"`, `handleTeamChange`/`handleReceiptsTeamChange`→`tab:"plan"`, `handleProfileSectionChange`→`tab:"profile"`) includes its tab literal in the same one-shot `setParams`, so the explicit value overrides any stale read. Rule: **if a `setParams` can fire from a `useEffect` (mount-auto), it MUST carry `tab`** — never trust the in-flight URL to still hold the right tab. (Primary root fix is `setParams` using `history.replaceState`, which commits `window.location` synchronously so the stale read can't happen at all; the per-handler `tab` assertion is belt-and-suspenders kept for defense.)
- Invariant: `globalOpenChat` non-null ⟹ `activeTab === "chats"` (lazy-init from `?chat` only when `initialTab==="chats"`; the switch branch nulls it off-chats) — otherwise the fullscreen chat overlay leaks over another tab on reload.

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

## Font alias tech debt (Bricolage migration)
Date: 2026-06-21

After switching to Bricolage Grotesque as the sole typeface, 22 component files that hardcode `var(--font-instrument-serif)` or `var(--font-inter)` were kept untouched. Compatibility is maintained via CSS aliases in `app/globals.css` `:root`:
```css
--font-instrument-serif: var(--font-bricolage-grotesque);
--font-inter:             var(--font-bricolage-grotesque);
```

**Tech debt:** The variable names now lie — a developer reading `var(--font-instrument-serif)` in a component will not know it renders Bricolage unless they trace the alias in `globals.css`. If the typeface is ever changed again, update the aliases and do NOT introduce a new variable with the old name. If a full per-file migration is done, delete the alias block and remove this lesson.

## Renaming exports in a shared file — grep all import sites first
Date: 2026-06-22 (compressed 2026-07-14)

After replacing or renaming exports in a shared module (e.g. `app/(auth)/shared.tsx`'s `PasswordToggle` → `EyeButton`), grep every import site (`grep -r "from.*/(auth)/shared"`) before marking the task done — pages outside the immediate refactor (`update-password`) imported the old name and broke the build.

## Dev server & `npm run build` — one `.next` per worktree (merged from 3 entries, 2026-07-14)

The `dev` script is `rm -rf .next && next dev`, and `npm run build` also wipes/writes `.next`. Never run two `next dev` in one worktree, never run `npm run build` while that worktree's dev server is live, and never `rm -rf .next` under a running server — the processes corrupt each other's Turbopack cache. Symptoms: `Failed to restore task data (corrupted database or bug)`, `Unable to open static sorted file …sst`, missing `build-manifest.json`, Turbopack panics, 500s or infinite "Compiling…" while a standalone `npm run build` passes. It is NOT a code bug (`curl` may hit the healthy instance while the browser hits the broken one — that's the tell).

- **A wedged cache can hang ONE route forever while the rest is fine — and it survives `.next` wipes.** Real case: `/auth/callback` timed out (curl `000`) on every hit while `/`, `/login`, `/home` served in <0.1s; the wedge lived in `node_modules/.cache` and `.turbo`. Fix: wipe ALL THREE — `rm -rf .next node_modules/.cache .turbo` — then restart (route recompiled in ~700ms). Diagnostic: time individual routes with `curl -w "%{http_code} in %{time_total}s"`; one hanging route + others instant = wedged-cache compile hang, not code. (Masquerades as "auth is slow" when the hung route is `/auth/callback`.)
- **To type-check without disturbing a live dev server:** `npx tsc --noEmit` (doesn't touch `.next`). Reserve `npm run build` for when dev is stopped — verify.sh sequences this correctly (kill port → build → restart dev).
- **Recovery:** kill ALL listeners (`lsof -ti:<port> | xargs kill -9` — a half-killed process causes EADDRINUSE), `rm -rf .next node_modules/.cache`, relaunch ONE `next dev` **with `-p <port>`** for slots.
- **Verify against a route that renders a 200** (`/`, `/login`) — `/home` 307-redirects before rendering, so a render-time 500 is invisible behind it. The global Stop hook (`~/.claude/hooks/check-dev-500.sh`) backstops this by scanning dev ports for a 500 on `/`.
- After `git worktree move`, always `rm -rf .next` — a moved cache carries stale absolute paths.
- **The symptom never points at the cause** (folded 2026-10-24 from 2026-08-08): a build under a live dev server showed up as `auth.setup.ts` failing both logins (55 tests never ran) and as a 500 caught by the Stop hook. When a suite dies in `auth.setup` or every route 500s right after a build, `curl localhost:<port>/` and suspect `.next` before the app. Never hand-roll a build in a slot — `scripts/verify.sh --port <slot port>` already frees the port, builds, restarts and polls.

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

## Worktree sessions: keep branches FRESH against origin/main
Date: 2026-06-28 (compressed 2026-07-14)

Worktrees isolate files, not branch staleness — a branch cut from a stale local `main` once rotted **77 commits** behind and the work had to be redone on fresh main. Rules: cut from FETCHED `origin/main` only (session.sh does this); `git fetch && git merge origin/main` on every peer merge and before any PR (small frequent merges are trivial; one deferred 77-commit merge is a disaster); keep branches short-lived. (Slot landing/reset is Convention #17 — this is the mid-flight refresh cadence.)

## Two CSS footguns that leak layout bugs past the build
Date: 2026-06-30 (compressed 2026-07-14)

- **Inline `style={{ display }}` overrides Tailwind `md:hidden`.** Inline styles beat classes, so `className="md:hidden" style={{ display: "inline-flex" }}` shows on ALL breakpoints. Put `display` in the className (`inline-flex md:hidden`) whenever a responsive display utility is involved.
- **A direct child of a `flex flex-col` container stretches to full width** (default `align-items: stretch`) — a content-width button becomes a full-bleed bar. Add `self-start` / `alignSelf: "flex-start"`. (Both combined produced a full-body-width "← back" bar leaking onto desktop in SubpageShell.)

## Worktree builds re-download Google Fonts every boot — the font-CDN trap
- Both `npm run dev` and `npm run build` start with `rm -rf .next`, and `next/font/google` (Bricolage Grotesque) is fetched from `fonts.gstatic.com` at compile time. There is **no persistent font cache** — the woff2 files live in `.next/dev/static/media/`, which the `rm -rf` wipes. So every dev/build boot re-downloads the fonts over the network.
- When the CDN is throttled/unreachable, the build fails with `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` (+ `Error while requesting resource` / `Connection timed out`) traced to `app/layout.tsx`. This looks like a code error but is purely a network/env blocker — nothing to do with your changes. Confirm with `curl --max-time 8 <the gstatic woff2 URL from the devlog>`; a slow/partial 200 means throttling.
- **Do NOT kill a healthy dev server to run a build.** A running dev server holds the only warm font cache (in its `.next`); killing it to build (both need sole `.next` — they collide, corrupting the turbopack cache with `Persisting failed: Unable to write SST file`) loses that cache, and a fresh boot can't re-download while throttled. You can strand localhost until the network recovers.
- Recovery: wait for gstatic to be reachable (throttling is often transient — it recovered within minutes), then build/restart. You can't borrow another slot's `.next` (it's keyed to that slot's HEAD/paths and would invalidate → refetch). To verify code correctness meanwhile, use `npx tsc --noEmit` (no font fetch).
- **`next build` (Turbopack) can hang at "Creating an optimized production build ..." (0% CPU, ~0 RSS) for reasons OTHER than the font CDN.** Seen 2026-07-01 in slot s2: build stalled indefinitely (5 attempts, 10-min timeouts) even after confirming (a) the other slots' dev servers were stopped so RAM was free (~450MB free + GBs reclaimable), (b) `.next`/`node_modules/.cache` cleared, (c) heap raised to 6 GB, (d) run outside the Bash sandbox, and (e) `fonts.googleapis.com`/`gstatic` returning fast 200/404. The hang is BEFORE any file compiles, so it is never caused by the diff under test. `npx tsc --noEmit` (full type-check, green) is the accepted correctness gate when the build won't converge; getting an actual `npm run build` to pass then needs Brian's own environment (fresh terminal / reboot) — don't burn more than ~2 attempts before surfacing it.

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

## setState functional updaters must be pure — no server actions inside them (2026-07-10)
`SuperSwitcher.toggleOpen` called a "use server" action (`getSandboxTeams`) inside a `setOpen((v) => ...)` updater. React executes functional updaters during the render/reconciliation phase, so the action's Router integration fired mid-render → "Cannot update a component (Router) while rendering a different component." The bug was latent for as long as the component existed and only surfaced when Phase 5 mounted the component twice. Rule: side effects (server actions, fetches, other setState) live in the event-handler body or an effect — key off the closure's committed value (`if (!open) load()`), never inside the updater.

## Multi-table plpgsql triggers: OLD.<field> is parse-time, not eval-time (2026-07-12)
A single trigger function shared across tables (notify_push_dispatch on messages + announcements) referenced `OLD.status` in a flat `IF a AND b AND OLD.status...` chain. plpgsql resolves record fields when the STATEMENT is first parsed per-table, not lazily on evaluation — short-circuiting does NOT protect you. On `messages` (no status column) every execution raised 42703, and the function's `EXCEPTION WHEN OTHERS` swallowed it → all message pushes silently dead while announcements worked. Found only by the rls-reviewer's Mode-2 queue-delta probe (insert message → expect 1 pg_net row, got 0).
**Rule:** in a trigger function that fires on multiple tables, any table-specific column reference must live inside a nested `IF TG_TABLE_NAME='<table>' THEN ... END IF;` block (statements inside an untaken branch are never parsed). And never trust `EXCEPTION WHEN OTHERS` + "it applied cleanly" — probe trigger side-effects (queue counts) per table after applying.

## Design components for their MOUNT, not the design system in the abstract (2026-07-12)
The push-subscribe card was built fully token-compliant (callout surface, mono eyebrow, serif title, plum primary) but at content-column scale — then mounted in the ~300px chat-list panel, where it rendered as a bulky 3-line-serif hero with the dismiss action wrapped out of view. Token compliance ≠ contextual fit.
**Rule:** when building a component, state its mount context (panel / content column / modal / mobile sheet) in the spec and size the register to it — a sidebar nudge is ListRow-scale (13-14px sans-medium title, sm buttons, no icon badges, no body copy), not a content-column callout. Reviewers can't catch this from source; the builder owns it.

## New env vars don't propagate to other session slots (2026-07-12)
`.env.local` is per-worktree and gitignored, so a feature that introduces env vars (e.g. push-v2's `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`) only gets them in the slot it was built in. Every other slot is silently broken for that feature — push showed "Couldn't turn on notifications — try again" in s3 because `subscribeToPush()` returns `missing-vapid-key` before ever prompting. `/catchup` syncs code, not env.
**Rule:** when a task adds an env var, copy it to the main checkout's `.env.local` AND every slot (`central-s1/2/3`) in the same task (plus Vercel for prod). When a feature works in one slot but errors in another, diff `.env.local` keys against the main checkout FIRST — `grep -o "^[A-Z_]*=" dir/.env.local | sort` per dir — before debugging code. Don't restart another session's dev server when copying; the keys load on its next natural restart.

## Serialize verification tracks that share the sandbox tenant (2026-07-12)
The full e2e gate ran while the rls-reviewer's Mode-2 probes were arranging rows in the same E2E Sandbox ministry — the suite flaked on polluted recipient lists, then passed 26/26 clean after the probes finished. **Rule:** DB-probe passes and e2e gate runs both use the sandbox; run them sequentially, never concurrently. A gate failure during a live probe pass is presumed collision — re-run after, before debugging anything.

## Capacitor iOS push: two silent killers (2026-07-12, device-debug session)
Native push failed silently twice on first real-device run, with zero errors anywhere:
1. **Origin mismatch disables the bridge.** `server.url` was the apex domain; prod 307s apex→www; Capacitor's bridge self-disables when the page origin ≠ configured origin → `window.Capacitor` absent → app falls back to web path → "notifications not supported." Rule: `server.url` must be the CANONICAL final origin (curl -sI the domain and follow the redirect before configuring).
2. **AppDelegate must forward APNs callbacks.** @capacitor/push-notifications requires manually adding `didRegisterForRemoteNotificationsWithDeviceToken` / `didFailToRegister...` forwarding to AppDelegate.swift (NotificationCenter posts). Without them, register() resolves fine, Apple issues the token, and it dies in the AppDelegate — no JS event, no error. The scaffold template does NOT include them.
Debug technique that found both: Safari Web Inspector on the Debug-build webview (Develop → device → app) + pasting probe JS against `Capacitor.Plugins.*` in the live console — no deploy cycle needed.
Also: dev builds carry SANDBOX APNs tokens; prod carries production tokens. APNS_ENV=sandbox on Vercel while the only users are dev builds; flip to production at TestFlight. **Superseded 2026-08-15:** it was still `sandbox` in production and every TestFlight token was pruned — see "Never delete a registration on an error the server might be causing" below.

## Auth guards: never gate on a timing heuristic with an unchecked cleanup (2026-07-12)
The "Google sign-in can't mint accounts" guard deleted fresh mints only when created_at < 60s, and never checked the deleteUser result. Real incident: mint at 23:03, silent delete failure, retry at 23:05 → older than 60s → admitted; the account then joined a real ministry via invite code. **Rules:** (1) auth legitimacy = durable markers (user_metadata stamp at signup, ministry linkage), never age heuristics — retries beat timers every time; (2) every service-role cleanup call gets its result checked and its failure logged loudly; (3) when an FK cascade is removed (profiles→auth.users, tombstone migration), audit every code path that relied on it (deleteUser stopped cascading the trigger-created profile → orphan per rejection).

## Slot dev-server 500 with "Module not found" = stale node_modules, not .next corruption (2026-07-14)
s3's dev server 500'd on `/` and the stop hook pattern-matched it to the usual corrupted-`.next` — but a fresh `.next` (the dev script wipes it on boot) still 500'd. The devlog showed `Module not found: Can't resolve '@capacitor/core'`: the Capacitor deps had landed on main (push-notifications work), and `session.sh` only ran `npm install` when `node_modules` was *absent*, so a reused slot's deps silently drifted behind main. (Now fixed: session.sh stamps a `package.json` hash into `node_modules/.package-json-hash` and refreshes deps when it changes; `/catchup` step 7 already covered mid-session resyncs.)
**Rules:**
- Before treating a slot 500 as cache corruption, read the devlog. `Module not found` for a package that IS in `package.json` means stale `node_modules` → `npm install --legacy-peer-deps` in that worktree, then restart dev. A cache-corruption 500 looks different (Turbopack panics, missing build-manifest/.sst).
- When restarting a slot's dev server manually, ALWAYS pass the slot port: `npm run dev -- -p <port>`. Bare `npm run dev` binds 3000 — the shared checkout's port — and leaves the slot dead while squatting on the wrong port.

## Xcode builds inside the iCloud-synced tree fail CodeSign with "detritus not allowed" (2026-07-14)
The repo lives under `~/Desktop` (iCloud-synced), and iCloud Drive stamps `com.apple.fileprovider.fpfs#P` / `com.apple.FinderInfo` xattrs onto files as it syncs — including Xcode build products. CodeSign then fails with `resource fork, Finder information, or similar detritus not allowed`. `xattr -cr` on the products is a LOSING RACE while sync is live: the first /sim build failed, the strip + rebuild failed again, because iCloud re-stamped between strip and sign.
**Rules:**
- Any Xcode/xcodebuild output directory must live OUTSIDE the synced tree: point DerivedData at `~/Library/Developer/...` (per-worktree, e.g. the `ios/DerivedData → ~/Library/Developer/CentralDerivedData-<worktree>` symlink /sim uses; gitignored).
- If CodeSign still hits detritus after relocating, strip the SOURCES once (`xattr -cr ios/App capacitor-shell`) and rebuild — source files sync rarely, so that strip sticks; product-side strips don't.
- Same hazard family as the iCloud eviction lesson: filesystem weirdness under ~/Desktop/Projects should always make you suspect iCloud first.

## verify.sh's pnpm parity check was silently converting node_modules (2026-07-14)

The "stale node_modules → Module not found 500" failures (§2026-07-14 above) have a root cause: verify.sh's lockfile-parity step ran a bare `pnpm install --frozen-lockfile`, which is a REAL install — it replaces the npm-managed node_modules layout with pnpm's symlink layout on every verify run, and the next `npm install` half-converts it back. Fix (shipped): the check now runs `pnpm install --frozen-lockfile --lockfile-only --ignore-scripts` on manifest COPIES in a temp dir — validates resolution both directions in ~0.5s and writes zero files to the worktree. General rule: never point a second package manager at a live node_modules "just to check" — install-family commands mutate unless proven otherwise.

## E2E harness targets E2E_PORT, not PORT (2026-07-15)

`playwright.config.ts` builds its baseURL from `process.env.E2E_PORT` (default **3001**). Running `PORT=3002 npx playwright test` silently tests ANOTHER SLOT's dev server — old code, wrong tenant — and failures look like your changes didn't apply (SSR curl shows new code, browser shows old). Always invoke as `E2E_PORT=<slot port> npx playwright test …` (verify.sh --port sets it for you). Symptom to recognize: assertions that the tester just passed start failing with page snapshots showing pre-change UI.

## supabase-js multi-row insert nulls omitted columns (2026-07-15)

A multi-row `.insert([...])` unifies keys across rows and sends explicit `null` for any key missing from a given row — Postgres column DEFAULTs never apply, so a NOT NULL DEFAULT false column (e.g. `announcements.show_attendees`) fails with 23502. Set such columns explicitly on EVERY row of a batch insert (or insert row-by-row).

## Auto-chat triggers defeat count-based seed idempotence (2026-07-15)

Seeding a fresh ministry fires the auto-chat machinery (`automation_settings.auto_central_chat`) — a "<Ministry> Chat" group appears on its own. A seeder guard like `if (!groupCount)` then skips ALL custom seeding on re-run while reporting success. Guard find-or-create per named row, never "any rows exist" (scripts/seed-demo.mjs does this now).
## Fixed overlays trapped under the pill nav — animation fill-mode was the root cause (2026-07-15)
`.content-enter`'s `animation-fill-mode: both` kept every tab wrapper a permanent containing block/stacking context, so `fixed inset-0` overlays inside tabs (CreateChatScreen, mobile compose) sized to the content box and stacked BELOW the z-50 floating nav despite higher z-index. Fix: `backwards` fill (zero visual delta) in globals.css. Pattern: when a `fixed` element renders in the wrong place/size or loses a z-index fight it should win, hunt for `transform`/`filter`/`animation-fill-mode` on ancestors before touching z values. Also ratified in the same rework: full-screen composers must hide the BottomNav via home-app's `composerOpen` state (mobile spec §2.2), and the dark "N" chip in dev screenshots is Next.js's dev-mode indicator, not app UI.

## Native OAuth bypasses /auth/callback — auth gates covering mobile belong in proxy.ts (2026-07-15)
Web OAuth (`signInWithOAuth`) round-trips through `/auth/callback`, but the native shell's Apple/Google sign-in uses `supabase.auth.signInWithIdToken`, which **never touches `/auth/callback`** (routing is `routeAfterNativeSignIn()` → `window.location.assign`). So a gate placed only in the callback silently misses every native mobile sign-in. `proxy.ts` is the one chokepoint every request passes in both the browser AND the native WebView — durable auth/profile gates go there. (Built the OAuth onboarding gate — gender + graduation_year — here for exactly this reason.)
- **Verify the trigger/schema against the LIVE DB, not migration files.** Recon claimed `handle_new_user()` drops gender because it read a stale `supabase/profile_trigger_migration.sql`. The DEPLOYED function (via `pg_get_functiondef`) does persist gender/graduation_year/grade from signup metadata. Email signup was never broken; only OAuth (no metadata) leaves them NULL. Always `pg_get_functiondef` / `information_schema` the live object before reasoning about a trigger or column.
- **A new proxy completeness-gate has three footguns, all hit here:** (1) it must let its OWN target route (`/complete-profile`) through the middleware BEFORE the downstream no-ministry/status branches, or those redirect it away and it loops forever (the exact failure for a fresh no-ministry member — the primary case); (2) a `?next` redirect param must be **origin-resolved** (`new URL(raw, origin)`, reject if origin differs) — a `startsWith("/") && !startsWith("//")` check is bypassed by `/\evil.com`, `/\/evil.com`, `/%09/evil.com` (WHATWG parser reads them as protocol-relative); (3) the gate's `NextResponse.redirect` must copy `supabaseResponse.cookies` forward (it fires on the first post-OAuth request where the session is refreshed) — mirror the no-profile-teardown branch.
- **Adding a member-tier profile invariant breaks the shared E2E sandbox member.** The gate redirected the sandbox member (NULL gender/grad) to /complete-profile, breaking `auth.setup.ts` + all 93 memberState tests. Seed the member COMPLETE (`scripts/seed-e2e.mjs` now sets gender + graduation_year) so a fresh re-seed stays green — a durable DB row alone isn't enough if the seed script can recreate the gap.

## A composite FK silently breaks PostgREST embed hints — build stays green (2026-07-19)
Replacing a standalone single-column FK (`fund_id → finance_funds(id)`) with a COMPOSITE one (`(fund_id, ministry_id) → finance_funds(id, ministry_id)`, added for same-tenant integrity) means PostgREST can no longer resolve the embed hint `finance_funds!fund_id(...)` — the join silently returns NO related data, `npm run build` + `tsc` stay green, and the feature is dead only at runtime (allocations never render, no action buttons). Caught by the click-through, invisible to the build. Two takeaways: (1) when you add a same-tenant composite FK, audit every `.select("...table!col(...)")` embed that referenced the old single-column FK; (2) prefer the codebase's established **separate `.in("id", ids)` query + `Map`** pattern (already used for team/category name resolution in `receipts.ts`) over PostgREST embeds — it's immune to FK-shape changes and constraint renames. This is exactly why the loop's functional click-through exists: a green build proved nothing here.

## Filtered realtime DELETE events need REPLICA IDENTITY FULL (2026-07-19)
A `postgres_changes` subscription with a column filter (`group_id=eq.X`) only matches DELETE events if the filter column is in the old-row WAL image — and default replica identity ships ONLY the PK. Symptom: INSERTs arrive live, DELETEs silently vanish for filtered subscribers (reaction removal, run-sheet block deletion). Bit twice in one migration (message_reactions, event_blocks). Rule: any table whose realtime consumer filters on a non-PK column AND deletes rows needs `ALTER TABLE … REPLICA IDENTITY FULL` (cheap for small rows; weigh WAL volume for fat/hot-update tables).
**Contested 2026-08-18** (folded 2026-10-24): a live probe on `group_members` (already `REPLICA IDENTITY FULL`) got a PK-only DELETE payload AND a `user_id`-filtered subscription still received it. See "Realtime DELETE payloads are PK-only" in the inbox fold below; re-probe before relying on either entry.

## Explorer agents cannot write their findings files (2026-07-19)
The `explorer` subagent is Read/Grep/Glob only — a dispatch prompt telling it to "write findings to X.md" fails silently; the content comes back only in its final return message. Either ask explorers for inline-return findings explicitly, or dispatch a general-purpose agent when a findings FILE is the deliverable. (The rls-reviewer/tester have Bash and can write; the reconciler/enforcer cannot.)
**2026-08-01 (folded 2026-10-24):** this contradicts `orchestration/orchestrated.md` §Artifact protocol, which tells EVERY agent to write its output file — a `reconciler` told to write `manifest.md` dumped the whole manifest into its reply instead. Until the protocol is amended: dispatch read-only agents (`explorer`, `reconciler`, `enforcer`) for an inline return and persist the file yourself. (Alternative considered: a Write grant scoped to `.claude/task-context/**`, which weakens the read-only guarantee.)

## Verify "already fixed" claims against the live publication, not migration greps (2026-07-19)
The realtime-egress explorer flagged small_groups/dgl_assignments as "probably not published" from grepping migration .sql files — but the live `pg_publication_tables` showed they WERE (added via MCP, no local file). The same live check exposed the real gap: event_blocks subscribed in code but absent from the publication. Publication/trigger/function state applied via MCP leaves no repo artifact — always query the live DB.

## PostgREST embeds break silently when a second FK appears between two tables (2026-07-19)
`profiles → ministries(status)` embed worked for months, then `ministries.archive_requested_by` added a second FK between the same tables — every unqualified embed now throws PGRST201 (ambiguous). The failure surfaced in NEW code (proxy.ts routing query) written against the old mental model. Rules: always FK-qualify embeds on tables with multiple relationships (`ministries!profiles_ministry_id_fkey(status)`), and never let a routing/auth-path query error fall through to a redirect — degrade to separate queries; an infrastructure error must not route a valid user away.

## Async subscribe paths need a generation guard (2026-07-19)
Any `await` between "check topic map" and "create+subscribe channel" (e.g. auth before joining a private realtime channel) lets StrictMode double-mount or fast unmount/remount interleave → two live channels on one topic → every event delivered twice. Pattern: store the entry (or pending promise) in the map SYNCHRONOUSLY before awaiting, re-check `map.get(key) === myEntry` after every await, and tear down anything a stale continuation created. Dedup by event id at the handler as defense-in-depth.

## E2E lane-2 tenant has only the base seed — full-suite gates on s2 fail feature specs (2026-07-21)
Port 3002 (slot s2) auto-selects E2E lane 2 (`e2e/load-env.ts` swaps to `E2E Sandbox 2` / `e2e2.*` users). But `scripts/seed-e2e.mjs LANE=2` seeds only the tenant + two users — every HAND-seeded feature fixture (countdown "Summer Retreat 2026", meeting-notes, finance splits, season rollover, compliance…) lives in lane 1 only. So `verify.sh --e2e` on s2 fails ~16 specs on missing fixtures regardless of the diff. Until lane 2 is fixture-cloned, verify the changed surface with targeted specs under `E2E_LANE=1 E2E_PORT=3002`; treat lane-2 full-suite failures as infra, not regression — but confirm via the failure screenshot (tenant name in the breadcrumb) before dismissing anything.

## E2E fixtures rot with the calendar and with spec crashes — repair before re-diagnosing (2026-07-21)
Two independent lane-1 fixture corruptions produced failures that looked like code regressions: (1) a prior run of the leadership-editing spec died mid-flight and left `e2e.admin`'s President `role_id` NULL on Student Org Board → the workspace fell out of "Your workspaces" and every deep-link spec bounced to the picker; (2) the countdown fixture's fired-but-not-overdue invariant ("Finalize transportation": ledger-fired + incomplete + due ≥ today) expired as real time passed its due date — overdue outranks fired in `badgeFor`, so the spec fails from Jul 24 again without a re-date. When a previously-green spec fails at its ENTRY point, check the failure screenshot + fixture rows in the live DB before suspecting the diff. Durable fix (follow-up): a date-relative countdown reseed script instead of fixed dates.

## Background agents trip the 600s stream watchdog on long tool waits — resume, don't respawn (2026-07-21)
Two different agents (tester waiting on a full verify.sh build, engineer mid-large-refactor) were killed by the harness "no progress for 600s" stream watchdog while healthy. Their transcripts and working-tree edits survive; `SendMessage` to the same agent id resumes with full context — a respawn would re-ingest everything and risk double-applying edits. Pattern: on a watchdog "stalled" notification, send a resume message naming where they left off (their final line tells you) and have them re-check `git status` / their command's completion before continuing.

## App-layer role gate and RLS role gate can silently diverge — verify live pg_policies, never trust repo migration copies (2026-07-27)
Church-chat management was gated in the APP by `isChatManageRole` (`CHAT_MANAGE_ROLES` — pastor EXCLUDED), while the LIVE RLS gated the same writes via `auth_is_admin_or_leader()` which had been widened (by an uncommitted MCP migration) to `admin/leader/deacon/elder/pastor` — the repo copy in `supabase/multi_tenant_migration.sql` still read `('admin','leader')` and was months stale. So the app was STRICTER than the DB (pastor could write via direct API but the UI hid it), and `groups` UPDATE was NOT creator-only as the repo migration claimed — live it was already `created_by OR (is_group_member AND (non-church OR auth_is_admin_or_leader()))`. Lessons: (1) when changing a permission gate, pull the live `pg_policies` qual/with_check AND `pg_get_functiondef` of every helper before designing — the repo `supabase/*.sql` files are an unreliable snapshot for anything applied via MCP; (2) app gate and RLS must be checked as a PAIR — a change to one without the other is the Convention #8/#9 divergence the rls-reviewer exists to catch; (3) the engineer subagent has NO Supabase MCP tools — the main session must apply migrations itself (an engineer told to "apply via MCP" cannot, and may try to scrape credentials to work around it — a flagged failure mode; give it only the app edits, apply DDL yourself).

## A native surface held open "until JS releases it" must be released globally, never per-route (2026-07-30)
`capacitor.config.ts` sets `launchAutoHide: false`, so the plum iOS splash stays up until the web layer calls `SplashScreen.hide()`. That call lived only inside `EntrySplash`, which mounts on `/home` and `/login` — so every OTHER cold-launch destination hung on the static splash forever: `/ministries` (no ministry yet), `/complete-profile`, `/pending`, `/pick-ministry`, `/onboarding`, `/register-ministry`, `/admin`. The stranded routes are exactly the NEW-USER paths, so it would have hit the launch cohort hardest while being invisible to every signed-in web test — and invisible in the repro too, since the friend's account landed on `/home` and worked. Rules: (1) any "hold a native surface until JS releases it" pattern belongs in the ROOT layout, plus an unconditional time-based backstop so an orphaned claim can't re-strand it; (2) when a first-run animation needs to own the handoff, have it CLAIM the release synchronously and let the global net defer a macrotask and back off — don't move the release into the animation; (3) gate native-only work on the UA **or** the `window.Capacitor` global, never UA alone, so a detection miss degrades to a wasted import rather than a hung app. Guard: `e2e/native-splash-release.spec.ts` (fails on `/ministries` + `/signup` with the fix removed). Related: the account-specific trigger was `proxy.ts`'s founder-email branch force-routing `brianjeong13@gmail.com` to `/admin` — a route-level redirect can strand a native user on a surface that never releases the splash, so audit new forced redirects for splash-release coverage.

## Supabase email OTP: the template variable IS the switch, and three settings must agree (2026-07-30)
"Send a code instead of a confirmation link" is 100% Supabase auth CONFIG — zero app code. The template variable alone decides it: `{{ .ConfirmationURL }}` renders a link, `{{ .Token }}` renders the code. The app side (`supabase.auth.verifyOtp({ email, token, type: "signup" })`) can be complete and correct while every email still ships a link, because the client never influences which template variable renders. Three settings must agree or it silently half-works:
- **`mailer_templates_confirmation_content`** — must contain `{{ .Token }}` and NOT `{{ .ConfirmationURL }}`.
- **`mailer_otp_length`** — defaults to **8**, but a UI built for six digits rejects the real code client-side before `verifyOtp` is ever called. Fixing only the template produces "the code is always wrong" and looks like a template bug.
- **`rate_limit_email_sent`** — defaults to **2/hour project-wide** on the built-in sender (`noreply@mail.app.supabase.io`, `smtp_host = null`). Not a production sender; a launch cohort silently gets no email at all. Custom SMTP is a prerequisite for any real signup volume, and a "no email arrived" test result is this limit far more often than a config error.
Management API gotchas (`PATCH /v1/projects/{ref}/config/auth`): subject keys are `mailer_subjects_confirmation`, NOT the `mailer_templates_confirmation_*` prefix the content key uses — **an unknown key is accepted and silently ignored, returning 200**, so always re-GET and assert the field actually changed rather than trusting the PATCH status. `api.supabase.com` also 502s transiently via Cloudflare; re-GET to check whether a failed write partially landed before retrying. Verify with a GET assertion (`has {{ .Token }} == true`, `has ConfirmationURL == false`), since nothing in the repo reflects any of this state.

## A populated flag with zero readers looks "fixed" in the dashboard and is absent from the product (2026-07-30)
`ministries.hidden_from_discovery` existed AND was correctly populated (true on all five test tenants, false on the real ones) — but `grep -rn hidden_from_discovery app lib components` returned NOTHING. No query read it, so setting the flags changed nothing and the test tenants stayed publicly listed. Before adding a column or inventing a filter, **grep the existing column list for a signal that already exists** (`select=*&limit=1` over PostgREST dumps every column) — a schema change was one step from being proposed for a column that was already there. Corollary: when a flag "doesn't work", check for readers BEFORE checking its values.
Second, sharper half: the near-miss fix gated discovery on `is_sandbox`, which hid all five test tenants and looked correct — but `is_sandbox` answers "may the super account write-as here", and it is TRUE of Central, a REAL ministry. The filter silently delisted a real church. **When two boolean flags overlap on most rows, the rows where they DISAGREE are the whole test** — and a negative-only assertion ("no test tenant is listed") passes happily while the positive case is broken. Guards on a filter must assert BOTH directions: the things that must be absent AND the things that must remain. `e2e/ministry-discovery-sandbox.spec.ts` does this.
Third: `getPublicMinistries` ran on the SERVICE-ROLE client, so RLS was not a backstop — the app-layer `.eq("status","active")` was the ONLY boundary, and its name implied a public/private filter it never applied. Treat every service-role read path as unguarded by definition; the filter in the action IS the security boundary, and a reassuring function name is not evidence one exists.

## `vercel env pull` writes THROUGH the shared .env.local symlink and destroys every slot's secrets (2026-07-30)
`.env.local` in each slot worktree is a SYMLINK to `../central/.env.local` (s1 and s2 both; s3 and central-main hold independent real-file copies). Any command that writes `.env.local` therefore overwrites the SHARED file for every session at once. `vercel integration add` does this SILENTLY — it runs an implicit env pull (`"envPulled": true` in its JSON result) with no prompt — replacing 16 keys with the 5 that happened to exist in Vercel's *development* environment. Pass **`--no-env-pull`** on any `vercel integration add` run from a slot, and never run a bare `vercel env pull` in a worktree.
**Vercel is NOT a backup.** `vercel env pull` returns `""` for every variable flagged *sensitive* — the CLI cannot decrypt them, and neither can the dashboard. Of 16 keys, only 4 came back with values (the two `NEXT_PUBLIC_SUPABASE_*`, plus the just-created `RESEND_*`); `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, every `VAPID_*`/`APNS_*` and `PUSH_WEBHOOK_SECRET` came back empty. Recovery came from three places instead: `central-s3/.env.local` (a stale but intact real-file copy — the reason slot copies should NOT all be symlinks), the **Supabase Management API** `/v1/projects/{ref}/api-keys` (authoritative anon + service_role, better than any file copy), and the **live DB** for the `*_LANE2` e2e identity values (derivable from the `E2E Sandbox 2` tenant + `e2e2.*` users).
Two diagnostic traps hit on the way: (1) `grep -o "^[A-Z_]*="` silently MISSES any key containing a digit — it hid `E2E_*` and every `*_LANE2` var, making the loss look smaller than it was; use `[A-Z_0-9]*`. (2) Production was never affected — Vercel's stored values were intact the whole time and only the local file died, so the blast radius was local dev + e2e, never users. Establish that boundary before escalating.

## /sim: a slot's DerivedData can pin a dead worktree path, and `cap sync` rewrites TRACKED SPM files (2026-07-30)
Two distinct /sim failures in one run, both worth pre-empting:

**(a) Stale DerivedData pins a path that no longer exists.** The s1 build failed with ~20 `error: There is no XCFramework found at '…/central-s1 2/ios/DerivedData/…'` — a `central-s1 2` directory (an old iCloud conflict copy, the same incident that left `central-s1-gutted-icloud` behind) that is long gone. 204 files under `~/Library/Developer/CentralDerivedData-central-s1` still referenced it, including SPM's `SourcePackages/workspace-state.json`, so every package resolved to a nonexistent root. The errors name XCFrameworks and read like a dependency/plugin problem; they are not. Fix: `rm -rf ~/Library/Developer/CentralDerivedData-<slot>` (pure build cache, outside the repo, gitignored, per-slot — rebuild took 50s). Tell: the error path contains a directory that doesn't exist on disk — always `ls -d` it before believing the message. Sibling of the iCloud CodeSign lesson (§2026-07-14): under `~/Desktop`, suspect iCloud path damage first.

**(b) `cap sync ios` mutates two tracked files, not just `capacitor.config.ts`.** Because this machine's `node_modules` is a pnpm layout, sync rewrote `ios/App/CapApp-SPM/Package.swift` to `node_modules/.pnpm/@capacitor+app@8.1.0_…/…` paths and downgraded `capacitor-swift-pm` 8.4.2 → 8.4.1 in both `Package.swift` and `App.xcodeproj/…/Package.resolved`. Committing that would break any checkout without the identical pnpm store. The /sim skill only warns about `capacitor.config.ts`, so this slips through. **Rule: after any /sim run, `git status` must show ONLY `capacitor.config.ts` modified — `git checkout -- ios/App/CapApp-SPM/Package.swift ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` otherwise.** It recurs on every sync; reverting doesn't break the already-installed sim build.

## Ministry-exit paths must clean up group_members, or departed members render as "Unknown" (2026-07-27)
A member showing as "Unknown" in a chat's roster was an orphaned `group_members` row: the three ministry-exit actions in `app/actions/ministry.ts` (`removeMember`, `excommunicateMember`, `selfLeaveMinistry`) nulled `profiles.ministry_id` + deleted `user_ministries` but NEVER removed the user's `group_members` rows. Once `ministry_id` is null the roster's `group_members → profiles` join is RLS-invisible → `p?.name ?? "Unknown"`. The chat code already ASSUMED departed users are out of `group_members` (chats-tab.tsx: "non-roster senders (e.g. departed members no longer in group_members)"), so the exit paths were simply incomplete. Fix: a shared `removeUserFromMinistryChats(admin, userId, ministryId)` helper (fetch the ministry's group ids, delete that user's memberships) called from all three exit paths, plus a one-time cleanup (`DELETE group_members WHERE user's profile.ministry_id IS NULL` — a user in no ministry must be in no ministry chat). Message history is preserved (messages.sender_id is independent; `ministry_departures` drives the "left" tag). Rule: when a user leaves/loses a scope, audit EVERY membership/junction table for that scope — not just the primary FK. Keep the parallel exit paths in sync via a shared helper, never copy-paste the cleanup.

## A modal bound to parent-level state while the UI renders a locally-drilled child writes the WRONG ROW (2026-07-30)
`StudentOrgTeamHome` body-swaps a drilled sub-event into the SAME `SubpageShell` via local state `planningChild`, rendering `activeEvent = planningChild ?? planningEvent`. But the Edit button forwarded a bare `onEditEvent` prop up to `PlanTab`, whose modal was bound to `existing={studentOrgPlanningEvent}` — the PARENT. So editing a sub-event's time wrote the parent's row: the child never changed (the timeline kept rendering the old time, looking like a cache bug) while the parent silently moved. It survived a hard refresh because the DATA was wrong, not the cache. Two tells that separate this class from staleness: (1) the wrong value persists through a reload; (2) the bug is PATH-DEPENDENT — opening the same child from the timeline's own disclosure row worked, because that path made the child *be* the parent-level state. Rule: when a surface can render either a parent or a locally-drilled child, the edit affordance must bind to the SAME value the surface renders (`activeEvent`), never to the state one level up. Cheapest correct shape is usually to move the modal DOWN to where the drilled state lives — it deletes prop wiring instead of adding it, and both viewports inherit the affordance with no props to forget.

## `team_id` on `calendar_events` is a WRITE gate, not a display field — a null makes the row uneditable by planners (2026-07-30)
`SubEventsTab` minted sub-events with `team_id = null`. `calendar_events_update` / `_insert` gate a non-admin `can_plan_events` holder on `team_members.team_id = calendar_events.team_id`, and `= NULL` never matches — so the student-org president persona could neither edit NOR create sub-events, getting a silent 0-row PATCH (surfacing as a raw PGRST116 "cannot coerce…" string) and a `42501` on insert. Two compounding traps: (1) the stamp was a SILENT NO-OP until `team_id` was added to the `CalendarEvent` type AND to all four `.select(...)` lists — the field was dropped before reaching the insert, so the fix "worked" while changing nothing; verify a stamp by reading the row back, never by reading the code. (2) `team_id` also scopes READS through the client filter `or(team_id.eq.<scope>, team_id.is.null)` — a null child was matching EVERY team's scope, i.e. leaking onto other teams' calendars, so stamping both fixed writes and closed a read leak. When a column appears in an RLS predicate, treat every write path that omits it as a permission bug.

## SWR keys that embed a scope need prefix-matched invalidation, not per-key mutate (2026-07-30)
The calendar cache is keyed `["calendar-events", ministryId, teamId ?? "all"]`, and the app mounts several scopes at once (a team scope plus `"all"` in `MinistryCalendar`). A per-key `mutateCal()` refreshes only the scope you happen to be looking at, so an edit, delete, or season-copy left every SIBLING scope serving the stale row — with `revalidateOnFocus: false` globally, that persists until remount. Fix is a prefix-matched invalidator (`globalMutate((key) => Array.isArray(key) && key[0] === "calendar-events" && key[1] === ministryId)`) as the SINGLE invalidation path, called on success AND failure branches. Watch for the half-migration: converting only the failure branch (or only the modal, leaving delete/season-start on per-key mutate) reproduces the original symptom in the paths you didn't convert — verification caught exactly that twice in one task.

## A retry that re-writes stale modal state can undo the work the previous attempt landed (2026-07-30)
Two variants hit in one task, same root: modal state seeded at MOUNT is written back on a LATER save, after the DB has moved on. (1) `plan_start_date`/`crunch_date` are seeded by an ASYNC effect but were written unconditionally as `value || null` — saving before the fetch landed silently NULLed both columns, with no visible field for the user to notice. (2) After a successful date shift, a same-session retry rewrote the PRE-shift plan window over the shifted one while tasks stayed shifted — re-creating the very inconsistency the shift existed to prevent. Rules: never write a null you didn't get from the user (gate on a `seeded` flag and OMIT the column when unseeded, rather than writing null); and after any successful write, re-seed the modal's own state from what you just wrote so a second save is a no-op instead of a revert. Also: a guard ref that marks work "done" must advance AFTER the work succeeds, and partial failures need per-row owed-tracking so a re-press converges instead of double-applying to rows that already landed.

---

# Merged from the repo-root `lessons.md` (2026-07-31)

Two lessons files existed: this one (which CLAUDE.md and every skill point at) and an
orphaned `lessons.md` at the repo root. Nothing referenced the root file. Its contents are
folded in below verbatim; the root file is deleted.

**Note on the 2026-07-18 datetime entry below: it is SUPERSEDED.** The store/display
disagreement it describes as a "KNOWN BUG to fix in a dedicated pass" was fixed on
2026-07-31 — see the timezone lessons above. Seed scripts no longer hand-roll an ET offset;
they consume `lib/tz.ts` via `scripts/lib/app-tz.mjs`. Kept for the history of how the bug
was first noticed.

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

---

## One timestamptz column can hold two opposite conventions — and no query can separate them (2026-07-31)
`calendar_events.start_date` had two producers writing incompatible meanings into the same column: `AddEventModal` wrote `${ymd}T${hhmm}:00+00:00` (a ministry wall clock mislabeled UTC) while the seed scripts wrote true Eastern instants. ~40 display sites read it as an instant, so a modal-created 7pm event rendered 3pm and the modal read a seeded noon event back as 4pm. **A modal event typed 4:00 PM and a seeded noon-ET event are byte-identical** — same bytes, opposite meaning — so there is no repair query and no single shift that fixes the column. Diagnostic lessons: (1) when a display and an editor disagree about the SAME row, suspect two conventions before suspecting a cache; (2) the polarity of "which one is wrong" flips per row depending on the producer, which is the tell; (3) the fix is a single conversion layer every read and write routes through, plus re-seeding rather than repairing — Brian ratified re-seed precisely because heuristic repair would silently mis-shift the ambiguous rows. Check whether real tenants hold any of the affected data before pricing the migration: here all 141 rows were sandbox/test and the only real tenant had zero, which made a schema change nearly free.

## `NOT VALID` does not make a CHECK constraint safe to add early (2026-07-31)
`NOT VALID` skips only the scan of EXISTING rows; the constraint still enforces on every INSERT and UPDATE from the instant it lands — including updates that never touch the constrained columns. So a CHECK cannot be applied until every writer, **deployed to production**, populates the columns. The all-day invariant on `calendar_events` was correctly held back through six phases: zero violating rows and all app code fixed was still not enough, because the branch was unmerged and `main` — which production runs — had zero references to the new columns. Applying it would have failed every all-day event creation in production with `23514`. Sequence for adding a CHECK to a live table: fix all writers → merge → deploy → verify zero violations → add `NOT VALID` → `VALIDATE`.

## A pg_cron entry-point function is not automatically private (2026-07-31)
Seven SECURITY DEFINER cron functions (`run_sheet_tick`, `grade_bump_all_ministries`, and five more) carried the default `EXECUTE` grant to `PUBLIC`/`anon`/`authenticated` and are routed by PostgREST at `/rest/v1/rpc/<name>`. The anon key ships in the public client bundle, so they were internet-callable — one fires push notifications platform-wide, another mutates every ministry's grade data. The only thing limiting the blast radius was an incidental 9-10am time gate inside the function. Rules: (1) a function invoked ONLY by pg_cron should have `EXECUTE` revoked from every client role — cron runs as the function owner and is unaffected; (2) do the revoke BEFORE any rewrite that removes an incidental cap; (3) do NOT revoke the RLS helper functions (`auth_*`, `is_*`, `group_*`) — policies execute as the querying role and break without them, so enumerate carefully rather than revoking by pattern; (4) always `CREATE OR REPLACE`, never `DROP`+`CREATE` — a drop resets `proacl` and silently re-exposes what you just revoked.

## A tenant boundary held up only by `RETURNING` is not a tenant boundary (2026-07-31)
`calendar_events`' INSERT/UPDATE/DELETE policies had no `ministry_id` term; only the SELECT policy did. Because PostgREST's default `Prefer: return=representation` makes writes return the row, the SELECT policy filtered it and the write appeared to be denied — but **the same statement without `RETURNING` succeeded cross-tenant**. Probe every write policy in both shapes; a denial that depends on the response shape is an accident, not a policy. Related: the fix must go on the right clause — `USING` for DELETE, `WITH CHECK` for INSERT, and BOTH for UPDATE (the `WITH CHECK` half is what stops re-homing an existing row into another tenant, a case neither review pass had thought to probe until the fix made it obvious).

## Date-only columns are not timezone problems — converting them creates one (2026-07-31)
A cluster of "previous day" bugs all came from `new Date(ymd)` or `localDate.toISOString().split("T")[0]` applied to DATE columns (`purchase_date`, `entry_date`, `meeting_notes.date`, `due_date`). A DATE holds a calendar day with no instant and no zone; the bug is code round-tripping it through a `Date` and picking up an offset. The fix is to keep it a plain YMD string — **not** to convert it through a timezone, which would introduce the same bug in the opposite direction. Only `timestamptz` gets zone conversion. Two directional traps worth knowing: `new Date("2026-07-15")` parses as UTC midnight and renders as the PREVIOUS day west of UTC, while `new Date().toISOString()` yields TOMORROW's date east of ~8pm local — and a bug that fires ahead of UTC (a month-range query in Tokyo) may not reproduce in Eastern at all, so verify the direction before claiming a mechanism.

---

# Folded from `tasks/lessons/inbox/` (2026-10-24)

115 inbox lessons (2026-07-31 → 2026-09-16), grouped by subsystem rather than strictly by
date, compressed to the rule + the one-line why + the specifics a fresh session needs.
Duplicates were merged into one entry (sources listed as dates); lessons that extend an
older canon entry were merged into that entry above instead. The full war stories are in
git history (`git log --diff-filter=D -- tasks/lessons/inbox/`).

## Database — grants and function ACLs

### Supabase grants EXECUTE to `anon` directly — `revoke … from public` removes nothing (2026-08-15, 08-14, 08-19)
`ALTER DEFAULT PRIVILEGES` gives every new function in `public` direct grants to `anon`,
`authenticated`, `service_role`; PUBLIC is a separate grantee. So `revoke … from public`
leaves `anon=X` in place and raises no error. Same for any **DROP + CREATE** (needed to change
a return type or add a param): the ACL resets to the default, re-granting `anon` even if you
restored the grants you saw. Rule: revoke from the NAMED roles
(`revoke all on function f(...) from public, anon, authenticated, service_role;` then grant
only what a call site needs), capture `proacl` before, and assert
`has_function_privilege('anon', …) = false` after. A revoke that removes nothing is silent, so
the assertion is the only evidence. Look at a nearby hardened function (`get_chat_list`:
`{postgres, authenticated, service_role}`) for the target shape. Granting an `auth.uid()`-keyed
INVOKER function to `service_role` turns a loud 42501 into a silent empty result.
- **Dangerous shape:** SECURITY DEFINER + an argument naming the tenant. `create_ministry_auto_chats(uuid,…)`
  was an anon-callable cross-tenant write; revoked to `{postgres, service_role}`.
- **Still open (2026-08-15):** ~12 read-only DEFINER helpers (`is_group_member`, `is_ministry_member`,
  `group_ministry_id`, …) are anon-executable — an unauthenticated membership oracle. Some may be
  needed by public surfaces; needs its own task with an rls-reviewer pass, not a bulk revoke.

### Adding a defaulted param needs DROP + CREATE, in one transaction (2026-08-14)
`CREATE OR REPLACE f(a,b,c DEFAULT …)` doesn't replace `f(a,b)` — it overloads it, and a
2-arg named call then matches both → `function is not unique` (this broke iOS push).
`DROP FUNCTION f(text,text); CREATE …` in one transaction, then fix the ACL (entry above).
Also grep `pg_constraint` for enum-ish values when adding one: `push_subscriptions_*_check`
hard-coded `ios-native` and only a live INSERT probe found them.

### A column-level REVOKE is a no-op under a table-level grant (2026-08-03)
`REVOKE UPDATE (col) ON t` can't subtract from a table-level UPDATE grant (Supabase's default).
Check `information_schema.role_table_grants` first; if UPDATE is there, revoke table-level and
`GRANT UPDATE (<every column that stays writable>)`. Any column added later must join that
list or it becomes silently unwritable. Verify with `has_column_privilege`, never by the DDL
succeeding. (Same mechanism as the `ministries`/`group_members` column-grant trap in CLAUDE.md.)

### `search_path` on SECURITY DEFINER helpers: `public, pg_temp` — not `''`, not bare `public` (2026-08-06)
CLAUDE.md #9 carries the rule; the two traps behind it: (1) a callee with no pin of its own
inherits the CALLER's path, so pinning a new helper to `''` broke an unpinned
`auth_is_admin_or_leader()` (`42P01 profiles does not exist`) — check callees' `proconfig`
first; (2) bare `public` still lets a planted `pg_temp.profiles` shadow the real table (proven
live; worst case is tenant relocation via `auth_ministry_id()`). `''` is fine only with a fully
qualified body that calls nothing (`event_plan_ministry_id()`). Pinning a previously unpinned
function can drop `extensions` → use `public, extensions, pg_temp`. The path also flows into
unpinned triggers your writes fire. Test a helper inside a real policy evaluation, with a
negative control that shows the attack working first.

## Database — RLS policy shapes

### An UPDATE policy without WITH CHECK lets a row be turned into anything (2026-08-06)
Missing WITH CHECK defaults to USING. `group_members` UPDATE pinned only `user_id`, so a
member could `SET group_id = <any group>` and read that chat (6,198 cross-ministry messages
proven readable). On any `FOR UPDATE`, ask what the row can become: pin the access-granting
FK (`group_id`, `event_plan_id`, `team_id`, `ministry_id`) in WITH CHECK AND restrict UPDATE
with a column grant. See also the `RETURNING` entry above. **Open (2026-08-06):** `event_tasks`,
`event_roles`, `event_blocks`, `event_notes` UPDATE policies had no tenant predicate — held only
by PostgREST rejecting unfiltered UPDATEs.

### A storage policy whose only predicate is `bucket_id` allows anyone signed in (2026-08-16)
`bucket_id` is a namespace selector, not an authorization check (`worship_charts_delete` let any
user of any ministry delete every chart). Permissive policies OR, so the fix must `DROP POLICY`
the old one by name. An inline subquery in a storage policy runs as the caller under the other
table's RLS — an invisible coupling; use a SECURITY DEFINER helper that takes the EXTRACTED
path segment as text (a pinned path can't resolve `storage.foldername` → 42883). Any bucket
policy that doesn't mention `auth_ministry_id()` or an ownership lookup is worth opening.
(2026-08-19 live read: `chat-attachments` and `devotionals` INSERT were already scoped;
`bible-study` was the open one.)

### AND does not short-circuit in a policy — guard a cast with CASE (2026-08-16)
Postgres doesn't define AND evaluation order, so `seg ~ '<uuid re>' AND f(seg::uuid)` can raise
22P02 → a 500 instead of a clean denial. Write `f((CASE WHEN <guard> THEN seg END)::uuid, …)`.
Applies to any `::uuid`/`::int`/`::timestamptz` in a policy or CHECK. A denial that arrives as a
500 is not a working policy. **Open:** `chat_topic_members_read` on `messages` used the
unguarded form.

### Widening a CHECK can disarm a guard in a function you never touched (2026-08-15)
Relaxing `push_subscriptions_keys_check` for `android-native` let the WEB claim
(`claim_push_endpoint`) write forged native rows. A CHECK that enumerates one domain
(`platform`) while gating columns of another is an authorization rule in disguise. Before
widening or dropping a CHECK, grep every WRITER of the table and probe each against the new
constraint; move the invariant into the function that owns it. When two lanes share a table,
partition the key namespace too (`^https://` for web endpoints), not just the discriminator.

### A CHECK the deployed code would violate is a live outage the moment it applies (2026-08-06)
Migrations apply immediately; code lands at deploy. A two-column CHECK on `group_members`
(`muted` vs `notify_mode`) failed every mute toggle in production (23514) until deploy. Ask
"would the code running in prod right now pass this?" Prefer a BEFORE trigger that derives the
invariant so both code versions are correct. (Sibling of the `NOT VALID` entry above.)

### `upsert({onConflict})` needs an UPDATE policy and grant (2026-08-19)
It compiles to `INSERT … ON CONFLICT DO UPDATE`. For insert-only tables (a row records that
something HAPPENED) use `ignoreDuplicates: true` and treat `[]` as success. Found on all five
`rsvps` upserts and `announcement_views`. A PostgREST verb names the client's intent, not the SQL.

### Viewer-scoped RPCs ignore the `p_user_id` you pass (2026-08-24)
`get_chat_list` / `get_chat_previews` read `auth.uid()`; the argument is kept only for signature
compatibility. From a service-role client they return empty, whatever you pass. Read
`pg_get_functiondef` for where the viewer comes from; call viewer-scoped RPCs in specs with a
real session token (`asAdmin`-style shared helper).

### An app-side filter is not evidence about the policy, either way (2026-09-15, 09-14, 08-19)
Extends the 2026-07-27 live-policy entry and CLAUDE.md Workflow #8. Three times in a month the
"known gap" was wrong: a reviewer inferred an open draft-announcement policy from the feed's
query filter (live policy was already closed, and a spec had frozen the wrong inference); a
lesson called `audit_logs` INSERT "leader-tier" from SQL files when live it had no tier at all
(closed 2026-09-15, migration `audit_logs_admin_read_tier_bound_insert`); two of three
"unscoped bucket" TODOs in CLAUDE.md were already fixed. A security finding isn't a finding
until it quotes `pg_get_expr(polqual/polwithcheck)` from the live DB; a security TODO is a
hypothesis — fixing an imagined predicate can remove protection added later. Prefer the gate
that matches the real rule (`is_group_member` over a `ministry_id` check: 14 legitimate
multi-ministry users). Any write path not admin-gated must write its audit row server-side.

## Database — data shape and writes

### A nullable boolean filter must admit NULL (2026-07-31)
`groups.archived` NULL means active, so `.eq("archived", false)` drops every active row
(`.neq` drops NULLs too). Use `.or("archived.is.null,archived.eq.false")`. Apply a dedup filter
to convergence READS only, never to the write that sets the flag; say in the commit why each
write path is excluded. (`scripts/check-archived-dedup.mjs` now guards the archived reads.)

### Destructive cleanup is bounded by the window it owns, never by name alone (2026-08-01)
`seed-ccsf-events.mjs` deleted by `ministry_id + team_id + title`, and "Start next season"
reuses titles — a re-seed wiped Central's live 2026–27 season unrecoverably. Bound deletes by a
window derived from the fixture data, print what was SPARED (`LEFT ALONE:`), and ask what else
could carry the same natural key. Sandbox allowlists stop writes into real congregations; they
don't protect real work inside a sandbox (Central is one).

### Store the relationship, not the derived value (2026-08-01)
Absolute `plan_start_date`/`crunch_date` anchors needed a date-shift stopgap, timezone-sensitive
seeding, and rollover re-basing; one relative ladder (`event_plans.countdown_phases`) deleted
all three. A test that only proves two stored values track each other is evidence one shouldn't
be stored. Two models for one concept bridged by a translation function is the real defect.
When replacing a model, rewrite the old tests to assert the new, stronger property.

### `time without time zone` is a wall clock, like DATE (2026-08-02)
`event_blocks.start_time` must render verbatim — routing it through `useMinistryTimezone()`
applies an offset to a value that never had one. Read the column type before applying
Convention #23 (`information_schema.columns`; "start_time" reads like an instant and isn't).
Integer durations need a shared formatter, not tz math.

### Normalizing input must match the alphabet already stored (2026-08-18)
Crockford folding (`I/L→1`, `O→0`) on lookups unmatched ~40% of legacy base36 invite codes.
When changing normalization, check stored values; rotate them in the same change or keep a
labelled legacy retry (`legacyLookupVariant` in `lib/invite-code.ts`) with a delete-me condition.

### A DM is a pair, not a room — key it on the participants (2026-08-08)
Discovering a DM by walking membership rows broke when a member "left" a DM and created
duplicates (and an apparent push bug: the leaver wasn't a recipient). `groups.dm_key =
least:greatest`, unique per ministry, created only via `get_or_create_dm()` (idempotent,
re-asserts both memberships). A partial unique index is only as strong as NOT NULL on its
predicate column — a CHECK (`type <> 'dm' or dm_key is not null`) closes the escape hatch.
When "X doesn't notify", first check the recipient is still a member.

### Account deletion scrubs identity, it doesn't sever it (2026-08-08)
Deleting `group_members` on account deletion made DMs title themselves with the survivor's
OWN name. Delete the personal columns, keep the anchor row. And run any step that can hard-fail
before anything destructive: `NO ACTION` FKs to `auth.users` (`finance_funds.created_by`, …)
failed the final delete after data was gone (now `ON DELETE SET NULL`). Audit new
`created_by`/`reviewed_by` FKs for `NO ACTION`.

### The DB role CHECK and `lib/roles.ts` drifted for months (2026-08-19)
`profiles_role_check` lacked `deacon`/`elder` while every app layer offered them; signup failed
late with 23514. Layers written from the same assumption agreeing is not evidence. A migration
that lists a whole domain becomes a second source of truth. Guarded now by
`scripts/check-role-domain.mjs` (blocking in verify.sh), which probes behaviour (23505 vs
23514) rather than parsing constraint text.

### Messages: no `ministry_id`, five homes for a new column, and `void` never sends (2026-08-25, 08-19)
- CLAUDE.md #8 now lists `messages` (scoped via `group_id`). The incident that found it was a
  `messages` insert that failed 100% of the time with no destructured `error`: a write whose
  failure changes nothing else must read its error, and assert on the ROW, not the render.
- A new `messages` column lands in five places: migration, `MESSAGE_SELECT`, **`enrichMessageRows`**
  (an explicit object mapper — a silent allowlist), the `Message` type, and every consumer (row,
  list preview, link-preview scan, push body). Realtime INSERT spreads `...raw`, so it can work
  live and break on reload. Test both.
- `void supabase.from(…)…` never runs: PostgREST builders are lazy thenables that send in
  `.then()`. Always `await`. `grep -rn "void supabase" app components lib` after moving writes
  into a closure (found a second live instance in `plan-tab.tsx`). Only a reload or DB read
  catches it.

### Fix a derived display value at EVERY producer (2026-08-08)
DM titles come from two twin RPCs: `get_chat_list` (SWR list) and `get_chat_previews` (SSR/boot,
backfills the header on a `?chat=<id>` restore). Grep every producer and prove it on the
deep-link path, not just the list.

## Auth, OAuth and onboarding

### A missing signal must never authorize a destructive action (2026-08-20, 08-19)
Extends the 2026-07-12 auth-guard entry. Web OAuth signup was broken from launch: the Supabase
redirect allowlist held only the apex, GoTrue silently substitutes the Site URL for an
unrecognized `redirect_to` (our `www` host treated like an attacker's), `flow=signup` was lost,
and `enforceOAuthAccountPolicy` deleted every fresh mint as a "sign-in". It looked like users
preferring email. Rules:
- Only an EXPLICIT sign-in may tear down a mint; absence of a flow marker is our bug. A wrong
  teardown unlinks the provider permanently; an extra admitted mint costs nothing.
- A durability marker is written in the same operation as what it attests. The OAuth
  `central_signup` stamp was a separate, swallowed write that failed during a 504 window and got
  two real accounts deleted. A best-effort write that a destructive branch later reads isn't
  best-effort (now retries once and screams).
- Prove config agrees with code: hit `/auth/v1/authorize` with your `redirect_to` and read the
  `referer` field in `auth_logs` (it's the redirect GoTrue validated down to).
- When a funnel branch shows ~zero conversion, first prove the branch can succeed.
- Re-check log labels that partition branches when the branches move; delete comments that argue
  for behaviour you just removed.
- When telemetry and the affected user disagree, ask the user — three confident wrong causes
  were asserted before simply asking.

### OAuth recovery paths must carry the flow forward, and every failure must say something (2026-08-19)
The no-account redirect dropped `intent`/`invite`, landing invite users on a context-free
`/signup`; the Google handlers returned silently on `no-account` (the Apple "frozen" bug, fixed
there but not in its sibling). A failed `signInWithOAuth` leaves NO server trace, so "never
tried" and "button did nothing" look identical. Fix every sibling sharing a failure shape. Vercel
logs: scope to a `deploymentId` and a <30 min window; same-second GET bursts to `/login`,
`/signup`, `/` are Link prefetches, not visits. The terminal redirect is part of the flow: a new
OAuth signup with no invite now goes to `/ministries`, not `/landing`.

### An OAuth display name is written once, at mint (2026-08-15)
`handle_new_user()` sets `profiles.name` once; `raw_user_meta_data` is overwritten every sign-in.
Never diagnose a name bug from metadata — join `profiles`. `reconcileProfileName()` runs on
sign-in as well as sign-up, so old accounts self-repair. `raw_app_meta_data.provider` is the
FIRST provider; `iss` in user metadata is the latest. The "name === email local part" predicate
is safe generally only when the name is a lone token.

### Probe the external service; don't derive its semantics from our calling code (2026-08-18)
`admin.auth.admin.updateUserById` MERGES top-level `user_metadata` keys (only explicit `null`
deletes); a wrong "it replaces" claim briefly went into an auth comment as fact. A throwaway
probe beats reasoning. Comments asserting external behaviour say how they were established
("Probed 2026-08-18: …").

### Every screen the middleware can park a user on needs a sign-out (2026-08-19)
`/ministries` had none and its back chevron looped, trapping new signups (total in the shell).
"Has a ministry" has two answers: `proxy.ts` reads `profiles.ministry_id`, `getUserMinistries()`
reads `user_ministries` — decide routing from the column the middleware reads, and when a fix
turns an affordance off for one cohort, test the cohort it stays on for.

### A shared predicate must hold every clause (2026-08-24)
The completeness gate asked a pastor mid-registration for a graduation year: `handle_new_user`
makes everyone `member` until the wizard ends, and the member-tier check lived only in
`proxy.ts`, not in the shared `memberProfileIncomplete`. A caller-side `X && shared(...)` is a
private clause with a public name. The gate now also waits for a ministry (`mid &&`).

### Every writer of a cohort field moves the cohort chat (2026-08-24)
`/complete-profile` wrote `graduation_year` without calling `changeClassChat`, so pre-gate OAuth
members never got their class chat; re-picking the same year is a no-op, so no self-service
escape. Any surface writing `profiles.graduation_year`/`grade` moves the chat in the same action
(four writers now). **Data repair owed (2026-08-24):** Abraham Noh and Alex Kang (2027) were
not seated.

### A link that joins must never write on GET (2026-08-18)
`joinMinistryByCode` MOVES the caller's tenant and resets role, so a join-on-load `/j/<CODE>`
would have let any opened link relocate a member. URL-reachable state changes need an explicit
tap, naming what gets replaced. Ask of every route: if someone sent this URL to a user who didn't
want it, do they only see a page? Guarded by `e2e/invite-join-link.spec.ts`.

### A defaulted flag param swallows React's click event (2026-08-24)
`doJoin(confirmedNotDuplicate = false)` passed bare to `onClick` received a truthy MouseEvent and
skipped the duplicate check; `tsc` caught one of three sites. Never pass a flag-taking handler
bare (`() => doJoin()`), grep every reference when adding a trailing param, and default flags to
the safe direction.

## Push notifications

### Never delete a registration on an error the server might be causing (2026-08-15)
APNs `BadDeviceToken` means wrong host/topic (server config), not a dead device; pruning on it
deleted live TestFlight tokens, and every later dispatch reported a clean `sent:0, failed:0` —
the cleanup concealed itself. Delete only on the device's own verdict (`Unregistered`/410).
Log the provider's reason code (never the token). `recipients:N` with zero attempts is a
contradiction, not a pass. Diagnostic: re-fire dispatch for an already-sent message via
`net.http_post` with the url/secret from `app_config`. One deployment serves sandbox AND
production tokens; point `APNS_ENV` at the larger population (it was wrongly `sandbox` in prod).

### `last_seen_at` measures app launches, not reachability (2026-08-15)
A time-based reaper deletes exactly the dormant users push exists to reach (a 32-day-stale token
accepted a real notification). `push_subscriptions` has no device identity, so "superseded by a
newer row" is wrong too, and a failure counter would delete the whole fleet when the server
breaks. Deletion needs positive evidence from the counterparty; when one direction fails
silently (over-reaping), bias hard against it.

### Push opt-outs: snooze, never permanent; "unsupported" needs a next step (2026-08-24)
The chat-list card's X wrote `prompt_dismissed: true` forever, and iOS lists an app under
Settings → Notifications only after it has called `requestAuthorization` — so the user's own
fix dead-ended too. Now `prompt_snooze_until` (14 days; legacy boolean treated as expired) and an
On/Off value on the mobile settings row. Any new `NotificationSettings` key must join
`normalize()`'s `Omit<>` or Save overwrites it. Mobile Safari has no `PushManager`, so ~49 of 63
Central members could never get push and were told only "This browser doesn't support push": an
unsupported state for a core channel must carry the one action that fixes it. App Store listing
(resolved via `itunes.apple.com/lookup?bundleId=app.joincentral`):
`https://apps.apple.com/us/app/central-os/id6791196078`.

## Native shell (Capacitor)

### Web deploys reach every old binary — gate on the capability, not the button (2026-08-25, 08-14)
The rule is CLAUDE.md §Cross-cutting. Two refinements: (1) gate where the capability is reached
(`CallProvider`, which can touch the mic via a realtime ring), not just where the button
renders — touching a TCC resource without its usage string terminates the iOS app; (2) a native
plugin throw on its own thread (`FATAL EXCEPTION: CapacitorPlugins`, no JS frames) is
uncatchable from JS — probe natively first (`FirebaseReadyPlugin.java`, `FirebaseApp.getApps`,
written with reflection, failing closed), never a bundle-time env flag.

### The shipped artifact embeds capacitor.config — verify the artifact (2026-08-14)
`cap sync` copies the config into gitignored `android/app/src/main/assets/capacitor.config.json`;
reverting the `.ts` changes nothing, and Gradle may say UP-TO-DATE and re-emit the old AAB. Use
`./gradlew clean bundleRelease` and assert with
`unzip -p app-release.aab base/assets/capacitor.config.json` (production URL, no `cleartext`)
after every release build. `cap add`/`cap sync` also touches `ios/` — check `git status ios/`.

### OS integrations need Associated Domains, not markup (2026-08-02)
Password autofill (and passkeys, Universal Links) in the WKWebView shell need the entitlement
plus an `apple-app-site-association`. Serve AASA from a route handler (Vercel serves
extensionless `public/` files as octet-stream), exclude `.well-known` from `proxy.ts` (Apple
follows no redirects), claim `www` not the apex, deploy AASA before installing a build with the
entitlement (iOS caches a 404), and enable the capability on the App ID.

### Keyboard layout: shrink the surface; `.kb-lift` replaces padding (2026-08-08, 08-24)
CLAUDE.md #28 carries the contract. Background: `fixed inset-0` anchors to the layout viewport,
which the keyboard doesn't shrink; occluded height (`--kb-inset`) and "keyboard open"
(`[data-kb-open]`) are separate facts because the native shell's inset is 0. `.kb-lift` is
`padding-bottom: var(--kb-inset)` (0 at rest) and REPLACES any padding on its element — put it on
its own spacer div (`data-kb-spacer`). To scroll a field clear, compute overflow against the real
visible bottom (`min(visualViewport.offsetTop + height, innerHeight - --kb-inset)`) and scroll
instantly; `scrollIntoView` centres in the layout viewport and smooth scroll gets clobbered by iOS.

### A native splash released from a React effect hides SSR until hydration (2026-08-16)
Release it from an inline `<script>` at the end of `<body>` via `window.Capacitor.Plugins`
directly (importing the plugin IS the bundle you're avoiding), keeping the React release as a
backstop. Min launch 3.4s → 2.7s. A/B a remote-URL shell by pointing the installed binary at a
local `next start` build, never `next dev`.

### Uninstalling the sim app is a logout (2026-08-17)
It wipes the container that holds the Supabase session, and re-signing-in needs Brian. Prefer a
reload or `cap run` (keeps the container); say out loud before uninstalling. Re-derive a repeat
symptom from the server side (`curl -A "…CentralShell"`, devlog) before retrying a remedy.

## Chat, caching and client data

### A client-side cache of tenant data is an access boundary (2026-08-18)
RLS reports "no access" as an empty array, so `if (server.length === 0) return local` kept
painting a room to someone just removed. Decide what an empty response means (server wins for
its time range); evict on every access-loss path (admin removal and group deletion have no
local signal — diff against the refreshed membership list); guard writes with an epoch so an
in-flight fetch can't refill after eviction; never cache optimistic rows; settle safety filters
(blocked senders) before instant paint. Gate on settled (`data !== undefined || error !==
undefined`), and only if the fetcher actually throws.

### Seeded SWR: loading means "no rows to show", not "request in flight" (2026-08-15)
Extends the SWR bullets in §Performance. `isLoading` ignores `fallbackData`, so an
`isLoading`-led spinner covered SSR-seeded rows. Use `rows.length === 0 && (isLoading || !!error)`;
an errored fetch with no rows shows the spinner, never the empty state.

### A guard gated on unresolved SWR silently doesn't run (2026-08-16)
`if (modSettings?.enabled)` skipped the display-name profanity filter whenever the cache was
cold — the normal case for a one-shot save. The same code has different safety properties on a
high-frequency surface. Resolve at the point of use (`await mutate()`), fall back to the safe
default. `x?.enabled` in a safety position is a smell. A reviewer's note about a race is worth
one test run.

### Realtime DELETE payloads are PK-only — measure, don't infer (2026-08-18)
Probed live: a `group_members` DELETE carried only `{id}` even though the table is
`REPLICA IDENTITY FULL`, and a subscription filtered on `user_id=eq.<uid>` still received it.
Unfiltered subscriptions receive DELETEs too (bare ids, no RLS). Anything that depends on this
needs an e2e test. **This contradicts the 2026-07-19 "Filtered realtime DELETE events need
REPLICA IDENTITY FULL" entry above** — re-probe before relying on either.

### Anchored menus need a measured box, not a flip (2026-08-22)
The chat menus' "flip below if above clips" missed the bottom edge, the keyboard shrinking the
container after open, width (emoji-mart is a fixed 352px), and neither side fitting. Measure the
CONTAINER (`.kb-lift` tracks the keyboard), pick the side with room, clamp `maxHeight`, observe
container and menu. Read content `scrollHeight`, not the clamped height; no `Math.max` floor.
emoji-mart `dynamicWidth` races its container; derive `perLine` instead.

## UI and design

### Design a repeating pattern against its worst realistic density (2026-08-02)
A dashed "add the first block" card looked right at n=1 and stacked five deep with real data.
Seed the worst case and look; empty states are the riskiest because mockups are drawn with data.
Sharpen the rule's principle (dashed = the whole collection is empty) over a count threshold.

### A restyle can drop semantics; diff the element names (2026-08-02)
`EventSectionHeader` went from `<h2>` to `<span>` and erased the workspace's headings; only a
`getByRole('heading')` spec caught it. Diff tags (`git show <commit>^:path`), prove visual-only
changes by computed style, and give shared-component rewrites a role-based runtime pass. Audit
siblings built in the same pass.

### Text tokens: tune against the darkest surface and the neighbouring tiers (2026-08-02, 08-03)
`--muted-text` had to pass AA on `--ivory` (darkest of seven creams), which flattened body↔muted
to 1.36:1; the fix was darkening `--body`, not walking muted back. Compute every surface AND the
tiers above/below; budget a product-wide sweep; alias copies (`var(--token)`); grep `/40`-style
opacity modifiers. A group header may be smaller than its rows, never fainter (`14/600/--ink`,
not `14/500/--muted-text`) — size reads as level, colour as importance.

### Tokenize shared boxes, and let shared shells enforce their contract (2026-08-05)
Hand-typed `12px 20px 10px` chrome padding drifted four ways and only showed in transitions
between screens; now `POCKET_CHROME_PAD_Y`/`PAD_X` (split by axis). A mount-dependent contract
written as a call-site comment is a request: `SubpageShell` now cancels symmetric ancestor
padding in a layout effect (CLAUDE.md #26). Measure ancestors' padding with `getComputedStyle`
before theorizing. Assert the box, not the glyph position.

### In hub-and-spoke, the hub owns navigation (2026-08-05)
The mobile event Overview re-rendered the hub's "Jump into planning" list. When a desktop tab
becomes a mobile spoke, delete what the hub already provides. Prose never goes in a facts-grid
value. When viewports disagree on structure, give mobile its own early return. Chrome-row actions
go through `<MobileChromeActions>` (alias `SubpageChromeActions`; CLAUDE.md #25) — a portal
published as state, not a ref.

### "Desktop" is not a width (2026-08-08)
An iPhone in landscape is 874–956px. Predicate: `(min-width: 768px) and ((hover: hover) or
(min-width: 1024px))`, defined once in `lib/breakpoints.ts` plus `@custom-variant md` AND
`max-md` in `globals.css`; custom CSS uses `@variant md`. Grep every hand-written copy before
changing a breakpoint. Test traps: CSS-uppercased text doesn't match `getByText`; presence isn't
visibility (`.filter({ visible: true })`).

### Fixed-overlay clearance belongs to the scroll container, once (2026-08-07)
`pb-28` on the shell AND 18 tab roots stacked to ~260px of dead scroll. Derive the value from the
overlay's geometry (`--nav-clearance`) and apply it as a class (inline padding beats the desktop
reset). Measure against the bottom-most leaf, with a short viewport (390×520) to force overflow.
(The rule is in `components/central/CLAUDE.md` §Layout.)

### `.shell-scroll` isn't the scroller at phone width (2026-08-15)
Its height constraints are all `md:`-prefixed, so on mobile the document scrolls and
`node.scrollTop` is a permanent 0 (pull-to-refresh armed mid-page). Use an
`effectiveScrollTop()` that falls back to `window.scrollY` when `scrollHeight <= clientHeight`.

### State-driven properties don't go inline (2026-08-24, 08-16)
Extends §Two CSS footguns. An inline declaration beats every stylesheet state rule
(`[data-armed]`, `:hover`, media), so a swipe tile's inline border and colour silently ignored
the armed state — twice in one task. Put any property that will vary by state in
`globals.css` from the start (`.a + .a` beats an index check). Adjacent tiles at DPR>1 leak the
backdrop through sub-pixel gaps: paint the container the same fill. Before deleting a wrapper,
grep its subtree for its own fill token: hardcoded backdrop matches (`SwipeActionRow`'s
foreground, `MonogramChip`'s `dotRing`) silently break; make them explicit params.

### Order is volume (2026-08-20)
Open groups was "too loud" because it sat first on three surfaces, not because of its styling.
Mobile has no pinned footer, so "last" means "below the fold forever". The fit was a third scope
in the existing switch ("Church / Mine / Open", measured to fit 375px). Demoting an entry point
must not cost taps. A parent that opens a child's surface owns that state (no trigger-counter
effect). When a fix keeps growing plumbing, the shape is wrong.

### A scope switcher must show which scope holds the unread (2026-08-24)
The scope dots partition exactly what the nav badge counts (`unreadByScope` in chat-shared.ts);
assert absence on the empty and muted scopes. Phone width renders scopes as the `PocketChrome`
title, so test both viewports. Check a primitive's API before widening it (`SegmentedControl.label`
was already a ReactNode).

### A raw control inside a design-system consumer is drift (2026-08-24)
The poll composer predated `Input`/`FormField`/`IconButton`/`CentralButton` and stopped
receiving the system's decisions (its `--cream-panel` inputs vanished into the sheet). Grep files
that import `@/components/central` for hand-styled `<input>`/`<button>` classNames. Write
redesign specs against behaviour (placeholders, roles, persisted rows), not markup.

### A cdesign KEEP can't overrule a doc rule; re-fetch the source before building (2026-08-19, 08-02)
A 720px centred column was KEPT by quoting half of `web_design_system.md` §7.0; the other half
says collection content fills the content area. Quote the whole clause and name which case
applies; a handoff/doc conflict goes to Brian as a question. A cdesign file is live — re-fetch
immediately before dispatching a build, `SendMessage` an in-flight reconciler with deltas, and
ask for the design conversation when the artifact's structure looks arbitrary.

## E2E and verification

### Restart the dev server before believing any result after an edit (2026-08-15, 08-20, 08-20, 08-24)
`next dev` (Turbopack) repeatedly served stale modules after an edit: a missing barrel export
500ing `/home`, unchanged screenshots, and — the dangerous case — a false PASS when proving a
spec fails without the fix. Warming routes with curl doesn't help (`/home` 307s; tab chunks are
`next/dynamic`). When a visual change seems not to apply, read `getComputedStyle` before editing
again; when e2e disagrees with a careful reading of the code, suspect the bundle. Restart, then
measure. An A/B that changes two things (your file AND the server) proves nothing. `verify.sh`
restarts for you; ad-hoc `npx playwright test` doesn't.

### iCloud and `.next`: conflicted copies and pre-deletes 404 every route but `/` (2026-08-24)
Routes that compile and then 404 mean `.next 2` exists (`ls -d .next*`; remove it) or you
pre-deleted `.next` before `npm run dev`, which already deletes it — two deletes race on the
synced path. Kill the port and let the dev script own the delete. For a fast clear, use
`mv .next .next-stale-$$ && (rm -rf .next-stale-$$ &)`.

### A shifting failure set means the environment, not your diff (2026-08-05, 08-15, 08-16, 08-17)
Same tests failing every time is a regression; a different subset each run is infrastructure.
Known causes: Supabase auth rate limits from repeated `auth.setup` logins (wait ~2 min, iterate on
one spec file), auth latency (`get_logs(service:"auth")` — durations are double-escaped JSON;
`grep 429` matches request ids), a degraded long-lived dev server (compare suite runtime to a
known-good figure; the suite is serial, `workers: 1`), and machine load from sibling slots
(`uptime`, `pgrep -f playwright`; load > ~4 makes timings noise). Re-run isolated before
explaining. `npx playwright test --no-deps` reuses `e2e/.auth/*.json` when only setup fails.
"2 failed, 46 did not run" says nothing about the 46. A `selectOption` timeout can mean the
OPTION doesn't exist (same message as a disabled control). A timeout is not an assertion failure.

### Perf: verify the mechanism, not the clock (2026-08-15, 08-07)
On a loaded box any single timing is unfalsifiable — prefer load-independent evidence (SSR HTML
contains the rows, request count 2 → 1) and take the minimum of runs. Local SSR against remote
Supabase is structurally pessimistic. For load tests: Node's 4-thread libuv pool queues
`dns.lookup` inside measured `fetch` time — set `UV_THREADPOOL_SIZE=64` at process start
(`ensureThreadpool()` re-execs in `scripts/loadtest/lib.cjs`). Fast at concurrency 1 and slow at
N is a client symptom; two unrelated hosts degrading in lockstep is never the servers. Probes
should skip rather than queue and count skips; filter stored tokens by `expires_at`.

### A green check is not "the tests ran" (2026-08-05)
The CI `e2e (sandbox tenant)` job skips every step when secrets are absent (none on this public
repo) and still reports success in ~5s. Confirm a plausible duration or the step list. A
conditional skip must not resolve to the same status as a pass. **Open decision:** configure the
secrets (fork PRs don't get them) or make the gate fail loudly.

### A test you haven't seen fail isn't a guard (2026-08-24, 08-05, 08-08, 08-15)
When the fix is "the app moves something", the test must not move it (a spec that scrolled for
the app passed while the bug shipped). Revert the fix, restart the dev server, watch the spec go
red, restore. Assertions can be vacuous through shared fixtures (the sandbox member was already
in every class chat — evict first). A guard whose input is a constant fails silently; assert it
BLOCKS something. To A/B against base, commit first: `git checkout -- <path>` restores HEAD, not
your uncommitted fix.

### Specs must be lane-agnostic and time-relative (2026-08-01, 08-08, 08-05, 08-24)
Extends the 2026-07-21 fixtures entry. Derive identities (`ministryName()`, `adminName()`,
`memberName()` in `e2e/fixtures.ts`; a trailing " 2" diff is the tell) and the port
(`process.env.E2E_PORT`); a suite that's always red on one lane hides real failures — run
chronic failures on the known-good lane first (12 of 26 "seeding" failures were real test
bugs). Express fixture dates relative to today, re-anchored in `beforeAll`, choosing the anchor
from product rules ("up next" means starts in the future, and must beat other seeded events).
Enumerate the whole ladder for time-derived copy ("Good night" at ≥21h). Clear the `central-mw`
cookie when testing a routing decision `proxy.ts` caches for 5 minutes. Exact-set assertions
over the shared sandbox are time bombs ("contains X, excludes the author" instead). Vary every
field a future uniqueness rule could key on (name as well as email).

### Fixtures follow the real user's path, and shared ones live in the seed (2026-08-17, 08-06)
Fixtures inserted straight into `profiles` had no `user_ministries`, so every login took a
two-query fallback no real user takes (7.2s → 4.1s once seeded); a slow fixture is a seeding bug,
not a timeout. A fixture three specs select by label belongs in `scripts/seed-e2e.mjs`; when a
spec stops depending on shared data, delete the old references in the same pass. In a DB that is
mostly fixtures, group aggregates by cohort before believing them.

### Specs that share sandbox rows interfere; arrange your own state (2026-08-22, 08-24)
The three reaction specs pass alone and fail together (shared tenant, tenant-wide locators);
re-run alone before believing a batch failure. Fix: per-spec prefixes that scope every locator,
cleanup that runs on throw. Tests that mutate a shared seeded row must each arrange their start
(`makeUnread()`); the desktop chat panel auto-opens the most recent chat and can consume a seed.

### Every e2e spec is authenticated by default (2026-08-02)
`playwright.config.ts` sets `storageState: ADMIN_STATE` on both projects (the `request` fixture
inherits it). Signed-out tests need `test.use({ storageState: { cookies: [], origins: [] } })`.
A "0 elements" failure on a page you know renders: check `page.url()` for a redirect first.

### Sweeps: discover screens, report skips, and verify what the detector measured (2026-08-07, 08-09, 08-20, 08-20, 09-13)
The mobile sweep walks `[data-pocket-row]` and backs out via `.back-chevron` (27 → 44 screens
over a hand-written list). Collect every violation and assert once. An unreached screen or
skipped branch must print SKIPPED — a silent skip equals a pass (the whole Plan branch vanished
behind `if (teamId)`). Screens opened by anything other than a row (gear, card) need an explicit
hop. Poll until two identical reads, wait for rows to paint, and check seeds match. Playwright's
`visible` ignores occlusion: detect a new surface by counting `.back-chevron`s, on the way in and
out; give swallowed clicks a 3s timeout. Pin every axis a contract cares about (position, type,
colour) or name the free ones. A detector measuring the wrong element hides real bugs — require
leaf text, skip `[data-monogram]`. When a surface's placement changes, grep `e2e/` for detectors
keyed on the old z-index/position and anchor on a marker attribute (`data-msg-menu`). Any change to
`message-row.tsx`/`ChatScreen` runs `chat-timestamps`, `chat-swipe-reply`, `chat-menu-bounds`,
`jumbo-emoji`. A suite timeout is not a verdict — bisect against the previous commit.

### A lint gate strips comments syntactically, and a detector change is proven both ways (2026-08-16)
`check-chrome-title.sh` now strips `/* */` and `//` with perl before grepping (fixed). General
rule for any checker: never skip comments by line prefix; after changing a detector, prove the
false positive is gone AND a planted violation still fails. Rewording your code to dodge a gate
is fixing the threshold.

### Headless Chromium has no Notifications API (2026-08-24)
`Notification.permission` is "denied" whatever Playwright permissions you pass. Prove the wiring
instead (an `addInitScript` recorder for `navigator.serviceWorker`). `serviceWorker.ready` never
settles with nothing registered — use `getRegistration()`. Two failed attempts on the same point
means change approach.

### Proving a call connects without a second human (2026-09-13)
Other end = `tapprofile@sandbox.test` ("Tap Tester", the one sandbox cast member with a real auth
row). DM group `038c6d5a-d21f-489a-b825-7e91cd4a8b5e` (insert via service role with `dm_key`;
`get_or_create_dm` refuses across active ministries). Chromium with
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` at 390px; deep-link
`/home?tab=chats&chat=<dm>`; the overlay timer appearing = connected. Brian's phone must be on
Brian's Sandbox. Slot `.env.local` has placeholder LiveKit keys (`vercel env pull` returns them
empty) — run the browser end against `https://joincentral.app`. Warn that the fake mic is a beep.

## Workflow, git and tooling

### Never commit to a branch whose PR already merged (2026-08-01)
Pushing to a merged branch doesn't reopen the PR, and nothing warns you. Before declaring done,
list local branches ahead of `origin/main` and cross-check `gh pr list --state open`. Rescue by
cherry-picking onto a fresh branch off `origin/main`; after a merge, treat the branch as dead.

### "We already did that" — check it's on main before building (2026-08-06)
The countdown ladder existed as one unmerged, PR-less commit 30 behind main, while the DB was
already migrated (a convincing half-state). `git log --all --grep=<concept> -i`, then
`git merge-base --is-ancestor <sha> origin/main`. Open a PR the day work is written. Merge the
stale branch INTO a fresh one; resolve each conflict by decision, never `--ours`/`--theirs`
wholesale.

### A doc is a claim, not evidence; an affordance's reach is a census (2026-08-17, 08-16)
Abandoned checklists (`APPSTORE_SUBMISSION_STEPS.md`, 21 unchecked boxes on shipped Run Sheet
work) drove a fictional strategy option. Verify any plan/status doc against code, schema, DB or
git before it drives a decision; delete plans when work ships. Likewise, "X has one door" needs
`grep -rn '<ComponentName'` across `app/` + `components/` reading each hit for opt-outs, not a
handler grep in files already open — and surface a premise you supplied as soon as it proves false.

### Before deleting a file, check every export (2026-08-04)
`chats-section.tsx` and `up-next-card.tsx` had dead components but live types. `grep -n '^export'`
then grep each symbol. The rescued type's destination must respect layering (`components/central`
can't import `app/`).

### A nullable DB column typed `string` makes selects uncontrolled (2026-08-04)
`team_members.role_id` (nullable) typed `string` passed `value={null}`, so the select showed the
first role as the member's. Verify interface nullability against `information_schema.columns`,
normalize once at the load boundary to the component's sentinel (with a real `<option value="">`),
and treat console-assertion spec failures as defects.

### Read-only agents can't write their artifacts (2026-08-01)
Merged into the 2026-07-19 "Explorer agents cannot write" entry above.

### Supabase MCP: a reconnect, not a token; verify it's loaded before planning a migration (2026-09-16, 08-01)
An auth failure on `mcp__supabase__*` is an expired OAuth session — ask Brian to run `/mcp` and
reconnect (a local slash command), then retry; never ask for a personal access token. If no
`mcp__supabase__*` tool exists at all, check with one ToolSearch at task start; author the `.sql`,
run the rls-reviewer BEFORE pass statically (tell it MCP is down), hand off as "migration
pending". Never route around it by reading the Management API token from `~/.claude.json`. If a
reconnect doesn't clear it, check status.supabase.com.

### `.env.local` is per worktree: check sibling slots before declaring a secret unobtainable (2026-08-15)
Extends the 2026-07-12 and 2026-07-30 env entries. s3 kept disabled legacy Supabase keys after the
2026-08-13 rotation (`session.sh` resets code, not env); the valid `sb_secret_` key was in the
other three worktrees all along. A login failing in ONE slot is an env hypothesis first.
`vercel env pull` writes `""` for sensitive vars with no warning — check the length.

### Fix the runbook, not the memory (2026-08-08)
`/ship` broke the slot dev server three ships running even after the lesson was written; the fix
that held was editing `.claude/commands/ship.md` (frees the port before building, restarts and
polls after). A recurring operational failure needs the fix in the command that executes.
