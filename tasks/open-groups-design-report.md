# Open-groups body — build report

Contract: `.claude/task-context/open-groups-design/manifest.md` (manifest wins over the handoff).
Built 2026-08-19. Not committed.

## Files touched

| File | Change |
|---|---|
| `app/home/tabs/open-groups-view.tsx` | Body split into `md:hidden` (shipped Pocket path, untouched) + `hidden md:block` (new desktop card/row/Join grammar). One SWR/state/data layer feeds both. Header comment rewritten (K2). |
| `components/central/list-row.tsx` | `ListRowProps` now extends `HTMLAttributes<HTMLDivElement>` so a row can carry `role`/`tabIndex`/`aria-label`/`onKeyDown` (SNAP 10). Backwards compatible — every existing call site is a strict subset. |
| `app/globals.css` | New `.row-chevron` rule beside `.central-list-row`: 2px `translateX` on parent-row hover, `--dur-fast`/`--ease-out`, pointer-gated + reduced-motion guarded (K4). |
| `components/central/subpage-shell.tsx` | `width="centered"` now puts the DESKTOP header in the same centered `maxWidth` column as the body (title, meta, action, both hairlines). `width="full"` renders the identical element tree it always did. **This surface no longer uses `centered`** — the fix stands for the one legitimate consumer, `plan-tab`'s "New workspace". |
| `app/home/open-groups.ts` | **Untouched** — not forked, as instructed. |

## Manifest items applied

**SNAP**
1. ✅ Every colour is `var(--token)`; no README hexes. Verified live in the browser: `--body` = `rgb(71,66,81)` `#474251`, `--muted-text` = `rgb(110,104,123)` `#6E687B`, `--faint` = `rgb(142,135,119)` `#8E8777`, `--plum-tint` = the `color-mix`. All four are the POST-retune values, not the handoff's.
2. ✅ No `.head` block. `document.querySelectorAll("h1").length === 1`.
3. ✅ Title is `SubpageShell`'s `PageTitle` compact — measured 25px/600. No 34.
4. ✅ Header rule is `SubpageShell`'s `InsetHairline`; it spans the content inset, not the 720 column (accepted consequence — see Interpretations).
5. ✅ Desktop description 15px / line-height 1.55 / `--body` / `max-width: 56ch` (measured 547.1px) / `text-wrap: pretty`. Phone keeps its shipped 14.5/1.6 (see Interpretations).
6. ✅ Desktop count eyebrow is `EYEBROW_STYLE` — measured 11px, 1.4px tracking, uppercase, mono, `--muted-text`. Mobile keeps `PocketKicker`.
7. ✅ Card is `--cream-panel` + 1px `--line-2` + `var(--r-callout)` (measured 14px) + `overflow: hidden`.
8. ✅ Rows are `ListRow` — `--line-3` divider, none on last, `--cream-2` hover (measured `rgb(248,244,234)` under a real pointer), tokenised transition. Grid passed via `style`; `borderRadius: 0` so the hover fill meets the card edge.
9. ✅ Row padding `14px 18px`; gaps 14/12 kept. Rows land at 76px (46px avatar + 14/14 + divider) — the manifest predicted ~68 at a 40px avatar; U3's ratified 46 accounts for the difference.
10. ✅ `ListRow` + `role="button"` + `tabIndex={0}` + `aria-label` + Enter/Space handler; Join is a real nested `<button>` with `stopPropagation`. The two never co-occur on one row (a joined row has no Join button; a non-joined row takes no row role), so there is no interactive-descendant violation.
11. ✅ `ChatAvatar` (→ `MonogramChip`: circle / `--plum` / `--cream-on-dark`). Group photos (`OpenGroup.avatarUrl`) are preserved. `surface="var(--cream-panel)"` so a clustered avatar's ring matches the card, not the page.
12. ✅ Row name 17 / 500 / `-0.01em` / `--ink`.
13. ✅ Join is `CentralButton variant="secondary" size="sm"` — measured 13px, `8px 14px`, `--line-2` border. Not a raw `<button>`.
14. ✅ Joined pill: `--plum` text (not `--plum-2`), `--plum-tint` bg, `4px 10px`, 12/500, radius 999, non-interactive.
15. ✅ Chevron is lucide `ChevronRight`, 15px, `--faint`, stroke 1.8, **opacity 1 at rest** (measured).
16. ✅ Chevron and row-click exist ONLY on joined rows. A non-member row has `cursor: default`, no role, no tabindex, no click.
17. ✅ No inline `120ms ease` anywhere — `ListRow` supplies the row half; the chevron rule uses `--dur-fast`/`--ease-out` (measured `transform 0.12s cubic-bezier(0.23,1,0.32,1)`).
18. ✅ Empty state is `EmptyState` quiet with the shipped copy.
19. ✅ Loading is `SkeletonBlock` in the card's own row geometry — no hand-rolled bars. **Desktop only** (see Interpretations).
20. ✅ No `26px 40px 60px`. Vertical rhythm is §4.18's 24px from the header hairline to the first body element (`md:pt-6`); horizontal is the shell's.
21. ✅ Error line preserved verbatim — 13px `--danger`, `role="alert"`.
22. ✅ The "below ~560px" responsive note ignored; phone width is the shipped immersive path.

