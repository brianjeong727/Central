# Central Design Contract Card — desktop (≥768px)

> The load-bearing core of `web_design_system.md`, sized to be read on every UI task.
> This card is sufficient for edits to existing surfaces. For NET-NEW components or
> anything in the routing table at the bottom, read the named section of the full doc.
> Phone-width (`md:hidden`, ≤430px) surfaces are governed by `mobile_design_system.md`
> instead — never apply this card to mobile surfaces.
> This card DISTILLS the full doc; it never diverges from it. If they conflict, the
> full doc wins — and flag the drift.

## North star

**"Reverent, not corporate. Warm, not cute. Calm, not playful."**
Quiet by default: cream and ink everywhere; plum is a surgical accent (1–2 moments per view, never a surface/fill/background). Whitespace over density. Built for small-to-medium ministries — don't design for unbounded scale (§0).

## Color tokens (consume via `var(--token)` from `app/globals.css` — never raw hex)

| Token | Hex | Use |
|---|---|---|
| `--plum` | `#3E1540` | THE accent: active borders, monogram chips, tab underline, focus ring, primary CTA fill |
| `--plum-2` | `#2D0F2E` | Active breadcrumb, rail chrome (`--rail`) — not a button fill |
| `--plum-tint` | plum 12% mix | The ONLY light-plum surface: selected states (chips, segments, cards, nav rows), identity badges. Not status pills |
| `--ink` / `--body` / `--muted-text` / `--faint` | `#13101A` / `#474251` / `#6E687B` / `#8E8777` | Text hierarchy: primary / body / tertiary+eyebrows / **non-text** (placeholders, disabled, arrows, dashed glyphs). All three lower tiers retuned 2026-08-01 for WCAG AA — **18.32 / 9.44 / 5.21 / 3.48:1** on `--cream`, and each stays ≥1.8:1 from its neighbour. **`--faint` does not meet AA for prose** — anything a user must read uses `--muted-text` or `--body`. Placeholders are the one sanctioned `--faint` text use (§327: quiet guidance, replaced by the user's own input). |
| `--cream` | `#FDFCF8` | Primary surface (page, cards). Also the Messages panel (intentional exception) |
| `--cream-panel` | `#FBF8F2` | Cards / panels / dropdowns / modals |
| `--cream-on-dark` | `#F6F4EF` | Cream text/fill on plum or dark |
| `--cream-2` / `--cream-3` | `#F8F4EA` / `#F6F2E8` | Inset surface (composer) / accent surface (verse callout, today cell) |
| `--body-bg` | `#F4F1E8` | Desktop context sidebar panel (chat panel excepted → `--cream`) |
| `--ivory` | `#F1ECDE` | Soft pills; the single most prominent inset card (Up Next); also `--canvas` |
| `--line` / `--line-2` / `--line-3` | `#E8E2D2` / `#E2DDCF` / `#EFE9DA` | Hairline / card+input border / faint row divider |
| `--dashed` | `#C4C0B0` | Dashed placeholder borders |
| `--success` / `--gold` / `--danger` | `#7FA67F` / `#D4A45C` / `#9F3030` | Status-pill accents (ok / pending / danger). Danger = text+border only, never a fill (danger-solid confirm exempted) |
| `--warm-tan` / `--sage` | `#9D7B4F` / `#5B7A6C` | Calendar categories (social / outreach) |
| `--veil` / `--veil-soft` | ink 55% / 40% mix | Modal scrim / lighter non-modal scrim |

Never: pure white, invented neutrals, saturated traffic-light status colors, gradients (hero is retired from shell), `rgba()` (use `color-mix` over a token).

## Typography — Bricolage Grotesque only, one family

- **Two title tiers only:** 44px display H1 (landing **and event detail**) / 25px compact (all other workspace + detail headers). Section H2 28–36. All serif-role, weight 600, -0.02em. The 36px tier stays retired.
- **Weight 600 = heading hierarchy only** (H1/H2/display + the scoped date-anchor exception + the L3 ruled section label). Everything else — body, UI chrome, card titles in lists, tab labels, metadata — weight 400 (H3 card titles 500). Never 700/`font-bold`.
- **Mono eyebrow (11px, tracking 1.4, all-caps) is REQUIRED above every page H1 and section H2** — use `EYEBROW_STYLE` from `components/central/typography.ts`. **Two exemptions:** compact workspace/detail headers (§3.1), and the L3 ruled section label below.
- **L3 ruled section label** (`EventSectionHeader`, event workspace): sans **17/600** `--ink` + optional leading count pill / mono `meta` + a **`flex:1` hairline** + optional trailing mono state + action. **Takes no eyebrow.** `InsetHairline` cannot substitute — that is a standalone full-width rule, not a flex filler. **L4** sub-groups (`NightDivider`): sans **14/600 `--ink`**, same trailing rule, mono date/count `--muted-text`. L4 is subordinate to L3 by SIZE, not colour — **a group header must never be quieter than the rows it contains.**
- **Weight-600 budget counts ROLES, not nodes.** Four on an event pane: L1 title, active tab, L3 label, L4 divider. Repeating one role down a page is rhythm; a fifth role collapses the hierarchy.
- **Mono metrics are mixed case** — `MONO_METRIC_STYLE` (11px, tracking 0.5) for values ("12 days", "5 of 5 done"). `EYEBROW_STYLE`/`MONO_STYLE` stay uppercase; they are labels, not values.
- Long-form bodies (announcements, notes, chat) read in serif 17–19px. Stat numbers are serif weight 400 (not bold sans).
- Integer font sizes only, floor 10px (9px rail label is the one exception).

## Spacing, radius, lines

- **Spacing scale:** 4, 6, 8, 10, 12, 14, 18, 22, 28, 36, 40, 56 — no in-between values.
- **Radii:** 6 icon-buttons · 8 chips · 10 inputs/secondary buttons · 12 cards · 14 prominent cards · 16 composer · 18 hero/full-bleed modal.
- **Hairlines always 1px** (`--line` palette). The only >1px rules: 2px active-tab underline, 3px plum left bar on active nav rows.
- **No drop shadows anywhere.** Modals separate via the ink veil. Only carve-outs: read-only-mat inset texture, functional inset selection rings.
- **Motion durations are tokens, never inline ms:** `--dur-fast` (120ms) for colour/tint/border changes — hovers, presses, focus. `--dur-layout` (240ms) for anything changing SIZE or POSITION — a rail collapsing, a panel expanding; `--dur-fast` reads as a jump over 300px+ of travel. Pair with `--ease-out`. Respect `prefers-reduced-motion`.

## Action placement — one home per button type (§3.2)

The object header (by the page title) carries **only object config**: normally the Settings gear, plus — where the object's primary config verb isn't "settings" — **one labeled Zone-B action** (e.g. "Edit event"); kebab at 3+. **Creates NEVER sit by the page title** — every create/add/generate is a plum primary in the **body content header** of the collection it fills (`ContentHeader`/`SectionHeader` + `ContentActionButton`). View toggles / list helpers are ghost buttons to the create's LEFT. Kebab = low-frequency/destructive/per-row only. No single-feed exception (R1/R2).

**Add controls must name the list they land in (§11.13):** collection is **grouped** → an `InlineAddRow` at the foot of **each group** ("Add a block to Game Day"), never one control for the whole section. **Not grouped** → the create rides the section rule as a plum `ContentActionButton`. **Empty group** → compact italic empty line above that group's own `InlineAddRow` — the control does NOT change shape just because the group is empty. **Whole collection empty** → the dashed `InlineAddCard`; that is the only place the dashed variant belongs. (Design repeating patterns against worst realistic density: an empty-group dashed card looks fine once and terrible five times.)

## Hard "do nots" (each is a HARD STOP — resolve before writing code)

1. No modal for navigation — opening an existing entity navigates to a page. Modals are for creation/config only; long-form creation (announcements) is full-page, not modal.
2. No pill / boxed / segmented tabs for view navigation — underline tabs only. `SegmentedControl` is for exclusive filters/modes only; never mix the two roles.
3. No white surfaces, no white cards — cream. Never invert cream bg `#FDFCF8` / canvas `#F1ECDE`.
4. No new tab-strip implementations — `PlanSubTabStrip` only (placement: Convention #16).
5. No raw hex / `rgba()` / invented neutrals — tokens only (the hex ratchet blocks increases).
6. No weight 600 on body/UI text; no 700 anywhere; no all-caps outside mono eyebrows.
7. No emoji as iconography — stroked `PlanLineIcon` glyphs via `teamIconKey(team)`; never render raw `teams.icon` (legacy emoji column). Emoji survive only in event-type badges and the chat emoji picker.
8. No page without a mono eyebrow above its H1 — **two exceptions, both title-only by rule §3.1**: compact workspace headers, and the **44px event-detail header** (its meta line carries the context an eyebrow would, ratified 2026-08-01).
9. No left-border rounded callout cards (quote §4.13, timeline §4.12, and the Events Up-Next card are the only sanctioned left-rules).
10. No `window.confirm` — destructive actions go through `ConfirmDialog`; deletes always confirm.
11. No hand-rolled dropdown/kebab menus — shared `ActionMenu` only (Convention #20).
12. Verse callout in the sidebar is permanent brand — never remove it.
13. No fixed-width column stranded in a wide content area — cap width only for reading measure (§7.0).

## Pre-ship checklist ("is this Central?")

Cream not white · eyebrow above titles · serif title at correct tier · underline tabs · plum only as accent · 1px cream-palette dividers · no modal-where-navigation · no shadows · verse callout intact.

## Routing table — when to open the full `web_design_system.md`

| Task touches… | Read |
|---|---|
| Shell, sidebar, rail, breadcrumbs, header search | §2 |
| Page/workspace header anatomy, title tiers | §3 + §5 |
| A specific component (tabs, buttons, cards, stat card, pills, avatars, calendar, chat bubble, composer, modal, subpage, empty state, danger zone, agenda, read-only mat) | the matching §4.x |
| Page-level layout (identity / list / form / editorial / settings / auth / wizard / landing) | §7.x |
| Writing net-new components or a new page from scratch | §11 snippets + §13 starter template |
| Deletion flows | §14 |
| Anything this card doesn't settle | the relevant full-doc section — the card is a summary, not a replacement |
