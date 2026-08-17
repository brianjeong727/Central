# Central — Mobile Design System v2 ("Pocket Daybreak, ratified")

The companion contract to `web_design_system.md` for **phone-width surfaces** (`md:hidden`, ≤430px). Supersedes the v1 mobile spec. Same DNA — cream surfaces, Bricolage Grotesque, plum as a surgical accent, tonal borderless cards — with every v1 open item ruled and every drift pattern in the shipped build corrected.

Reconciled for adoption from the cdesign source ("Pocket Daybreak v2") against the live codebase (2026-07-23). Where a value below differs from the raw cdesign prototype, the codebase value wins — those are noted inline as SNAP corrections.

**Mobile north star: "Glance and act."** Mobile Central is a pocket companion — check what's next, read the announcement, reply to the cell chat, tick a checklist item. Deep planning stays on desktop. Every surface gets a *readable, thumb-reachable* form, not a miniaturized desktop one. When a mobile decision isn't covered here, replicate the ratified prototype — never fall back to the desktop shell's layout rules.

---

## 0. Rulings on v1 open items

1. **Home card language — RULED: tonal borderless.** Home uses the same `--ivory` borderless cards as every other screen. The `--cream-panel` + hairline-border treatment is retired **on mobile** (desktop keeps `--cream-panel`; the web contract is unchanged). One card grammar, no exceptions.
2. **Calendar at phone width — RULED: improved month grid.** A compact month grid is allowed (it earns its place for planners) but only in this form: 7-col grid, 40px day cells, event days marked with a 5px plum dot (never text inside cells), selected day = plum circle, and a **day agenda list directly below the grid** that updates on tap. Event titles never render inside grid cells.
3. **Back navigation — RULED: one chrome chevron, ever.** No back-pills, no stacked returns. The chevron goes one level up the hierarchy. **The control is the shared `BackChevron`** (`components/central/back-chevron.tsx` — cdesign "Back chevron" handoff, ratified 2026-07-27): a muted-ink Lucide `ChevronLeft` (19px, 1.7 stroke, round caps), color `--body` deepening to `--ink` on hover, flush-left in a 24×34 box with a −3px optical nudge, no bg/radius; the tap target is expanded to a centered 44×44 via a transparent `::after` (`.back-chevron` in `app/globals.css`), never by growing the visible glyph. It reads as navigation **chrome**, not an action — plum stays reserved for the one accent per view (replaces the old plum `ArrowLeft` in a 34×34 circle). Every stacked header routes through it — subpages (`SubpageShell`), `PocketChrome`/`PocketHubChrome`, and the chat / directory / announcements chrome rows; the labeled `PocketBackRow` uses the same muted chevron. **No per-screen back buttons.** (A dark full-screen editor toolbar keeps its own muted-text arrow — a distinct surface.)

---

## 1. Corrections to the shipped build (drift the prototype fixes)