**KEEP**
- K1 ✅ `SubpageShell width="centered" maxWidth={720}` — no bespoke `.wrap`. Measured column 680 wide, centred in the content area.
- K2 ✅ Join button on desktop. **The `open-groups-view.tsx` header comment was rewritten**, not left contradicting the code: the join affordance is now stated as PER-VIEWPORT, with the reason each viewport has the one it has, and both are named as intentional.
- K3 ✅ Bounded card + rows on desktop; full-bleed on phone.
- K4 ✅ Chevron hover micro-motion — `translateX(2px)`, verified `matrix(1,0,0,1,2,0)` under a live hover.
- K5 ✅ Description in the body (no `subtitle` prop on `SubpageShell`).
- K6 ✅ Card surface as specified; no `CentralCard` variant invented for it.

**RATIFIED**
- U1 ✅ Join takes the pill radius (999) and `--plum` text through `CentralButton`, in the same slot the Joined pill occupies.
- U2 ✅ Undo toast kept, unchanged, shared by both viewports.
- U3 ✅ 46px avatar; grid is `46px 1fr auto`.

## Interpretations I had to make

1. **The manifest was silent on the chevron's SLOT, and SNAP 16 breaks U1 without a fix.** Dropping the chevron from non-joined rows slides Join 27px right (chevron 15 + gap 12) into the chevron's place — so Join and Joined no longer sit in the same slot, which is the whole point of U1(a). The chevron's 15px box is now RESERVED on every row and only *drawn* on joined ones. Verified: Join's right edge and the Joined pill's right edge now coincide.
2. **SNAP 5 / 19 are desktop-only.** Both would have changed phone pixels (15px reflows the description; a skeleton paints where nothing paints today). The SCOPING RULING says mobile is preserved as-is, and that outranks a SNAP item, so phone keeps 14.5/1.6 and keeps painting nothing while the RPC resolves. If Brian wants the phone description at 15 too, that is a one-word change but it is a mobile design decision, not this handoff's.
3. **Row hover is on ALL rows, including non-joined ones.** SNAP 16 scoped the CHEVRON and the CLICK to joined rows; it said nothing about the tint. A background tint reports "your pointer is here", it does not promise navigation the way a chevron does, and the row does contain an action. Flagging it because it is a judgement call I made, not one the manifest made.
4. **Join and Joined are the same slot but not the same height** — Join is 37.5px (§4.3 `sm`, SNAP 13), Joined is ~22px (4×10 / 12px, SNAP 14). Both numbers are pinned by the manifest, so I took "one control changing state" to mean the same slot and the same pill shape, not identical boxes. Neither affects row height (the 46px avatar dominates).
5. **`width="centered"` means the body inset is `px-5`, not `md:px-14`.** K1 names the implementation and SNAP 20 names `md:px-14`; they cannot both hold. K1 is the more specific instruction, so the column carries the shell's centered `px-5` and the header keeps `md:px-14`.

## Width & alignment — the capped column was drift, and it is gone

**Final state: FULL WIDTH, LEFT-ALIGNED at the standard `md:px-14` content inset.** Title,
description, count eyebrow and card all start at x=392 at 1440, the header rules span the content
width (992), and the card fills it. `width="full"`, no `maxWidth`.

**Why the 720px centred column was wrong.** `web_design_system.md` §7.0 splits by CONTENT TYPE, and
the manifest's K1 leaned on the wrong half of it:

- *Reading-/form-measure content* (prose, a single-column form, an editorial body) → cap and CENTER.
- *Collection / data content* — "lists of cards, tables, stat grids… **no** reading-measure
  constraint — let them fill the content area out to the page padding (`px-14` / `0 40px`)… **Do not
  trap a list or grid in a fixed narrow column.**"

A list of joinable groups is collection content, full stop. So K1 was never a legitimate KEEP — it
was **drift that should have been a SNAP**. Recorded here so the next cdesign handoff proposing a
capped column for a list gets snapped rather than kept: the test is what the content IS, not whether
the mock looks tidier narrow.

