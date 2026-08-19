# Open-groups body — build report

Contract: `.claude/task-context/open-groups-design/manifest.md` (manifest wins over the handoff).
Built 2026-08-19. Not committed.

## Files touched

| File | Change |
|---|---|
| `app/home/tabs/open-groups-view.tsx` | Body split into `md:hidden` (shipped Pocket path, untouched) + `hidden md:block` (new desktop card/row/Join grammar). One SWR/state/data layer feeds both. Header comment rewritten (K2). |
| `components/central/list-row.tsx` | `ListRowProps` now extends `HTMLAttributes<HTMLDivElement>` so a row can carry `role`/`tabIndex`/`aria-label`/`onKeyDown` (SNAP 10). Backwards compatible — every existing call site is a strict subset. |
| `app/globals.css` | New `.row-chevron` rule beside `.central-list-row`: 2px `translateX` on parent-row hover, `--dur-fast`/`--ease-out`, pointer-gated + reduced-motion guarded (K4). |
| `components/central/subpage-shell.tsx` | `width="centered"` now puts the DESKTOP header in the same centered `maxWidth` column as the body (title, meta, action, both hairlines). `width="full"` renders the identical element tree it always did. |
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

## The alignment fix — escalated, ratified, implemented

The first build shipped the manifest literally and the header did not share a left edge with the
body: title at x=392 (the shell's `md:px-14` inset), column at x=548, and a hairline spanning the
whole content area above a card that started a third of the way in. I flagged it rather than
papering over it; Brian ratified the shell fix (option 2 of the three I offered).

**What I did.** `SubpageShell` now applies the SAME centered column to its desktop HEADER as to its
body whenever `width="centered"`. The header's title, `titleMeta`, `titleAction` and BOTH
`InsetHairline`s are wrapped in the identical `mx-auto w-full px-5` + `maxWidth` wrapper the body
already used — deliberately the same wrapper, so the two can never drift apart again. The hairlines
sit INSIDE it, which is what makes them span the column instead of the content area (§4.11: a rule
is sized to what it separates).

**Result on this surface** (measured at 1440, not eyeballed):

| | before | after |
|---|---|---|
| title x | 392 | **548** |
| description x | 548 | 548 |
| count eyebrow x | 548 | 548 |
| card x / width | 548 / 680 | 548 / 680 |
| header hairlines | x 392, w 992 | **x 548, w 680** |

One left edge for all five, and the rules are now exactly the card's width.

**`width="full"` is untouched — proven, not assumed.** The `full` branch renders the identical
element tree it always did (same `px-14`, same `InsetHairline` default `mx-14`); the new wrapper is
inside a `width === "centered"` branch. Captured a titled `width="full"` subpage (Workspace → Student
Org Board → Settings — it exercises the header code path, which a titleless subpage would not) plus
the team home and the announcements root at 1440 before and after: **all three diff to zero pixels**,
and the settings header's four hairlines measure byte-identically (392/992, 392/992, 415/946,
392/992).

**`plan-tab.tsx`'s "New workspace" (maxWidth 820) changed as intended, and looks better.** It had the
same defect worse: title at x=128 under a 1256px rule, with its body starting at x=368 — a 240px
orphan. It now sits at x=366, directly above its own description and preset card, with the rules
spanning the 780px column. I looked at it; it reads as one page now instead of a header belonging to
a different one. So the fix is right at 820 as well as at 720 — this was a latent shell flaw the
open-groups design surfaced, not a special case.

**What it cost.** The header JSX is duplicated across the two branches (~14 lines) rather than
extracted, because hoisting it into a variable would have changed the `width="full"` render path and
I needed that path provably byte-identical. If a third width ever appears, extract it then. The
breadcrumb still sits at the content inset on centered pages — correct, and left alone: it is shell
topbar chrome above the header rule, not page content.

Consequential doc-comment updates: the `width` prop now documents that the header rides the column,
and the stale comment in `open-groups-view.tsx` (which asserted the rule "still spans the content
inset") was rewritten rather than left contradicting the code — the same discipline K2 demanded.

## Verification

- Type gate: `npx tsc --noEmit` clean. `npx eslint` clean on both touched TS files.
- Guards: `check-hex.sh` (93 < baseline 146 — no new hex), `check-chrome-title.sh`, `check-chat-avatar.sh` all pass.
- **Desktop @1440**: rendered live and inspected, plus computed-style measurement of every token, size, radius, padding, grid, role/tabindex/aria, and the hover + chevron transform. All match the table above.
- **Phone @390: pixel-identical to what ships today**, re-verified after the shell change too. Baseline captured before touching anything; final diff `bbox = None` — zero differing pixels. (The shell edit is structurally desktop-only — it lives entirely inside `{title && (<div className="hidden md:flex …">`.) (One real regression was caught this way: `text-wrap: pretty` had been applied unconditionally and rewrapped the phone description. Now `md:text-pretty`.)
- `npm run build`: **passes** (compiled successfully).
- `width="full"` regression: team settings (titled subpage, exercises the header path), team home and announcements root all diff to **zero pixels** at 1440, before vs after.
- `plan-tab` "New workspace" at 1440 captured before and after and inspected — changed deliberately, and better.
- Throwaway capture specs were deleted; nothing was added to `e2e/`.

**Sandbox note for whoever tests this:** the E2E sandbox (`fcbe3a1f-…`) now has 3 open groups with varied member counts — Board games night (3), Building A (4), Basketball (5) — and E2E Admin was removed from **Basketball** so the not-joined/Join state is reachable. Fixtures left in place. Path: Messages → "Open groups" row at the top of the chat panel.

## Trap worth knowing (dev only)

The slot's dev server serves a STALE `globals.css` until the next page request forces Turbopack's lazy CSS recompile — a `touch` alone does not do it. A new CSS rule silently does not exist in the browser, which reads as "my selector is wrong" and sent me hunting the wrong thing. Confirm a new rule by grepping `.next/dev/static/chunks/app_globals_css_*.single.css` after hitting a page, not by re-reading the source.
