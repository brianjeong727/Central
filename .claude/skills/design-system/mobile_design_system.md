# Central — Mobile Design System v2 ("Pocket Daybreak, ratified")

The companion contract to `web_design_system.md` for **phone-width surfaces** (`md:hidden`, ≤430px). Supersedes the v1 mobile spec. Same DNA — cream surfaces, Bricolage Grotesque, plum as a surgical accent, tonal borderless cards — with every v1 open item ruled and every drift pattern in the shipped build corrected.

Reconciled for adoption from the cdesign source ("Pocket Daybreak v2") against the live codebase (2026-07-23). Where a value below differs from the raw cdesign prototype, the codebase value wins — those are noted inline as SNAP corrections.

**Mobile north star: "Glance and act."** Mobile Central is a pocket companion — check what's next, read the announcement, reply to the cell chat, tick a checklist item. Deep planning stays on desktop. Every surface gets a *readable, thumb-reachable* form, not a miniaturized desktop one. When a mobile decision isn't covered here, replicate the ratified prototype — never fall back to the desktop shell's layout rules.

---

## 0. Rulings on v1 open items

1. **Home card language — RULED: tonal borderless.** Home uses the same `--ivory` borderless cards as every other screen. The `--cream-panel` + hairline-border treatment is retired **on mobile** (desktop keeps `--cream-panel`; the web contract is unchanged). One card grammar, no exceptions.
2. **Calendar at phone width — RULED: improved month grid.** A compact month grid is allowed (it earns its place for planners) but only in this form: 7-col grid, 40px day cells, event days marked with a 5px plum dot (never text inside cells), selected day = plum circle, and a **day agenda list directly below the grid** that updates on tap. Event titles never render inside grid cells.
3. **Back navigation — RULED: one chrome chevron, ever.** No back-pills, no stacked returns. The chevron goes one level up the hierarchy.

---

## 1. Corrections to the shipped build (drift the prototype fixes)

- **No two-header screens.** Forms, Network, Give, Directory, Profile, and Church Settings shipped an eyebrow + 34–40px page title *below* the chrome. Corrected: the screen title lives in the single chrome row (22/600), full stop.
- **Empty states** use the quiet form: 52px ivory chip with a stroked icon, 15/500 title, 13 muted sentence. Copy is descriptive ("No forms yet. Create one and attach it to an announcement."), never "Nothing here yet". Reuse `EmptyState variant="quiet"` (`app/home/components/shared.tsx`) — do NOT build a parallel mobile empty-state component.
- **Meeting-notes list header** shipped title + search + create fighting in one row and wrapping. Corrected: title row (title + plum "+"), search field on its own line below.
- **Event Overview cards** shipped one-word-per-line wrapping. Corrected: row layout = icon chip · text block (flex:1) · meta · chevron; meta never squeezes the title column.
- **Facts grid** is a true 2-col `auto 1fr` grid (mono 9.5px keys, 14/500 values), replacing the loose label/value rows on event detail.
- **Disabled primary** = plum at 45% opacity (the shipped washed-lilac reads as a secondary style).
- **Danger zone** is a section with a red mono eyebrow and outline-only destructive buttons — never filled red.

---

## 2. Foundation

### Terminology

- **"serif"** in this doc ≡ `var(--serif)`, which resolves to **Bricolage Grotesque** in its display role (`app/globals.css`). There is NO second typeface on mobile — "serif" names the display voice (larger sizes, tighter tracking, 600 weight), never an actual serif font.
- **muted text** ≡ `var(--muted-text)` (`#8A8497`). Never `var(--muted)` — that is the shadcn ivory **surface** alias.

### Tokens (all live in `app/globals.css` — never inline a hex on mobile)

