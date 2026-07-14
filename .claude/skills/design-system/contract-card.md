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
| `--ink` / `--body` / `--muted` / `--faint` | `#13101A` / `#5A5466` / `#8A8497` / `#A09A8C` | Text hierarchy: primary / body / tertiary+eyebrows / disabled+timestamps |
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

- **Two title tiers only:** 44px landing H1 / 25px compact (all workspace + detail headers). Section H2 28–36. All serif-role, weight 600, -0.02em.
- **Weight 600 = heading hierarchy only** (H1/H2/display + the scoped date-anchor exception). Everything else — body, UI chrome, card titles in lists, tab labels, metadata — weight 400 (H3 card titles 500). Never 700/`font-bold`.
- **Mono eyebrow (11px, tracking 1.4, all-caps) is REQUIRED above every page H1 and section H2** — use `EYEBROW_STYLE` from `components/central/typography.ts`.
- Long-form bodies (announcements, notes, chat) read in serif 17–19px. Stat numbers are serif weight 400 (not bold sans).
- Integer font sizes only, floor 10px (9px rail label is the one exception).

## Spacing, radius, lines

- **Spacing scale:** 4, 6, 8, 10, 12, 14, 18, 22, 28, 36, 40, 56 — no in-between values.
- **Radii:** 6 icon-buttons · 8 chips · 10 inputs/secondary buttons · 12 cards · 14 prominent cards · 16 composer · 18 hero/full-bleed modal.
- **Hairlines always 1px** (`--line` palette). The only >1px rules: 2px active-tab underline, 3px plum left bar on active nav rows.
- **No drop shadows anywhere.** Modals separate via the ink veil. Only carve-outs: read-only-mat inset texture, functional inset selection rings.

## Action placement — one home per button type (§3.2)

The object header (by the page title) carries **only object config**: the Settings gear (kebab at 3+ actions). **Creates NEVER sit by the page title** — every create/add/generate is a plum primary in the **body content header** of the collection it fills (`ContentHeader`/`SectionHeader` + `ContentActionButton`). View toggles / list helpers are ghost buttons to the create's LEFT. Kebab = low-frequency/destructive/per-row only. No single-feed exception (R1/R2).

## Hard "do nots" (each is a HARD STOP — resolve before writing code)

1. No modal for navigation — opening an existing entity navigates to a page. Modals are for creation/config only; long-form creation (announcements) is full-page, not modal.
2. No pill / boxed / segmented tabs for view navigation — underline tabs only. `SegmentedControl` is for exclusive filters/modes only; never mix the two roles.
3. No white surfaces, no white cards — cream. Never invert cream bg `#FDFCF8` / canvas `#F1ECDE`.
4. No new tab-strip implementations — `PlanSubTabStrip` only (placement: Convention #16).
5. No raw hex / `rgba()` / invented neutrals — tokens only (the hex ratchet blocks increases).
6. No weight 600 on body/UI text; no 700 anywhere; no all-caps outside mono eyebrows.
7. No emoji as iconography — stroked `PlanLineIcon` glyphs via `teamIconKey(team)`; never render raw `teams.icon` (legacy emoji column). Emoji survive only in event-type badges and the chat emoji picker.
8. No page without a mono eyebrow above its H1 (compact workspace headers excepted — they are title-only by rule §3.1).
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
