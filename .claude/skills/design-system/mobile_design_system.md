# Central — Mobile Design System

The companion spec to `DESIGN_SYSTEM.md` for **phone-width surfaces** (≤430px). Canonical reference implementation: `explorations/mobile/v2/Mobile Prototype.html` ("Pocket Daybreak" direction, ratified July 2026). When a mobile decision isn't covered here, open that file and replicate — do not fall back to the desktop spec's layout rules.

---

## 0. Why this doc exists

The desktop spec describes a three-column workspace with breadcrumbs, sidebars, underline tab strips, and 44px page titles. **None of that exists on mobile.** Every past mobile failure came from smooshing the desktop shell into 430px: horizontally-scrolling tab strips, `← All workspaces` pills stacked on `← Team` pills stacked on tabs, calendar grids at phone width, 6-level headers before content.

**Mobile north star: "Glance and act."** Mobile Central is a pocket companion — check what's next, read the announcement, reply to the cell chat, tick a checklist item. Deep planning stays on dee gives every surface a *readable, thumb-reachable* form, not a miniaturized one.

What carries over from desktop unchanged: **voice (§0, §6), color meaning, type family (Bricolage Grotesque), plum-as-surgical-accent, restraint.** What this doc replaces: shell, navigation, headers, cards, and component sizes.

---

## 1. Foundation deltas from desktop

### 1.1 Surfaces — tonal, not hairline

Desktop separates cards from the page with 1px hairline borders on a shared cream. Mobile uses **tonal separation: borderless cards one cream-step darker than the page.** No borders, no shadows.

| Token | Hex | Use |
|---|---|---|
| `--cream` | `#FDFCF8` | Page background (body AND phone frame) |
| card surface | `#F3EDDF` | All cards, action tiles, ghost buttons, chips-off, search field |
| inset on card | `#E9E1CC` | Icon chips, tags, switch-off track, progress track — one step darker again |
| `--plum` | `#3E1540` | Hero card fill, primary buttons, active states, dots |
| `--plum2` | `#2D0F2E` | Pill nav bar f| `--ink` `#13101A` / `--body` `#5A5466` / `--muted` `#8A8497` / `--faint` `#A09A8C` | text steps, same as desktop |
| `--line3` | `#EFE9DA` | Row dividers *inside* cards — the only hairline on mobile |
| danger | `#A03B2E` | Destructive text/outline only |

**Do not:** put 1px borders around cards (desktop pattern). Do not use pure white. Do not add shadows except the pill nav's single ambient shadow.

### 1.2 Type scale (mobile tiers)

Same family (Bricolage Grotesque serif role + mono for eyebrows), compressed scale:

| Role | Size / weight | Use |
|---|---|---|
| Screen title | 22 / 600, -0.02em | In the chrome row — the ONLY title tier (20px when sharing the row with 2+ actions) |
| Card headline | 21 / 600 | Hero card, news card titles |
| Sub-headline | 18 / 600 | Workspace card names |
| Row title | 15 / 600 | List row primary text |
| Body | 14–15.5 / 400 | Reading text, inputs |
| Meta | 13 / 400, `--muted` | Secondary line in rows/cards |
| Time/stamp | 11 / 400, `--faint` | Timestamps |
| w | 10 mono, +1.4px, uppercase, `--muted` | Section labels — required above every section |
| Tag | 9 mono, +1px, uppercase | Role badges, count pills |

**No 28px+ type on mobile** except stat numbers (22 serif). The desktop 44px H1 tier does not exist here.

### 1.3 Shape & spacing
- Radii: 20 (cards, action tiles), 16 (search, stats, composer), 14 (icon chips), 999 (buttons, chips, nav, avatars, switches).
- Screen padding: 20px sides. Card padding: 18 (default), 20 (hero), `6px 18px` (cards holding rows).
- Section rhythm: eyebrow kicker at 24px above, card 10–14px below it.
- **Hit targets ≥44px** for all primary actions; 34px minimum for chrome icon buttons.

---

## 2. Shell

### 2.1 Anatomy of every screen
```
[ status bar 46px ]
[ chrome row: (back?) title ....... actions / avatar ]
[ .scroll — the one scrolling region, 110px bottom pad ]
[ floating pill nav, bottom 26px, overlaying scroll ]
```
- **One header row, ever.** The screen title lives IN the chrome row next to its actions. No bre no eyebrow-over-H1 block, no second header strip.
- **Chrome row contents:** optional back chevron (left, 34px, plum) · title (flex:1) · 0–2 icon actions · avatar (34px plum circle → Profile). Max two actions; more collapses to one.
- The scroll region is the only scrolling element; nav floats over it.