| Token | Value | Role |
|---|---|---|
| `--cream` | `#FDFCF8` | page background |
| `--ivory` | `#F1ECDE` | cards, quiet buttons on page, chips-off |
| `--pocket-track` | `#E9E1CC` | **mobile chip / progress-track / icon-chip FILL** (warmer than `--line-2`; the Pocket surfaces repoint here) |
| `--line-2` | `#E2DDCF` | hairline / stroke / drag-pill / tag outline (border use, NOT fill) |
| `--line-3` | `#EFE9DA` | in-card dividers (the only in-card hairline) |
| `--plum` | `#3E1540` | accent, hero, active fchip, filled create |
| `--plum-2` | `#2D0F2E` | floating nav pill |
| `--ink` | `#13101A` | primary text, reading bodies |
| `--body` | `#5A5466` | secondary text |
| `--muted-text` | `#8A8497` | meta, kickers |
| `--faint` | `#A09A8C` | stamps, placeholders, unset `—` |
| `--danger` | `#9F3030` | destructive **text/outline only**, never a fill (shipped value kept; v2's `#A03B2E` amended down) |
| `--sage` | `#5B7A6C` | "online" presence dot (shipped value kept; v2's `#5F7A5A` amended) |
| `--gold` | `#D4A45C` | readiness "needs-attention" dot (desktop readiness parity) |
| `--veil` | `≡ rgba(19,16,26,.55)` | sheet / modal ink backdrop |
| `--cream-on-dark` | `#F6F4EF` | cream text/fill on plum surfaces |

### Type (Bricolage Grotesque only)

chrome title 22/600 (20 when sharing the row with 2 actions) · card headline 21/600 · sub-headline 18/600 · row title 15/600 · body 14–15.5/400 · meta 13 muted · stamp 11 faint · **kicker 10 mono +1.4px uppercase muted** above every section · tag 9 mono +1px uppercase. Reading bodies (announcement detail, chat) 15.5–17 serif. **Stat numbers 22 serif 600** (mobile carve-out — desktop numeric serif is 400; ratified for mobile).

### Shape & spacing

radius: `--r-pocket` 20 cards · `--r-pocket-sm` 16 search/stats/composer · `--r-callout` 14 icon chips · 12 grid day cells · `--r-check` 7 checkbox · 999 pills/nav/avatars. Screen padding 20. Card padding 18 (20 hero, 6×18 row-cards). Hit targets ≥44 (34 chrome icons — ratified exception).

---

## 3. Shell

```
[ safe-area top ]
[ chrome row: (chevron) title ....... 0–2 actions · avatar ]
[ .scroll — sole scroll region, ~120px bottom pad ]
[ floating plum pill nav — hidden on composers, chat screen, sheets ]
```

- **Nav:** 4 tabs — Home · Chats · Announcements (bell) · Workspace (clipboard). Active = cream circle + plum icon. Parent tab stays lit on every pushed screen. `--shadow-nav` is the **one** ambient shadow allowed anywhere on mobile.
- **Avatar** (34 plum circle) sits in the chrome on tab roots → Profile. Sub-screens drop the avatar and show the back chevron instead.
- **Full-bleed subpages** replace the parent screen entirely; their own chrome is the only header. Every navigation resets scroll to top.
- **Single chrome-row header — no two-header screens.** A screen title never appears twice.
- **Hub-and-spoke:** desktop tab strips become **hub rows** (icon chip · 15/600 title · 13 muted status · chevron) grouped under kickers. Exclusive filters ≤3 → segmented `fchip` pills; 4+ → screens.
- **Chrome-row "+" creates are a mobile carve-out from desktop Convention #15.** On mobile the screen's single create is a plum-filled ghost in the chrome row (or a body plum "+" for list headers). The desktop "creates never live in the header" rule does NOT govern mobile.

---

## 4. Components (the Pocket family)

All mobile primitives are named `Pocket*` and live in `components/central/pocket.tsx` (leaf — no `app/` imports) with the chrome-row composers (`PocketHeader`, `PocketChrome`) in `app/home/components/pocket-header.tsx`. **Do not create a `components/central/mobile/` directory or a `Mobile*` family** — extend the Pocket family. Desktop primitives (`FilterChip`, `SegmentedControl`, bordered `CentralCard`) are NOT reused on mobile.

### Component inventory

| Role | Component | Status |
|---|---|---|
| Chrome row (0–2 actions, avatar, back chevron) | `PocketChrome` | shipped (+ v2 `action2`/`back`/`hideAvatar` slots) |
| Home brand chrome | `PocketHeader` | shipped |
| Tonal card / row-card | `PocketCard` / `PocketRowCard` | shipped |
| Universal list row | `PocketRow` | shipped |
| Section kicker | `PocketKicker` / `POCKET_KICKER_STYLE` | shipped |
| Exclusive-filter pill | `PocketFilterChip` | shipped |
| Filter chip rail wrapper | `PocketFilterChipRow` | **new** |
| Plum hero (≤1/screen) | `PocketHeroCard` | shipped |
| Progress bar | `PocketProgress` | shipped |
| Dashed add-affordance | `PocketDashedButton` | shipped |
| 40px icon/monogram chip | `PocketChip` | shipped (radius tokenized `--r-callout`) |
| 34px round chrome action | `PocketRoundButton` | shipped |
| Up-next carousel | `PocketUpNext` | shipped |
| Back-row ("← Section") | `PocketBackRow` | shipped |
| Pill nav | `BottomNav` (`components/ui/bottom-nav.tsx`) | shipped |
| Empty state | `EmptyState variant="quiet"` | reuse (not Pocket) |
| Bottom sheet | `PocketSheet` | **new** |
| Pill button (primary/quiet/destructiveOutline) | `PocketButton` | **new** |
| Facts grid | `PocketFactsGrid` | **new** |
| Stat card | `PocketStatCard` | **new** |
| Settings switch 46×28 | `PocketSwitch` | **new** |
| Search field | `PocketSearchField` | **new** |
| Mono 9px tag | `PocketTag` | **new** |

### Component contracts

- **Card** — ivory `--r-pocket` (20) borderless; **row-card** `6px 18px` with `--line-3` dividers. **Hero** plum, cream text, ≤1/screen; hero buttons invert (cream/plum primary, `rgba(cream,.14)` quiet).
- **Row** — flex gap 12, pad 13 0; 40px icon chip `--r-callout` (14) filled `--pocket-track` (plum stroke icon or initial; `.solid` → plum/cream); title 15/600 + 13 muted 1-line-ellipsis sub; right column = 11 faint meta / 8px plum unread dot / faint chevron. Meta never squeezes the title column.
- **Buttons** (`PocketButton`) — pill r999, minHeight 42 (36 compact for the chrome row), 13.5/600. Variants: **primary** plum/cream (disabled = 45% opacity plum, never washed-lilac); **quiet** plum text on a tonal fill — `surface="card"` → cream fill, `surface="page"` → ivory fill; **destructiveOutline** = 1.5px `--danger` border + danger text on transparent, NEVER filled. Ghost-icon creates use `PocketRoundButton variant="plum"` (the screen's ONE plum-filled create).
- **fchip** (`PocketFilterChip`) — r999, off ivory/body, **on solid plum/cream/600** (mobile carve-out; desktop segmented controls do not fill). Wrap ≤3 exclusive options in `PocketFilterChipRow`; 4+ options become screens.
- **Forms** — label = kicker; input ivory `--r-pocket-sm` (16) pad 14×16 borderless 15.5; headline input serif 21/600 on the page bg. **Switch** (`PocketSwitch`) 46×28, `--pocket-track` off → plum on, 22px cream thumb, ≥44 hit box. Checkbox 22 `--r-check` (7) 1.5px → plum. **Search** (`PocketSearchField`) ivory pill r16, leading search glyph + borderless input, faint placeholder.
- **Tags** (`PocketTag`) — mono 9 uppercase r999. `default` = `--pocket-track` bg / body text; `role` = plum/cream (ADMIN, LEADER); `outline` = 1px `--line-2` border for VISITOR.
- **Stat card** (`PocketStatCard`) — ivory r16, mono 9 kicker, serif 22/600 number, 11.5 muted sub.
- **Facts grid** (`PocketFactsGrid`) — 2-col `auto 1fr`, rows gap 12; keys mono 9.5 uppercase muted; values 14/500 ink; unset value = `—` faint.
- **Progress** (`PocketProgress`) — 4px track `--pocket-track`, plum fill; `onPlum` → track `rgba(cream,.2)`, cream fill.
- **Empty state** — centered, 52px ivory chip r16 + stroked icon, 15/500 title, 13 muted descriptive sentence. Dashed border is reserved for add-affordances (`PocketDashedButton`), never empty states.
- **Sheet** (`PocketSheet`) — creation/config only (poll composer, new-event picker). Ink `--veil` backdrop, cream panel `--r-pocket` top corners, 40×4 drag pill (`--line-2`), title 21/600 + 34px ivory close circle, safe-area bottom padding. **z = 200 (modal tier)** — pass `zIndex` (e.g. 210) only to stack over an already-open modal. Animation: `sheetUp` 240ms `cubic-bezier(0.23,1,0.32,1)` + veil fade 180ms, both suppressed under `prefers-reduced-motion`. Closes on Escape and veil tap. This is a NEW pattern — it does NOT replace `ActionMenu` (Convention #20) for dropdowns/kebabs.
- **Chat** — date chip mono 11 italic; incoming = ivory bubble r18 (4 at the tail) + 26px avatar + name/time row; outgoing = plum bubble, cream text, right. Composer = attach ghost · GIF pill · poll ghost · ivory pill input · 44px plum send circle.
- **Month grid** — ruled form only (see §0.2).
- **Carousel** (`PocketUpNext`) — scroll-snap, -20px bleed, 82% cards, dots (plum active). Manual only.

---

## 5. Screen recipes (deltas from v1)

- **Home** — chrome = ring-cross + ministry name + avatar → date kicker → setup-checklist card (dismissible, admin) → FEATURED kicker + hero carousel → serif 19/600 "Announcements"/"Chats" digests (2 rows + See all) → quick grid (Give + first team) → verse card (ivory, italic serif 17, mono ref).
- **Announcements** — title chrome + plum "+" ghost · fchips All/Events/Updates · full-width cards (kicker date · 21 headline · 2-line body · RSVP pill + count). Detail: body serif 17, EVENT facts card, RSVP primary + going chips, POSTED card. Compose: full-screen, nav hidden, Save-draft quiet + Publish primary (compact), headline input, body textarea, AUDIENCE chips, OPTIONS switch, ATTACHMENT dashed, FORM note.
- **Chats** — Church|My-chats fchips; Church = kicker groups (GENERAL/GROUPS/TEAMS) each with a leader "+"; rows show pin/mute glyphs + unread dot. Chat screen: no nav; header back + 40 avatar + name + members + search/settings ghosts. Settings: single "Chat settings" chrome; members row-card with role tags; prefs switches; footnotes 13 muted.
- **Workspace** — tab root = workspace list (optional hero current-event card) → team hub (PLANNING: Events/Meeting notes/Calendar · MINISTRY: Resources/Groups/Rotations) → detail screens. Events list: title + season ghost + New-event primary; date-chip rows. New event = sheet with template cards (emoji 28 + 15/600 + 12.5 muted) + dashed start-from-scratch. Event detail: facts grid → readiness bar → JUMP-INTO-PLANNING hub rows (Overview/Countdown/Roles & Leads/Showtime with live meta). Countdown: progress header, phase kickers, tap-to-toggle checkbox rows + assignee tag. Meeting notes: title + plum "+", search below, rows. Note detail: date kicker + attendee/link dashed chips, serif 26 title, AGENDA/DECISIONS/NOTES sections with + rows. Calendar: ruled month grid + day agenda. Resources: President|Member fchips, role card (serif intro + RESPONSIBILITIES bullets), RELEVANT LINKS + add. Groups: saved-grouping card → detail with group cards (name + count tag + member rows). Rotations: semester pill, kicker + "n of 7 filled" tag, progress, slot rows (SUN date / holder or ⊕ Open; your slot = plum outline + solid chip). Team settings: Roles cards w/ permission chips, Leadership switches, Members rows + role dropdown, danger row.
- **Directory** (via person ghost on Chats) — search, count kicker, rows (avatar + online dot, role tag, class, chevron). Member: identity card (56 avatar, LEADER tag, class, Send-Message primary + kebab) → CONTACT facts card.
- **Give** — single chrome; verse kicker; OFFERING card = recipient + Zelle fields + Save primary; member view = recipient card + copy.
- **Profile** — identity card (56 avatar, name 21, role tag, email 13, Edit quiet) → ABOUT/FAITH/PRAYER cards (or quiet empty) → NOTIFICATIONS switch rows + Smart select → ACCOUNT & SUPPORT rows → Sign-out quiet → DANGER ZONE red kicker, outline Leave + Delete. Edit: Cancel/Save chrome, kicker field groups, OPTIONAL tags.
- **Church Settings** (admin, via Home gear) — hub kickers MINISTRY/OPERATIONS/RECORDS with 8 rows. Subpages single chrome ("← Settings" + title): General (identity card, discovery switch, schools, offering); People (fchips w/ counts, search, member rows + role pills + kebab); Governance (master-switch card, TEAM ACCESS legend, per-team None|View|Write segmented); Automations (2-col switch cards); Chat moderation (master switch, BEHAVIOR/STRICTNESS/SCOPE fchip groups + explainer sentences); Reports (empty shield state); Workspace (invite-code card + copy/regenerate, calendar-sync card, funding); Audit log (dashed empty or stamp rows).
- **Forms** — single chrome + plum "+", empty state or rows.
- **Network** — single chrome, COMING SOON card (icon ring, kicker, 21 headline, body).
- **Auth** — landing = brand row, verse kicker + serif 34 quote hero, body, Register primary, "Why we build ↓"; login/signup/reset = back chevron, kicker + serif 30 title + sentence, kicker-labeled ivory fields, primary, quiet swap link; choose ministry = Browse|Invite-code fchips, ministry rows + Code pill, or code field + Join.

---

## 6. Checklist

- No two-header screens anywhere (including Give/Forms/Network/Profile/Settings).
- Empty states quiet-form with descriptive copy (`EmptyState variant="quiet"`), never "Nothing here yet".
- Calendar only in the ruled grid + agenda form.
- Facts grids true 2-col.
- One plum-filled create per screen.
- Disabled primary = 45% plum.
- Destructive never filled — outline/text only, always `--danger`.
- Every mobile fill uses a token from `app/globals.css` — chips/tracks/icon-chips are `--pocket-track`, never an inline hex, never `--line-2` as a fill.
- Bottom sheets are `PocketSheet` (z 200); dropdowns/kebabs stay `ActionMenu` (Convention #20).
- All mobile primitives are `Pocket*` in `components/central/pocket.tsx` (leaf) — no `components/central/mobile/` dir, no `Mobile*` family.
</content>