- **No two-header screens.** Forms, Network, Give, Directory, Profile, and Church Settings shipped an eyebrow + 34–40px page title *below* the chrome. Corrected: the screen title lives in the single chrome row (22/600), full stop.
- **One chrome title type — RULED: serif 22/600 `--ink`, `POCKET_CHROME_TITLE` (ratified 2026-08-08).** Convention #27 pinned where the chrome row *sits* (`POCKET_CHROME_PAD_Y`) and the e2e asserted the title's vertical *position*; nothing pinned how the title *looks*, so five chromes drifted while every assertion kept passing — tab roots at 22, the Announcements row and `SubpageShell` at 20, `PocketHubChrome` silently dropping 22→20 whenever it carried an action, and the `SubpageShell` back-label at **15 in plum**, which read as a small link on a screen whose siblings all have headers. Every chrome row now spreads the one constant (`components/central/pocket.tsx`).
  - **A back-label is a TITLE, not a lesser thing.** "‹ Directory" on the member sheet is the same 22/600 ink header as the Directory root's, starting at the same x (no optical nudge — the −2px offset made the two rows disagree by 2px).
  - **The two grammars survive; only the type is unified.** A screen that headlines itself in the body (an announcement's date kicker + large headline, a member's identity card) still carries "‹ Parent" rather than repeating its own name in the chrome — the chrome names the SECTION, the body names the PAGE. That is what stops the two grammars ever duplicating words, and it is why the fix is one type ramp rather than one title source.
  - **The title slot MAY be an exclusive scope switch — one option per scope, all at the one title type, active `--ink` and the rest `--muted-text`** (`PocketChrome`'s `scope` prop; Chats is the first and so far only user, ratified with Brian 2026-08-17). Reach for it ONLY where a screen's header would otherwise repeat its own tab name *and* it carries a full-width scope-chip band: those are two stacked chrome bands where the bottom nav already names the tab, so the switch absorbs the header instead of sitting under it (~44px back on the densest list in the app). It is NOT a general filter home — a filter that is not the screen's primary scope stays a `PocketFilterChip` in the body, and a screen with no scope to switch (Directory, Announcements) keeps a plain title. The rhythm contract is unaffected either way: what it pins is that a serif-22 leaf opens the row at the same height on every tab root, not that the leaf is a single word.
  - **Enforced twice, because position-only enforcement is what let this drift.** `scripts/check-chrome-title.sh` (in `verify.sh`) fails any file that builds a chrome row — the structural signal is importing `POCKET_CHROME_PAD_Y` — without consuming `POCKET_CHROME_TITLE`; `e2e/mobile-screen-sweep.mobile.spec.ts` measures the real chrome row's font-size and colour on every screen it discovers. **A scope switch must keep the ACTIVE option measurable as the title** — the muted inactive options are what the sweep's colour check would otherwise trip on.
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
| `--body` | `#474251` | secondary text |
| `--muted-text` | `#8A8497` | meta, kickers |
| `--faint` | `#A09A8C` | stamps, placeholders, unset `—` |
| `--danger` | `#9F3030` | destructive **text/outline only**, never a fill (shipped value kept; v2's `#A03B2E` amended down) |
| `--sage` | `#5B7A6C` | "online" presence dot (shipped value kept; v2's `#5F7A5A` amended) |
| `--gold` | `#D4A45C` | readiness "needs-attention" dot (desktop readiness parity) |
| `--veil` | `≡ rgba(19,16,26,.55)` | sheet / modal ink backdrop |
| `--cream-on-dark` | `#F6F4EF` | cream text/fill on plum surfaces |

### Type (Bricolage Grotesque only)

chrome title 22/600 (ALWAYS — the old "20 when sharing the row with 2 actions" drop was the drift §0 abolished; removed from `PocketChrome` 2026-08-17) · card headline 21/600 · sub-headline 18/600 · row title 15/600 · body 14–15.5/400 · meta 13 muted · stamp 11 faint · **kicker 10 mono +1.4px uppercase muted** above every section · tag 9 mono +1px uppercase. Reading bodies (announcement detail, chat) 15.5–17 serif. **Stat numbers 22 serif 600** (mobile carve-out — desktop numeric serif is 400; ratified for mobile).

### Shape & spacing

radius: `--r-pocket` 20 cards · `--r-pocket-sm` 16 search/stats/composer · `--r-callout` 14 icon chips · 12 grid day cells · `--r-check` 7 checkbox · 999 pills/nav/avatars. Screen padding 20. Card padding 18 (20 hero, 6×18 row-cards). Hit targets ≥44 (34 chrome icons — ratified exception).

---

## 3. Shell

```
[ safe-area top ]
[ chrome row: (chevron) title ....... 0–2 actions · avatar ]
[ .scroll — sole scroll region, bottom pad = var(--nav-clearance) ]
[ floating plum pill nav — hidden on composers, chat screen, sheets ]
```

- **Nav:** 5 tabs — Home · Chats · Announcements (bell) · Workspace (clipboard) · Profile (user). Workspace is role-gated (`showPlan`), so a plain member sees 4. Active = cream circle + plum icon. Parent tab stays lit on every pushed screen (Profile stays lit on its Journal screen). `--shadow-nav` is the **one** ambient shadow allowed anywhere on mobile.
  **Profile is a pill DESTINATION, not a chrome avatar (ratified 2026-08-16).** It used to be reached only by the MonogramChip at the far right of every tab-root chrome row. That avatar is now GONE — from `PocketHeader`, `PocketChrome` and `PocketHubChrome` alike — because a nav item reachable from every screen made it a second door to one room, the same redundancy that retired Home's Workspace quick-tile. The pill icon is the generic `User` glyph, **not** the user's photo: the pill is a monochrome cream-on-plum icon set, and a full-colour avatar in it breaks that rhythm and has no coherent active state (a cream circle behind a photo). Instagram can put the photo in the bar because its chrome is neutral; Central's is a plum bar with one accent. The avatar keeps doing identity work where it earns it — chat roster, directory, the profile card itself.
- **Nav clearance belongs to the shell, and ONLY to the shell.** The sole scroll region (`.shell-scroll` in `app/globals.css`, applied in `home-app.tsx`) carries `padding-bottom: var(--nav-clearance)`; it resets to `0` at ≥768px, where there is no pill. **A tab, section, or card must never add its own bottom pad for the nav** — that double-counts. Before this was enforced the shell's `pb-28` and every tab's `pb-28` stacked into ~260px of dead scroll below the last row when the pill needs ~74px, so on every scrollable screen you could scroll ~190px past your own content (ratified 2026-08-07).
  `--nav-clearance` is DERIVED from the pill's real geometry in `components/ui/bottom-nav.tsx` — `env(safe-area-inset-bottom) + 14px (its bottom offset) + 60px (48 button + 2×6 padding) + var(--space-7)` — so the two can never drift. ≈92px flat-bottom, ≈126px notched: the "~120px" this spec used to quote, now exact per device rather than a fixed 112px that was wrong on both. Change the pill's size or offset and update the token, never a page.
- **No avatar in the chrome row, on any screen.** A chrome row is `(chevron) title … 0–2 actions` and nothing else. (Until 2026-08-16 a 34px MonogramChip sat far-right on tab roots and tapped through to Profile; the workspace hubs carried it too, alongside a back chevron, which §3 had always said sub-screens must not do. Profile is a pill tab now — see Nav above.)
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
- **CARDS FOR THINGS YOU READ. NO CARDS FOR ROWS YOU TAP THROUGH** (ratified 2026-08-16, cdesign "Full-bleed list immersion"). A **row list is not a card** — it renders flat on the page surface, edge to edge, separated by hairlines alone. Objects you read or act on as a UNIT keep their card: announcement cards, the verse callout, event detail blocks, the member-detail identity card, the 2-up tiles. The motivation is immersion — iMessage and Messenger have a single ground plane, so the content and the screen are the same object; a near-white page with a cream card floating on it made the list read as a *preview* of content rather than the content itself, and cost 76px of row width (shrinking avatars, truncating names early). The tap target is now the full screen width. Adopted on **Chats** and **Directory**; seven screens still carry the old pattern and should follow WHEN TOUCHED — Team Hub, Events → Upcoming, Meeting notes, Calendar day agenda, Chat settings, the create-chat member picker, Workspaces, and the Settings sub-screens.
- **Row** — two grammars, one primitive (`PocketRow`).
  - **Default (in a card):** flex gap 12, pad 13 0, bottom divider; 40px icon chip `--r-callout` (14) filled `--pocket-track` (plum stroke icon or initial; `.solid` → plum/cream); title 15/600 + 13 muted 1-line-ellipsis sub; right column = 11 faint meta / 8px plum unread dot / faint chevron. Meta never squeezes the title column.
  - **`immersive` (full-bleed, no card):** flex gap 14, pad **14px 20px** (the row owns the screen gutter, so its host wrapper must NOT), 46px chip at 16px, title 16/600 + 14 muted sub (mt 3), timestamp 12. **A row whose subject is a PERSON OR A GROUP takes a round `MonogramChip` (plum + cream), never the squircle `PocketChip`** — chats and directory members are the same kind of identity, and they are round everywhere else in the app. `--r-callout` squircles stay for OBJECT rows (sections, resources, settings). Separates with a **TOP** `--line-3` rule suppressed on the first row (`isFirst`) — so the section eyebrow above carries the opening rule and the last row leaves none dangling under it. The eyebrow goes full-bleed too: `padding 14px 20px 10px` first / `24px 20px 10px` after, each with its own `border-top: 1px solid --line-3` (Directory's count eyebrow takes `20px 20px 10px` and NO rule — whitespace separates it from the search field).
  - It is **opt-in**, not the default, because the default row lives inside a `PocketRowCard` on ~18 other screens where 20px of row padding would double the card's own inset.
  - **Two things the card was silently providing.** A presence dot's ring is a fake cut-out, so it must match whatever sits BEHIND it — `--ivory` inside a card, `--cream` full-bleed. And `SwipeActionRow`'s foreground is the opaque layer hiding the action panel: pass `surface="var(--cream)"` full-bleed, or every row paints in the panel's `--pocket-track` fill. Its `bleed` drops to 0 (it existed only to cancel the card's 18px inset).
  - **Pinning is NOT part of this.** The cdesign prototype moves the chips row and search field out of a per-screen scroll box so they stay pinned. Central has no per-screen scroll box at phone width — the DOCUMENT scrolls (see `tasks/lessons.md`), so this would be `position: sticky` with its own offset, keyboard-inset and pull-to-refresh interactions. Deliberately not implemented; the chips and search scroll with the list.
- **Buttons** (`PocketButton`) — pill r999, minHeight 42 (36 compact for the chrome row), 13.5/600. Variants: **primary** plum/cream (disabled = 45% opacity plum, never washed-lilac); **quiet** plum text on a tonal fill — `surface="card"` → cream fill, `surface="page"` → ivory fill; **destructiveOutline** = 1.5px `--danger` border + danger text on transparent, NEVER filled. Ghost-icon creates use `PocketRoundButton variant="plum"` (the screen's ONE plum-filled create).
- **fchip** (`PocketFilterChip`) — r999, off ivory/body, **on solid plum/cream/600** (mobile carve-out; desktop segmented controls do not fill). Wrap ≤3 exclusive options in `PocketFilterChipRow`; 4+ options become screens.
- **Forms** — label = kicker; input ivory `--r-pocket-sm` (16) pad 14×16 borderless 15.5; headline input serif 21/600 on the page bg. **Switch** (`PocketSwitch`) 46×28, `--pocket-track` off → plum on, 22px cream thumb, ≥44 hit box. Checkbox 22 `--r-check` (7) 1.5px → plum. **Search** (`PocketSearchField`) ivory pill r16, leading search glyph + borderless input, faint placeholder.
- **Tags** (`PocketTag`) — mono 9 uppercase r999. `default` = `--pocket-track` bg / body text; `role` = plum/cream (ADMIN, LEADER); `outline` = 1px `--line-2` border for VISITOR.
- **Stat card** (`PocketStatCard`) — ivory r16, mono 9 kicker, serif 22/600 number, 11.5 muted sub.
- **Facts grid** (`PocketFactsGrid`) — 2-col `auto 1fr`, rows gap 12; keys mono 9.5 uppercase muted; values 14/500 ink; unset value = `—` faint.
- **Progress** (`PocketProgress`) — 4px track `--pocket-track`, plum fill; `onPlum` → track `rgba(cream,.2)`, cream fill.
- **Empty state** — centered, 52px ivory chip r16 + stroked icon, 15/500 title, 13 muted descriptive sentence. Dashed border is reserved for add-affordances (`PocketDashedButton`), never empty states.
- **Sheet** (`PocketSheet`) — creation/config only (poll composer, new-event picker). Ink `--veil` backdrop, cream panel `--r-pocket` top corners, 40×4 drag pill (`--line-2`), title 21/600 + 34px ivory close circle, safe-area bottom padding. **z = 200 (modal tier)** — pass `zIndex` (e.g. 210) only to stack over an already-open modal. Animation: `sheetUp` 240ms `cubic-bezier(0.23,1,0.32,1)` + veil fade 180ms, both suppressed under `prefers-reduced-motion`. Closes on Escape and veil tap. This is a NEW pattern — it does NOT replace `ActionMenu` (Convention #20) for dropdowns/kebabs.
- **Chat** — date chip mono 11 italic; incoming = ivory bubble r18 (4 at the tail) + 26px avatar + name/time row; outgoing = plum bubble, cream text, right. Composer = "+" ghost (opens a compact `ActionMenu` anchored ABOVE it — photo/file · GIF · poll — iMessage-style, not a sheet; pass `panelClassName` to swap the desktop skin for an `--ivory` r16 tonal card, the only fill that reads on the flat `--cream` chat surface) · ivory pill input · 44px plum send circle. No emoji button — the touch keyboard carries one.
- **Month grid** — ruled form only (see §0.2).
- **Carousel** (`PocketUpNext`) — scroll-snap, -20px bleed, 82% cards, dots (plum active). Manual only.
- **Swipe row actions** (`SwipeActionRow`, `components/central/swipe-actions.tsx`) — drag a list row sideways to uncover actions behind it (iMessage's row gesture). Leading (right-swipe) and trailing (left-swipe) panels; 76px per action, full row height, icon over an 11px serif/600 label. Both tones fill `--pocket-track` (§2's mobile fill token — the family's "behind the card" value, which reads as a layer recessed beneath the `--ivory` row rather than a hole punched through it) and take their weight from TEXT, not fill: `default` = `--body`, `strong` (the weightier action — leave/archive) = `--ink`. Never `--line-2` (border/stroke only, §6) and never `--cream-2` (a desktop token, and lighter than the card it sits behind). One fill across the panel means ADJACENT tiles are separated by a **1px `--line-3` hairline** — the same in-card divider that separates `PocketRow`s (§2), lighter than the fill so it reads as an inset seam — never on the panel's outer edge, where it would read as a border on the card. **Plum is deliberately absent** — it is a surgical accent and a list like Chats already spends it on the unread dot, the scope pill and the create +. Never a danger fill. Inside a `PocketRowCard` pass `bleed={18}` so the panel reaches the card edge instead of stopping short of it; the card clips to its own radius. The gesture is an **ACCELERATOR, never the only path** (§0.3) — every action it exposes must also be reachable by tapping through the UI, or a user who never discovers the swipe (and every screen-reader user) is stranded. Safety properties are inherited from `useEdgeSwipeBack` and its `inHorizontalScroller` guard is imported, not copied (Convention #7): coarse-pointer only, direction-locked, multi-touch guarded, and it **ignores a touch starting within 24px of the left edge** so back-swipe (Convention #22) is never contested. `touch-action: pan-y` on the foreground leaves vertical scrolling and pull-to-refresh entirely to the browser. Open state is CONTROLLED by the parent, which is what guarantees only one row is open at a time and lets Android back close it. A destructive action that is irreversible FOR OTHER PEOPLE does not belong here — put the reversible sibling on the swipe and keep the destroy in the surface's danger zone (why Chats offers Archive, not Delete).

---

## 5. Screen recipes (deltas from v1)

- **Home** — chrome = ring-cross + ministry name + avatar → date kicker → setup-checklist card (dismissible, admin) → FEATURED kicker + hero carousel → serif 19/600 "Announcements"/"Chats" digests (2 rows + See all) → quick grid (Give + first team) → verse card (ivory, italic serif 17, mono ref).
- **Announcements** — title chrome + plum "+" ghost · fchips All/Events/Updates · full-width cards (kicker date · 21 headline · 2-line body · RSVP pill + count). Detail: body serif 17, EVENT facts card, RSVP primary + going chips, POSTED card. Compose: full-screen, nav hidden, Save-draft quiet + Publish primary (compact), headline input, body textarea, AUDIENCE chips, OPTIONS switch, ATTACHMENT dashed, FORM note.
- **Chats** — Church|My-chats fchips; Church = kicker groups (GENERAL/GROUPS/TEAMS) each with a leader "+"; rows show pin/mute glyphs + unread dot. **Rows are FULL-BLEED `immersive` (§4) — no row-card.** Chips, search, push-prompt and empty states re-apply their own `px-5`; the row run does not. **Every chat's chip is the same plum `MonogramChip` circle** (ratified 2026-08-16, matching the desktop list) — the old `--r-callout` squircle, tonal by default and solid-plum only for the ministry-wide room, is retired; `is_central_chat` no longer changes how a row looks. `avatarUrl` is the seam for a DM counterpart's photo or a group chat's own photo — **neither exists in the data yet** (`get_chat_list` returns no avatar column, `groups` has no photo column), so shipping them is an RPC change and a schema+upload+storage-RLS feature respectively, not a styling pass. Chat screen: ONE cream surface (header/body/composer all `--cream`, no header hairline) so chrome and composer float; no nav; header = back + 40 avatar + name 20/600, no member count and no chrome actions (settings = name tap; message search is desktop-only). Settings: single "Chat settings" chrome; members card = Add members + a "See all members" drill-in (the roster lives on its own Members screen: chrome title + count + "+", All|Leaders chips, search); prefs switches; footnotes 13 muted.
- **Workspace** — tab root = workspace list (optional hero current-event card) → team hub (PLANNING: Events/Meeting notes/Calendar · MINISTRY: Resources/Groups/Rotations) → detail screens. Events list: title + season ghost + New-event primary; date-chip rows. New event = sheet with template cards (emoji 28 + 15/600 + 12.5 muted) + dashed start-from-scratch. Event detail: facts grid → readiness bar → JUMP-INTO-PLANNING hub rows (Overview/Countdown/Roles & Leads/Run of Show with live meta). Countdown: progress header, phase kickers, tap-to-toggle checkbox rows + assignee tag. Meeting notes: title + plum "+", search below, rows. Note detail: date kicker + attendee/link dashed chips, serif 26 title, AGENDA/DECISIONS/NOTES sections with + rows. Calendar: ruled month grid + day agenda. Resources: President|Member fchips, role card (serif intro + RESPONSIBILITIES bullets), RELEVANT LINKS + add. Groups: saved-grouping card → detail with group cards (name + count tag + member rows). Rotations: semester pill, kicker + "n of 7 filled" tag, progress, slot rows (SUN date / holder or ⊕ Open; your slot = plum outline + solid chip). Team settings: Roles cards w/ permission chips, Leadership switches, Members rows + role dropdown, danger row.
- **Directory** (via person ghost on Chats) — search, count kicker, rows (avatar + online dot, role tag, class, chevron). **Rows are FULL-BLEED `immersive` (§4)**; the presence ring is `--cream` (it rings the page, not a card) and the search field keeps its cream pill because it is an INPUT, not a container. Member: identity card (56 avatar, LEADER tag, class, Send-Message primary + kebab) → CONTACT facts card — the detail screen keeps its cards, it is a thing you READ.
- **Give** — single chrome; verse kicker; OFFERING card = recipient + Zelle fields + Save primary; member view = recipient card + copy.
- **Profile** (pill tab, §3) — identity card (56 avatar, name 21, role tag, email 13, Edit quiet) → PERSONAL kicker + **Journal hub row** → ABOUT/FAITH/PRAYER cards (or quiet empty). Settings live behind the chrome gear as a drill (hub → Notifications / Account & support / Danger zone, with Sign-out quiet on the hub), never inline on the root. Edit: Cancel/Save chrome, kicker field groups, OPTIONAL tags; the Journal row is hidden while editing (the root is a form then).
  - **Journal** — a pushed spoke off the profile root, not a pill tab: private and low-frequency next to the four ministry surfaces. Chrome = "Journal" + back chevron + the settings kebab (show-entries / show-streak); body = Devotionals|Prayers|Verses `fchip` row (exactly 3 → chips, per §3) over the entry list. Its phone-width UI shipped with the Pocket build but had NO entry point at this width until 2026-08-16 — `onSectionChange` was wired only in `desktop-nav.tsx`, so on a phone it was reachable solely by hand-typing `?section=journal`.
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