### 2.2 Floating pill nav
Dark plum (`--plum2`) rounded-full bar, centered, `bottom: 26px`, 4 tabs: **Home · News · Chats · Workspace**. Active tab = cream circle with plum icon. Single soft shadow (`0 10px 28px rgba(45,15,46,.35)`) — the one sanctioned shadow on mobile.

- Sub-screens keep their **parent tab highlighted** (a workspace detail screen still lights Workspace).
- Hidden on full-screen composers (e.g. New announcement).
- Profile and Directory are NOT tabs — reached via avatar (any screen) and the person icon on Chats.

### 2.3 Navigation model — hub-and-spoke, never tab strips
- Deep content = **push a new screen with a back chevron**, not a tab. Workspace → workspace hub →  four screens, each with one clear back.
- **Never a horizontally-scrolling tab strip.** If desktop has 6+ tabs (General / Meeting Notes / Events / Resources / Groups / Rotations), mobile renders them as a **grouped row list on the hub screen** — tappable rows with icon chip, name, one-line status, chevron.
- **2–3 exclusive filters** → segmented `fchip` pills row (Church | My chats; Reimbursements | Budget | Allocation). 4+ options or view navigation → separate screens or stacked sections instead.
- Back chevrons go one level up the hierarchy (event → hub → list), not browser-history.

---

## 3. Components

### 3.1 Cards
- **Standard card:** `#F3EDDF`, radius 20, no border. Full-width block. Tappable cards are `<button>` with left-aligned text.
- **Row-list card:** standard card at `padding: 6px 18px` holding `.row` items divided by 1px `--line3` (none on last).
- **Hero card (plum):** `--plum` fill, cream text, translucent-cream meta (`rgba(253,252,248,.6–.68)`). **At most ONE per screen** event on Home, the current event on a workspace hub. Buttons inside invert: primary = cream bg / plum text; quiet = `rgba(253,252,248,.14)` cream text. Progress bars on plum: track `rgba(253,252,248,.2)`, fill cream.
- **Stat card:** `#F3EDDF`, radius 16, mono eyebrow (9px) + serif 22/600 number + 11.5px muted sub-label. Stack vertically or `grid2`; never desktop's 40px numbers.

### 3.2 List row
`flex, gap 12, padding 13px 0`: optional 40px icon chip (radius 14, `#E9E1CC`, plum initial; `.solid` = plum bg/cream) · text block (15/600 title + 13 muted one-line-ellipsis sub) · right meta (11px time, 8px plum unread dot, or chevron `--faint`). Rows are the universal list unit — chats, announcements-on-home, directory members, hub sections, checklist tasks.

### 3.3 Buttons
- **Primary:** plum fill, cream text, radius 999, min-height 42 (36 compact in chrome), 13.5/600.
- **Quiet:** cream (`--cream`) fill on cards / `#F3EDDF` on page, plum text.
- **Ghost icon:** 34px circle, `#F3EDDF`, for chrome actions. um-filled variant marks the screen's single create action (the "+" on News).
- **Destructive:** outline `rgba(160,59,46,.35)`, text `#A03B2E`, never filled.
- **Dashed add:** full-width dashed 1.5px border, radius 20, plum label — "Add workspace", attachment slots.
- One plum-filled action per screen (hero primary OR chrome create, not both fighting).

### 3.4 Segmented filter chips (`fchip`)
Radius-999 pills: off = `#F3EDDF` bg / `--body`; on = plum fill / cream / 600. Used for exclusive filters (≤3 short options) and multi-select audience pickers on compose. *(Mobile keeps the solid-plum on-state — the tonal surfaces need the stronger signal; the desktop plum-tint grammar reads as unselected here.)*

### 3.5 Sections (`sect` / kicker)
- **Kicker:** eyebrow (+ optional quiet "See all ›" 12.5px muted) above each card group.
- **Form sections:** 1px `--line3` top border, 18px top margin, eyebrow, then controls — compose screen pattern.