**The `SubpageShell` header-centering fix is KEPT** — it is independently correct (a genuinely
centred column should have a centred header) and it is what straightens `plan-tab`'s "New workspace"
(820), which is a creation FORM and therefore legitimately reading-measure content. It simply no
longer applies to this surface. Re-verified after the revert: "New workspace" title x=366 with rules
366/780, byte-identical to the capture taken right after the shell fix (**diff bbox `None`**).

**Everything else built earlier is unchanged** — card, rows, 46px avatar, `46px 1fr auto` grid,
Join/Joined pill sharing one slot, chevron on joined rows only, hover, chevron nudge, skeleton,
empty state. Only width and alignment moved.

### The wide-row sanity check (measured, not eyeballed)

Gap between the end of the group NAME text and the left edge of the Join/Joined cluster:

| viewport | row width | name→cluster gap (3 rows) |
|---|---|---|
| 1440 | 990 | 661 / 732 / 730 |
| 1920 | 1470 | 1141 / 1212 / 1210 |

**At 1440 it reads correctly** — the divider, the card edge and the `--cream-2` hover fill bind the
row, and the right cluster reads as the row's right-hand column exactly as it does in Directory and
the announcements list. I looked at it; nothing is stranded.

**At 1920 it starts to strain** — a ~1.2k px run of empty cream between a short name like
"Building A" and its pill. Flagging it with the numbers rather than quietly re-capping, because
re-capping is the thing that was just ruled out and it is Brian's call, not mine. If he ever wants it
addressed, the fix that stays inside §7.0 is to let the collection use the extra width (a second
column of cards past some breakpoint), not to narrow the row.

## Verification

- Type gate: `npx tsc --noEmit` clean. `npx eslint` clean on both touched TS files.
- Guards: `check-hex.sh` (93 < baseline 146 — no new hex), `check-chrome-title.sh`, `check-chat-avatar.sh` all pass.
- **Desktop @1440**: rendered live and inspected, plus computed-style measurement of every token, size, radius, padding, grid, role/tabindex/aria, and the hover + chevron transform — all matching the SNAP table above. Final alignment measured: title / description / count eyebrow / card all at x=392, header rules x=392 w=992, card width 992.
- **Phone @390: pixel-identical to what ships today**, re-verified after the shell change too. Baseline captured before touching anything; final diff `bbox = None` — zero differing pixels. (The shell edit is structurally desktop-only — it lives entirely inside `{title && (<div className="hidden md:flex …">`.) (One real regression was caught this way: `text-wrap: pretty` had been applied unconditionally and rewrapped the phone description. Now `md:text-pretty`.)
- `npm run build`: **passes** (compiled successfully).
- `width="full"` regression at 1440, before vs after: **team settings** (a TITLED subpage — it exercises the header code path a titleless one would not) and the **announcements root** both diff to **zero pixels**; its four header hairlines measure byte-identically (392/992, 392/992, 415/946, 392/992). The team-home capture shows one 11×11px diff, which is the `eventUpNextRing` pulse animation caught at a different phase — not my change.
- `plan-tab` "New workspace" at 1440 captured, inspected, and re-diffed after the revert: title x=128 (orphaned under a 1256px rule) → x=366 above its own card, rules spanning its 780px column. **Zero-pixel diff** between the post-shell-fix capture and the final one, so the revert did not disturb it.
- Throwaway capture specs were deleted; nothing was added to `e2e/`.

**Sandbox note for whoever tests this:** the E2E sandbox (`fcbe3a1f-…`) now has 3 open groups with varied member counts — Board games night (3), Building A (4), Basketball (5) — and E2E Admin was removed from **Basketball** so the not-joined/Join state is reachable. Fixtures left in place. Path: Messages → "Open groups" row at the top of the chat panel.

## Trap worth knowing (dev only)

The slot's dev server serves STALE compiled output while reporting healthy, and it bit twice — once
on CSS (a new `globals.css` rule simply did not exist in the browser) and once, worse, on a **TSX
module**: the `width="centered"` → `width="full"` change was correct on disk, `tsc` was clean, and
the app kept rendering the old centred column through two full Playwright runs. `touch` did not fix
it and neither did requesting the page; the compiled chunk's mtime never moved. Only restarting the
dev server on the slot's own port did.

Two consequences worth carrying:
- **Never conclude "my change had no effect" from a render alone.** Grep the compiled chunk
  (`.next/dev/static/chunks/…`) for a distinctive string from the edit. That is the difference
  between five wasted minutes and hunting a bug that does not exist.
- A visual verification pass is only evidence if you have confirmed the bundle under test is the
  code you wrote.
