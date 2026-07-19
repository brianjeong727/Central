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
- `?member=` — Directory member · `?section=` + `?jtab=` — Profile section + journal subtab
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
Also: dev builds carry SANDBOX APNs tokens; prod carries production tokens. APNS_ENV=sandbox on Vercel while the only users are dev builds; flip to production at TestFlight.

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

## Filtered realtime DELETE events need REPLICA IDENTITY FULL (2026-07-19)
A `postgres_changes` subscription with a column filter (`group_id=eq.X`) only matches DELETE events if the filter column is in the old-row WAL image — and default replica identity ships ONLY the PK. Symptom: INSERTs arrive live, DELETEs silently vanish for filtered subscribers (reaction removal, run-sheet block deletion). Bit twice in one migration (message_reactions, event_blocks). Rule: any table whose realtime consumer filters on a non-PK column AND deletes rows needs `ALTER TABLE … REPLICA IDENTITY FULL` (cheap for small rows; weigh WAL volume for fat/hot-update tables).

## Explorer agents cannot write their findings files (2026-07-19)
The `explorer` subagent is Read/Grep/Glob only — a dispatch prompt telling it to "write findings to X.md" fails silently; the content comes back only in its final return message. Either ask explorers for inline-return findings explicitly, or dispatch a general-purpose agent when a findings FILE is the deliverable. (The rls-reviewer/tester have Bash and can write; the reconciler/enforcer cannot.)

## Verify "already fixed" claims against the live publication, not migration greps (2026-07-19)
The realtime-egress explorer flagged small_groups/dgl_assignments as "probably not published" from grepping migration .sql files — but the live `pg_publication_tables` showed they WERE (added via MCP, no local file). The same live check exposed the real gap: event_blocks subscribed in code but absent from the publication. Publication/trigger/function state applied via MCP leaves no repo artifact — always query the live DB.

## PostgREST embeds break silently when a second FK appears between two tables (2026-07-19)
`profiles → ministries(status)` embed worked for months, then `ministries.archive_requested_by` added a second FK between the same tables — every unqualified embed now throws PGRST201 (ambiguous). The failure surfaced in NEW code (proxy.ts routing query) written against the old mental model. Rules: always FK-qualify embeds on tables with multiple relationships (`ministries!profiles_ministry_id_fkey(status)`), and never let a routing/auth-path query error fall through to a redirect — degrade to separate queries; an infrastructure error must not route a valid user away.

## Async subscribe paths need a generation guard (2026-07-19)
Any `await` between "check topic map" and "create+subscribe channel" (e.g. auth before joining a private realtime channel) lets StrictMode double-mount or fast unmount/remount interleave → two live channels on one topic → every event delivered twice. Pattern: store the entry (or pending promise) in the map SYNCHRONOUSLY before awaiting, re-check `map.get(key) === myEntry` after every await, and tear down anything a stale continuation created. Dedup by event id at the handler as defense-in-depth.