### 3.6 Form controls
- **Headline input:** borderless serif 2age bg. **Body textarea:** borderless serif 15.5/1.55, min-height 170. (Mobile compose = single column; desktop's 320px settings rail becomes stacked `sect` groups below the body.)
- **Switch:** 46×28 track (`#E9E1CC` → plum), 22px cream thumb, paired 14.5/600 label + 13 muted description.
- **Checkbox:** 22px, radius 7, 1.5px line border → plum fill + cream check. Whole row is the tap target.
- **Search:** `#F3EDDF` pill, radius 16, 12×16 padding, icon + borderless input.

### 3.7 Tags & badges
Mono 9px uppercase radius-999: default `#E9E1CC`/`--body` ("You", counts); plum fill/cream for roles (Super, Pastor). Count pills on phase headers use the same treatment.

### 3.8 Empty / placeholder
Dashed 1.5px card, radius 20, centered: stroked icon, 13.5 body-weight title, 12.5 muted sentence. Copy is descriptive, may name the create action, never contains the button (same rule as desktop §4.19).

### 3.9 Carousel
Horizontal scroll-snap row breaking out of screen padding (`margin: 0 -20px; padding: 0 20pxds at 82% width. For peer content of the same kind (upcoming events). Never for navigation.

---

## 4. Screen recipes

- **Home:** date eyebrow → hero carousel → kickered previews (Announcements, Chats — 2 rows each + See all) → Quick action grid (`grid2` tiles) → verse (italic 15 serif, centered, mono ref). Home is a digest of every tab; each block links into its tab.
- **Feed (News):** filter chips → stack of full-width cards (eyebrow · 21px headline · 2-line body · optional RSVP row). Create = plum ghost "+" in chrome → full-screen compose.
- **Compose (full-screen):** chrome = back + title + Save draft (quiet) + Publish (primary, compact); nav hidden; headline input, body textarea, then `sect` groups (audience chips, switches, attachment, form).
- **Chats:** segmented Church | My chats. Church = room groups (Whole church / Cells / Serve teams per the chat model), each with an eyebrow + inline "+" (leader-only create). My chats = flat row card, single "+" on the filter row. Directory vichrome.
- **Workspace (hub-and-spoke):** list screen (Your workspaces / view-only cards) → hub screen (hero current event + grouped section rows) → detail screens (event: facts grid + readiness + jump-into-planning rows; checklist: phase-grouped tap-to-toggle rows). Desktop's tab strips ALWAYS become hub rows.
- **Profile:** identity card (56px avatar, name, email, role tag, Edit) → shared details → journal rows → danger zone (`sect` with red eyebrow, outline Leave + quiet Sign out).

**Facts grid** (event detail): 2-col `auto 1fr` grid, mono 9.5px keys + 14/500 values, unset = `—` faint. Replaces desktop's identity header fact list.

---

## 5. Do not (mobile-specific)

1. **No desktop shell parts:** no breadcrumbs, no sidebar, no icon rail, no verse-in-sidebar (verse lives on Home), no ⌘K search.
2. **No horizontally-scrolling tab strips.** The #1 legacy failure. Hub rows or segmented chips instead.
3. **No stacked back-pills** (`← All workspaces` + `← Team`). One back chevron in the chrdles the rest.
4. **No calendar grids at phone width.** Agenda lists / "up next" cards instead.
5. **No hairline-bordered white/cream cards** — tonal `#F3EDDF` only.
6. **No two-header screens** (title block below a chrome row). Title lives in the chrome.
7. **No desktop type sizes.** 22px max chrome, 21px max in-card.
8. **No tables.** Every table becomes a row list (Allocation categories → rows with meta line).
9. **No hover-dependent affordances.** Everything discoverable by sight or tap.
10. Everything in desktop §8 still applies where relevant (no gradients, no drop shadows beyond the nav, no traffic-light hexes, no emoji icons, no window.confirm, weight 600 for headings only).

---

## 6. Checklist — "is this Central mobile?"

- [ ] One chrome row, title inside it, avatar → profile?
- [ ] Tonal borderless cards on `--cream`?
- [ ] Floating plum pill nav with parent tab lit on sub-screens?
- [ ] Deep content pushed as screens with back chevrons — zero tab strips?
- [ ] Mono eyebrow above eve
- [ ] ≤1 plum hero card and ≤1 plum-filled action per screen?
- [ ] All primary tap targets ≥44px?
- [ ] Desktop content translated (hub rows, agenda lists, row lists) — not shrunk?

If any box is unchecked, it's a desktop smoosh — go back.
