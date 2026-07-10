# Central — Design System

A formal spec reverse-engineered from `Central Redesign.html` and its component files. Any new page built against this doc should be indistinguishable from the established Home, Profile, Give, Plan, Chat, Announcements, and Settings screens.

This system replaces a more generic, white-card SaaS look with an **editorial cream-and-plum** aesthetic. The mistakes most often made on the originals — and the ones a sub-agent must NOT repeat — are listed at the end of each section as "Do not."

---

## 0. Design North Star

**"Reverent, not corporate. Warm, not cute. Calm, not playful."**

Central is a daily-driver tool that an entire church community lives in for communication, giving, and leadership. Warmth comes from tone, materials (cream surfaces, editorial serif), generous whitespace, and human language — NOT from decoration, bold color blocks, or playfulness. When any decision is unclear, default to calm and restraint.

**Scope: built for a medium ministry.** Central is designed for small-to-medium ministries — on the order of a few hundred members and a single-digit number of active events per team at a time. Design decisions optimize for the simplicity and calm that size allows, NOT for unbounded scale. Where serving a very large church (thousands of members, dozens of concurrent events) would force a UI compromise that costs smaller ministries their simplicity, prefer the smaller ministry; large-scale needs are addressed with a separate workspace, not by complicating the core experience. When a "will this scale to N?" objection arises, first ask whether N is within the target size — if not, it is not a reason to reject a design.

---

## 1. Foundation

### 1.1 Voice
- **Editorial, not enterprise.** Read like a thoughtful product (Stripe, Linear, Notion's marketing site) — never like a generic dashboard.
- **Quiet by default.** Most surfaces are cream and ink. Plum appears in small, surgical moments — a monogram chip, the active tab underline, a single primary CTA — never as a repeated surface or background fill. When tempted to add a plum gradient card, add whitespace instead.
- **Restraint over information density.** Whitespace, generous line-height, and large type are load-bearing.

### 1.2 Color tokens

| Token | Hex | Use |
|---|---|---|
| `--plum`        | `#3E1540` | Active borders, monogram chips, active tab underline, checkbox fill, focus ring — surgical accent; at most 1–2 moments per view |
| `--plum-2`      | `#2D0F2E` | Active breadcrumb text, identity hero gradient base (rare) — NOT a button fill (primary CTA fill is `--plum`, see §4.3) |
| `--plum-deep`   | `#1B0A1E` | Hero gradient dark stop |
| `--plum-light`  | `#4A1B4D` | Hero gradient light stop |
| `--plum-tint`   | `color-mix(in srgb, var(--plum) 12%, var(--cream))` | Selection/wayfinding surface — the ONLY sanctioned light-plum surface; the universal selected-state surface (chips, segments, selected cards, active nav rows — §4.4) and identity-emphasis badges (your role, President, For You). NOT for status pills — statuses derive from the semantic accents (§4.7). Was raw `#EDE3EE` (read cool); ratified R4 |
| `--ink`         | `#13101A` | Primary text |
| `--body`        | `#5A5466` | Body text, sub-labels |
| `--muted`       | `#8A8497` | Tertiary text, eyebrow mono, labels |
| `--faint`       | `#A09A8C` | Disabled, helper text, timestamps |
| `--cream`       | `#FDFCF8` | Primary surface (page bg, cards) |
| `--cream-panel` | `#FBF8F2` | Card / panel / overlay surface — the de-facto surface across cards, dropdowns, and modals (one step warmer than `--cream`) |
| `--cream-on-dark` | `#F6F4EF` | Cream text / fill **on** plum or dark surfaces — slightly muted from `--cream` for legibility |
| `--cream-2`     | `#F8F4EA` | Inset surface (composer, dashed cells) |
| `--cream-3`     | `#F6F2E8` | Accent surface (verse callout, today cell) |
| `--body-bg`     | `#F4F1E8` | Desktop context sidebar panel — middle tier of three-tone desktop surface. **Exception:** the Messages (chat) panel uses `--cream` instead — see note below. |
| `--ivory`       | `#F1ECDE` | Soft-pill background; also the **B · Emphasis** surface for the single most prominent inset card (Up Next). (Active sidebar item is now `--plum-tint` + a 3px `--plum` left bar — R4; no longer `--ivory`.) |
| `--canvas`      | `#F1ECDE` | Design-canvas page bg outside artboards |
| `--rail`        | `#ECE6D6` | Desktop icon rail — darkest step of three-tone desktop surface |
| `--line`        | `#E8E2D2` | Primary hairline |
| `--line-2`      | `#E2DDCF` | Card border, input border |
| `--line-3`      | `#EFE9DA` | Faint row divider |
| `--dashed`      | `#C4C0B0` | Dashed placeholder borders |
| `--success`     | `#7FA67F` | Auto-save dot, "on track" indicator; also the ok/on-track status-pill accent (§4.7) |
| `--warm-tan`    | `#9D7B4F` | Calendar "social" category |
| `--sage`        | `#5B7A6C` | Calendar "outreach" category |
| `--gold`        | `#D4A45C` | Avatar accent; and the pending/warn status-pill accent (§4.7). Never a filled button bg. |
| `--danger`      | `#9F3030` | Destructive text/border only; also the soft status-pill tint accent (§4.7) — still never a filled button bg (danger-solid confirm exempted per §4.3) |
| `--veil`        | `color-mix(in srgb, var(--ink) 55%, transparent)` | Modal/overlay ink backdrop scrim (≡ `rgba(19,16,26,.55)`) — R11 |
| `--veil-soft`   | `color-mix(in srgb, var(--ink) 40%, transparent)` | Lighter non-modal scrim (≡ `rgba(19,16,26,.40)`) |

**Do not:** invent new neutrals. Do not use pure white (`#fff`) — always cream. Do not use saturated red, blue, or green for status. Do not use gradients except in the rare full-identity hero (§4.1). Do not use plum as a repeated surface, card background, or decorative fill — it is a surgical accent appearing in at most one or two intentional moments per view.

> **Chat panel exception (intentional):** The Messages context panel uses the body background token (`--cream`) instead of the standard `--body-bg` panel tone. This is deliberate — the conversation list and thread are one master/detail activity; giving them a continuous surface (vs. a tonal step) creates the Messenger/iMessage feel where list and thread read as one connected space. All other section panels keep `--body-bg`.

### 1.3 Typography

```
--serif: "Bricolage Grotesque", system-ui, sans-serif;  /* display/heading role */
--sans:  "Bricolage Grotesque", system-ui, sans-serif;  /* body/UI role */
--mono:  ui-monospace, SFMono-Regular, Menlo, monospace;
```

| Role | Family | Size | Weight | Letter-spacing | Use |
|---|---|---|---|---|---|
| Display    | serif | 56–64 | 600 | -0.02em      | Hero banner names ("SSO", "Student Org Board") |
| H1 | serif | 44 | 600 | -0.02em | Page titles — **landing tier** (PageTitle default 44px). Workspace/detail pages use the compact **25px** tier (§3.1). These are the only two title tiers (R1, ratified 2026-07-09); the former 36px tier is retired. |
| H2         | serif | 28–36 | 600 | -0.02em      | Section titles inside a page |
| H3         | sans  | 16–18 | 500 | 0            | UI-chrome card titles, role names, list headings. Serif H3 only for genuine editorial section heads within long-form content. |
| Body L     | serif | 19    | 400 | 0.1          | Long-form quotes, editorial body, transition notes, chat reading-room |
| Body       | sans  | 14–15 | 400 | 0            | UI copy, descriptions |
| Body S     | sans  | 12–13 | 400 | 0            | Secondary metadata |
| Eyebrow / Mono | mono | 11 | 400 | 1.4 | All-caps labels above any title or section. **Always required above page H1 and section H2.** |
| Numeric    | serif | 28–40 | 400 | -0.4 to -0.6 | Stat card numbers, invite codes — weight 400 is intentional; editorial numbers read differently from heading text |
| Date anchor | serif | 36–42 | **600** | -0.02em | **Exception (approved 2026-06-30):** the single date/posted numeral that anchors the **featured announcement card's 40% slot** (36px — kept one step below the 44px page-H1 ceiling per R1, so the page header stays the size ceiling; the card title sits one step below the anchor at 30/600) and the **announcement detail aside** (42px) may be serif weight **600** — it acts as a display focal point, not a stat readout. Scoped to those two surfaces only; ordinary stat numbers stay weight 400. |

**Pattern rules:**
- Every page title is preceded by an eyebrow mono label (`DATE`, `SECTION · CONTEXT`, `WORKSPACE`, etc.).
- Every section title inside a page repeats the eyebrow + serif H2 pattern.
- Long bodies (announcements, transition notes, chat thread) are set in **serif at 17–19px** for a reading-room feel — not sans body.
- Stat card numbers are serif, not bold sans.

**Display weight threshold:** Weight 600 is the heading emphasis carrier — use it at the top of the hierarchy only. Reserve weight 600 for: page H1, section H2, display/hero text, **and the featured-card / announcement-detail date anchor (the §1.3 "Date anchor" exception)**. Use weight 400 for: editorial long-form body, stat card numbers, and all UI-chrome text (card titles in list views, role badges, metadata rows, tab labels, navigation items, helper copy). If more than two or three text nodes on a single screen carry weight 600, the hierarchy collapses and the effect is diluted.

**Do not:** mix typefaces — Central uses Bricolage Grotesque exclusively; never import additional font families. Do not use weight 600 for body copy, UI labels, or metadata — reserve it for heading hierarchy (H1, H2, display). Do not all-caps anything except mono eyebrows.

### 1.4 Spacing & radius
- **Scale:** 4, 6, 8, 10, 12, 14, 18, 22, 28, 36, 40, 56. Do not invent in-between values.
- **Page padding:** `0 40px 40px` on the main column; `22px 40px 0` on the breadcrumb header.
- **Section gap:** 28–36 vertical between major sections; 56 between calendar and meeting-notes feed.
- **Card padding:** 18 (small), 22 (default), 22×28 (wide stat row).
- **Radii:** 6 (tiny pills, icon buttons), 8 (chips), 10 (inputs, secondary buttons), 12 (most cards), 14 (sidebar callouts, prominent cards), 16 (composer pill), 18 (hero banner, full-bleed modal).
- **Hairlines:** always 1px, never 2px. Active tab underline is the only 2px rule. The 3px plum left bar on active nav rows/chat rows (§2.2, R4) is the only sanctioned >1px border accent besides the 2px tab underline.

### 1.5 Iconography
- Lucide-style stroked icons via the local `<Icon d={...}/>` component. Stroke 1.6, linecaps round.
- Icon sizes: 13 (inline button), 14 (label), 15 (header), 16–18 (rail).
- Icons sit in mono-cased squares (36×36 with radius 9) when they represent a team/avatar; sit naked when they sit next to text.

**Do not:** use emoji as iconography. Do not use Font Awesome / Heroicons mixed sets. Do not fill icons — strokes only.

**Team / workspace icons — always the glyph, never the emoji.** A team's visual is the `PlanLineIcon` stroked glyph keyed by its preset — resolve it with `teamIconKey(team)` from `app/home/workspace-presets.ts` and render `<PlanLineIcon iconKey={teamIconKey(team)} …/>`. **Never render the raw `teams.icon` value** — that column holds legacy emoji (and some rows even store a stray iconKey string like `"users"`), so rendering it directly produces the exact emoji/garbled-text leak this rule exists to prevent. This holds everywhere a team is shown in a list/matrix/chip (governance access matrix, founder admin panel, settings, sidebar). (This supersedes the older "emoji are used for team icons" carve-out.)

---

## 2. Shell & navigation

### 2.1 Three-column workspace
```
[ 76px dark icon rail ] [ 220px cream sidebar ] [ flexible main ]
```

- **Icon rail** — `#13101A` background, plum primary "+" button at top, six section icons (Home, Chat, People, Profile, Pray, Plan). Active icon: `rgba(251,248,242,0.08)` background + 2px cream stripe on the left edge.
- **Sidebar** — cream `#FDFCF8`, 220px wide, 1px right border `#E8E2D2`. Header block (32 top / 28 side / 24 bottom) has mono eyebrow "WORKSPACE" + serif "Central" 32px.
- **Main column** — cream `#FDFCF8`. Top header strip is breadcrumbs left, search/header-actions right, then content.

**Three-tone surface system:** The three shell zones use three tonal steps that recede left-to-right, making the content area feel forward and primary: icon rail (`--rail`, darkest) → context panel (`--body-bg`, middle) → content area (`--cream`, lightest). Each zone is one step lighter than the one to its left. **Chat exception:** the Messages context panel uses `--cream` to match its content area — the conversation list and thread are one continuous master/detail activity, so they share a surface rather than stepping tonally (see §1.2 note).

### 2.2 Sidebar variants

Two modes, controlled by a `navMode` prop:

**`navMode="teams"`** (default, for team-scoped surfaces: Plan, Roster, Resources)
- "YOUR TEAMS · n" mono eyebrow with `+` icon button on the right.
- Team rows: icon chip (36×36) + name + role. Active row uses `--plum-tint` bg + `--plum` text + a 3px `--plum` left bar (R4) + plum-filled icon chip.

**`navMode="home"`** (for workspace-scoped surfaces: Home, Announcements, Church Settings)
- "HOME" mono eyebrow.
- Simple text rows. Active row uses `--plum-tint` bg + `--plum` text + a 3px `--plum` left bar (R4).

Both modes share:
- **Verse callout** at the bottom of the sidebar — `#F6F2E8` bg, 1px `#E8E2D2` border, radius 14, padding 18. Mono eyebrow ("VERSE · PSALM 46:10") + italic serif quote 17px in `#2D0F2E`. Always present on every screen.
- **User badge** at the very bottom — 30×30 ink square with cream initial.

### 2.3 Breadcrumbs
`Central / Student Org Board / Plan / SSO` — last crumb in `#2D0F2E` weight 500; rest in `#8A8497` weight 400. Slash separator in `#8A8497`.

**Chat exception (intentional):** The Messages tab omits the breadcrumb strip entirely. The chat header (group name + member row) is the page's context line — a "Central / Chats" breadcrumb above it would duplicate that context. This is a stated exception, not a bug.

### 2.4 Header search
Right-side header element. Pill: 1px `#E2DDCF`, radius 10, padding 8/14, min-width 320. Icon + "Jump to anything" placeholder + `⌘K` chip. Show on every page except creation/full-page editors (announcement composer hides it).

**Do not:** put a heavy gradient or color in the sidebar header. Do not stack page-level actions in the sidebar — they belong on the main column. Do not remove the verse callout — it is part of the brand.

---

## 3. Page header pattern

Every primary content page follows this structure, top-to-bottom:

1. **Breadcrumb row** (in the chrome header, not the body).
2. **Hero banner** — for identity pages (Team home, Event detail, Profile, Give). See §4.1. *Skip for pure-content surfaces like Choose a Ministry or the Announcement editor — they use a plain serif page-title block instead.*
3. **Underline tab strip** — always immediately under the hero, separated by 22px.
4. **Section eyebrow + section H2** — first content block.

For pages without a hero banner (R1 header anatomy, ratified 2026-07-09):
- Breadcrumb (Zone A wayfinding)
- Mono eyebrow — **required** ("MINISTRY ADMIN", "NEW ANNOUNCEMENT · DRAFT", etc.)
- Serif H1 — **44px landing tier** / **25px compact tier** (these are the only two title tiers; the former 36px tier is retired)
- Optional 15px sentence describing the page
- **ONE terminating hairline.** If the page has a tab strip, the strip's own rule IS the terminator — never both; suppress `TabPageHeader`'s bottom `InsetHairline` (via `noBottomHairline`) when a strip follows.

**No buttons in the page-title header** — sole exception: the Zone-B Settings gear. Every create/add/generate lives in the collection's content header (§3.2 Zone C).

### 3.1 Workspace headers are compact

**Rule:** Every Plan-tab workspace uses a **compact** header — `<TabPageHeader><PageTitle title={…} compact /></TabPageHeader>`: a **25px** serif title (vs the 36px default) and **no eyebrow**. This applies to ALL workspaces with no exceptions — Finance, Receipts, Praise, DG Praise, One-Time, Tech, the standard calendar team, Student Org Board, and Small Group Leaders. The only right-slot action is the Zone-B settings **gear** (icon button), sized to match the compact line box; creates never sit in this row (§3.2).

The workspace's identity (which ministry, which team) is already carried by the sidebar and breadcrumb, so the header stays tight and title-only — do **not** add a `PLANNING · MINISTRY` / `RECEIPTS · TEAM` eyebrow back.

The title-row right slot holds only the Zone-B manage action (the settings gear) — the create/add CTA lives in the content header per §3.2, not the title row.

**Event/identity drill-down headers (carve-out retired, ratified 2026-07-09):** event/identity drill-down headers — e.g. the Student Org and Small Group **event-detail** headers — now use the **compact 25px** tier like all detail pages (in practice rendered by `SubpageShell`, which is already 25px). The former 36px `PageTitle` + eyebrow carve-out is retired; there are only two title tiers (44 landing / 25 compact).

### 3.2 Action placement — one home per button type

Every action button has exactly one zone it's allowed to live in; its **scope** decides the zone, never the empty space on the page.

- **Zone A — Wayfinding (breadcrumb / rail).** Back/origin. The breadcrumb is the clickable back system — every non-final crumb is a link (root crumb = ministry name → Home; e.g. "Planning" → team picker), the final crumb is the static current location. The rail brand mark (RingCross, pixel-identical — **no chevron, no pip**) is a **contextual "back to Plan workspaces" control, NOT a ministry switcher**: on the Plan tab for users with 2+ plan workspaces it returns to the workspace picker; everywhere else (other tabs, or <2 workspaces) it goes to `/landing` (its original behavior). The first time a 2+-workspace user reaches the picker, a one-time teaching hint pill appears beside the mark ("← Back to all workspaces, anytime"), persisted once-ever via `profiles.seen_workspace_nav_hint`. The breadcrumb's "Planning" crumb is the other (less prominent) way back. **Never a standalone floating "back" / "All workspaces" pill** — that pill has been removed; its job is now the "Planning" crumb.
- **Zone B — Object header (by the page title).** Actions that configure *the object the page is about* — Settings, Rename, Members, Archive. Secondary weight: an **icon** button (the gear) right of the title. One → a gear; **3+ → collapse into a kebab (⋯)** whose first item is Settings.
- **Zone C — Content header (by the collection).** The page's single **plum primary** create action ("Add entry", "Add category", "New question") sits right of the header for the collection it fills. List-level helpers (Export, Filter, a view toggle) are **ghost buttons to its left**.
- **Kebab (⋯).** Only for low-frequency, destructive, or per-row actions (Duplicate, Move, Delete, Leave; per-row table actions). Never primary navigation or the main create.

> **The one-line rule (read this first):** the top / object header carries **only object-config** — the Settings **gear** (→ kebab at 3+). It **never** holds a create / add / generate button. Every add / create / generate action is a **plum primary in the body content header** of the collection it fills (Zone C). On a **multi-section workspace** (a team/workspace home with General / Events / Groups / … sidebar sections), the top header shows the **workspace name + gear**, and each section's create lives in **that section's own body header** — not the page header. The header-hosted create pattern (a create button in a `TabPageHeader`) is therefore **retired**; use `SectionHeader`/`ContentHeader` + `ContentActionButton`/`CentralButton` in the body instead. (There is no single-feed exception — see below.)

**Scale:** 1 action → direct button; 2 → side by side in the zone; 3+ → collapse to a kebab, keeping the single most-used action visible beside it.

**No single-feed exception (R1/R2, ratified 2026-07-09):** the create primary is never beside the page title — not even when the page title directly heads its one collection (Announcements feed, Congregation questions). Every create lives in that collection's own content header (Zone C) below the title block. On object + sub-collection pages the create sits in the sub-collection's header while the Zone-B gear stays by the title. View toggles and list helpers (Cards | Compact, Export, Filter) are ghost/secondary buttons to the LEFT of the create in that same content header — never in the title row.

---

## 4. Component library

### 4.1 Plum hero banner

> **Canonical source:** The hero gradient is **retired from all app-shell surfaces** — shell headers, team homes, section/event/tab headers, and identity cards are cream (see the **Status** note at the end of this section). The gradient spec and the JSX samples in §4.1, §11.4, and §13 are preserved **only as historical reference** — do **not** treat them as current, copy-pasteable canonical code.

The highest-weight identity statement in the app. Reserved for **at most one** genuine identity moment per page — the surface that needs to own the room. This is not a default treatment for any entity type; it is an earned moment. Team home, profile, giving page, and event detail may each carry one hero; the "Up Next" home card uses a cream card with plum accent rather than the full gradient.

> **⛔ RETIRED — DO NOT USE — preserved for reference only.** Hero gradient retired from all app-shell surfaces (see Status note below). The block below is historical reference, not canonical code.

```
/* ⛔ RETIRED — DO NOT USE — reference only. Hero gradient retired from all app-shell surfaces. */
border-radius: 18
overflow: hidden
background: radial-gradient(120% 100% at 0% 0%, #4A1B4D 0%, #2D0F2E 55%, #1B0A1E 100%)
color: #FDFCF8
padding: 30px 36px 32px
```
- **Dot texture overlay** (required): absolute inset, opacity 0.18, `radial-gradient(rgba(253,252,248,0.6) 1px, transparent 1.4px) 0 0 / 14px 14px`.
- **Layout:** flex row, gap 24. **⛔ RETIRED — DO NOT USE (reference only):** ~~Square monogram (84–92px, radius 16–18, `rgba(251,248,242,0.08)` bg, `rgba(251,248,242,0.18)` border, serif initial 46px)~~ — superseded by the unified `MonogramChip` (circle / plum `#3E1540` / cream initials); no square monograms, no non-plum backgrounds — + identity column (mono eyebrow `rgba(251,248,242,0.65)` + serif title 48–56 + meta 15px `rgba(251,248,242,0.78)`) + actions column right-aligned.
- **Action buttons inside hero:** primary uses cream bg / plum-2 text; secondary uses `rgba(251,248,242,0.08)` bg with cream text and 1px `rgba(251,248,242,0.25)` border. Radius 10.

**Do not:** use the hero as a default card treatment or a repeated pattern within a view. Do not place it on list pages, settings pages, or secondary surfaces. Do not use it more than once in the same view — two full-bleed plum moments cancel each other. Do not change the gradient stops or direction when it appears.

**Status (June 2026):** The plum gradient hero has been retired from all app shell surfaces — team home headers, section headers, event sub-headers, tab headers, and identity cards inside the shell are now cream. Plum remains a surgical accent (CTA button fills, active tab underlines, icon chip backgrounds) but is never a card background, section header, or surface gradient anywhere in the shell. The §4.1 gradient spec is preserved only for rare standalone full-identity moments where the surface genuinely needs to own the room (e.g., a dedicated profile identity card or give-page hero) — never as a default treatment for a section or team.

**Exception — Pastor Pulse slide (June 2026):** exactly ONE scoped plum *surface* is authorized inside the shell: the Pastor Pulse question card when it rides as the lead slide of the home hero carousel (§4.1c). It is a **flat** `--plum-2` fill (never the retired gradient, no dot texture), scoped to that single card, and never repeats. This is the sole sanctioned plum surface in the shell — do not generalize it to any other card, header, or slide.

### 4.1b Home hero carousel (Phase 2)

The home "Up Next" slot is a manually-advanced carousel of curated slides sharing **one frame identity**. Constant frame elements are always system tokens (never image-derived):
- **Height:** `--hero-h` (375px) — single source of truth; every slide type reads it, never hardcode per-slide.
- **Radius:** `--r-hero` (18px). **Border:** `1px var(--line-2)`. No drop shadows.
- **Section eyebrow:** "Featured" + plum dot, `--muted-text`, above the frame (constant).
- **Chrome (bottom nav):** navigation sits **below** the frame — a single centered row of `ChevronLeft` · elongated-dot row · `ChevronRight` (chevrons 24px in `--muted-text`; dots `--dashed` inactive / `--plum-2` active pill). The viewport spans the **full container width** — no side arrows reserving horizontal space, so the eyebrow label no longer offsets for arrows. **Auto-advance:** content slides auto-rotate on a ~7s cadence; rotation pauses on hover/focus, is skipped under `prefers-reduced-motion`, and is fully suppressed while a gated pulse slide holds the lead (§4.1c). Manual prev/next always works. The controls row appears only when >1 slide. *(This superseded the earlier tall flanking side-pill arrows; the arrows moved to the bottom so the card reclaims full width — authorized June 2026 with the pulse-in-carousel work.)*

**Three slide types, one frame** (only the interior differs):
- **Photo:** full-bleed image; the stored clamped `panel_color` makes a **light mood ramp** — a horizontal clamped-color gradient that fades to transparent by ~70% (**Option A — no solid panel; the photo reads through nearly everywhere**), with a **separate soft radial near-black scrim** anchored to the text for legibility (a true over-photo floor under cream text — never plum/colored, never a dark slab). Static CSS only — no live blur, no per-render image work, SSR-safe. The near-black backdrop/scrim values are kept as inline component constants (one component's internal curve), not global tokens. `panel_color` is computed **once at upload** by a hue-preserving HSL clamp (chroma-weighted dominant hue, near-white/near-black pixels discarded → fixed dark L≈0.13, saturation clamped to a floor/cap; `--plum-deep` fallback only when the image is colorless). Cream caption (with a legibility text-shadow) + cream eyebrow dot.
- **Event:** real `calendar_events` date/location; if the slide has its own photo → photo treatment + a glass date/RSVP chip; otherwise the ivory reference layout with real detail. RSVP via the linked announcement when present.
- **Announcement:** ivory editorial reference layout (`UpNextCard`).

**Retired here:**
- The hollow **"No date, time, or location set yet" placeholder is retired** from the hero. Non-event references fill the frame editorially; events show only the fields that exist (omit unset fields) — never a "nothing set" box.
- **Cream over photo:** use `--cream` (opacity for hierarchy); do not introduce a separate over-dark cream value. **Eyebrow dot over photos is `--cream`, never `--gold`** (gold stays avatar-accent-only, §1.2).

**New material:** `backdrop-filter: blur` is allowed **only** on the event glass chip as a contained, surgical material — do not let it proliferate to other surfaces.

### 4.1c Pastor Pulse slide — flat-plum lead slide (scoped exception)

The Pastor Pulse question rides **inside** the home hero carousel as a hosted **lead slide** (index 0), not as a standalone card elsewhere on Home. It renders only for a **non-pastor** viewer with an **active, unanswered** question. It is the one sanctioned plum surface in the shell (see §4.1 Status exception).

- **Card:** flat `--plum-2` fill, `1px solid --plum-deep`, radius `--r-hero`, fills the carousel frame. All text is cream. No gradient, no dot texture, no drop shadow.
- **Header:** mono eyebrow `Pastor Pulse · {type}` in translucent cream with a solid cream lead dot; a small top-right **`Anonymous`** mono tag (translucent cream). Serif question, 24px/600, cream.
- **Translucent-cream controls (new control treatment — plum-card only):** interactive controls on the plum card are cream-at-low-opacity **at rest** and **solid `--cream` when chosen** (chosen text flips to `--plum-2`). Express every translucency as `color-mix(in srgb, var(--cream) N%, transparent)` — **never** a raw `rgba()` and never a translucent *plum* fill. This is the only place this treatment is used; it does not replace the standard §4.3 button roles anywhere in cream space.
  - **Poll** — auto-layout by option length: short options (≤24 chars) → wrapping **chips**; long/sentence options → **stacked rows** with a leading radio dot.
  - **Scale** — a **1–10 drag slider**: cream track-fill + cream thumb, a value bubble above the thumb, a 1–10 tick row and low/high word anchors. The value is **unset until the user interacts** (thumb rests at mid, bubble hidden, submit dim).
  - **Open / Prayer** — a translucent-cream textarea; **Prayer** adds a small lock + "Shared privately with the prayer team" privacy line.
- **Submit:** the §4.3 **hero-invert** primary (cream bg / `--plum-2` text), label "Submit anonymously"; dims to `opacity 0.35` (stays cream — do NOT swap to the cream-2/faint disabled treatment on this dark card) and disables until the answer is valid.
- **Answered state:** on submit the interior collapses to a centered cream check + "Thanks for sharing." / "Your response was received anonymously.", then the slide **drops out of the carousel** (~2s later) so content slides take the lead.
- **Gating (peek-past):** the pulse holds the lead and the carousel does **not** auto-rotate away from it, but the viewer **may** manually page to other slides; it stays first until answered, then leaves. (Not a hard block.)

### 4.2 Tabs (underline)
- Container: `display: flex; gap: 32; border-bottom: 1px solid #E8E2D2;`
- Tab: `padding: 12px 0 14px; font-size: 15;`
- Inactive: color `#8A8497`, weight 400, `border-bottom: 2px solid transparent`
- Active: color `#2D0F2E`, weight 600, `border-bottom: 2px solid #3E1540`, `margin-bottom: -1px`

**Underline tabs switch VIEWS.** For mutually-exclusive FILTERS/modes, use the sanctioned `SegmentedControl` (R4, ratified 2026-07-09) — radius-999 pills carrying the one selected-state grammar (§4.4). Never boxed/pill TABS for view navigation; never underline tabs for filters.

#### SegmentedControl (exclusive filters/modes)
`SegmentedControl` in `components/central/segmented-control.tsx` (barrel-exported from `@/components/central`). The sanctioned control for exclusive FILTER/mode selection — **not** view navigation (views use underline tabs above). Props: `options: {id, label}[]` (label accepts `ReactNode`), `value`, `onChange`, optional `size` (`'sm'` default). Renders a row of radius-999 pills (composed from `FilterChip`) carrying **the one selected-state grammar** (§4.4): selected = `--plum-tint` bg + `--plum` text + 1px `--plum` border; unselected = `--cream` bg + `--body` text + 1px `--line-2` border. Radiogroup semantics (`role="radiogroup"` on the row, `role="radio"` + `aria-checked` on each pill). Examples in use: **Church | My Chats** (chats), **Cards | Compact** (announcements layout).

#### Critical implementation rule
There is exactly **one** tab strip component in this codebase: `PlanSubTabStrip` in `components/central/plan-sub-tab-strip.tsx` (barrel-exported from `@/components/central`). Every tab strip — team pages, event plan pages, profile pages, anywhere — must use this same component. Never inline tab styles or create a new tab implementation. If you need a tab strip, import and use the existing shared component.

The wrapper `<div>` around `PlanSubTabStrip` must have **zero horizontal padding**. The `border-bottom: 1px solid #E8E2D2` inside the component must run edge-to-edge within its parent container. Horizontal breathing room belongs on the **content div below**, not on the tab strip wrapper. Adding horizontal padding to the tab strip wrapper breaks the border alignment and makes the strip look different from every other tab strip in the app.

This rule exists because tab styling has broken multiple times due to duplicate implementations drifting apart and wrapper padding being applied to the wrong element.

### 4.3 Buttons

Buttons are assigned by **semantic role**, never ad-hoc color. **Exactly one primary (loud) button per view.** No near-black fills anywhere — the only dark-on-light case is the hero-invert (cream button on a plum hero). Always use `CentralButton` / `IconButton` (`components/central/button.tsx`) — never a raw `<button>` with inline color.

| Role | Use | BG | Text | Border |
|---|---|---|---|---|
| **Primary** | the one main action (Save / Send / Create) | `--plum` `#3E1540` | cream | none |
| **Secondary** | beside primary (Cancel / alt) | transparent | `--body` | 1px `--line-2` |
| **Quiet** | inline low-stakes text action | none | `--plum` | none |
| **Create** | "+ New X" | `--ivory` | `--ink` | 1px `--line` |
| **Destructive** | delete / archive affordance | transparent | `--danger` | 1px `--danger` |
| **Danger-solid** | the **confirm** click only | `--danger` | cream | none |
| **Icon-only** | gear / kebab / edit / close | transparent → `--ivory` hover | `--muted` | none |

- **Sizes:** `sm` (8×14, 13px — list rows, headers) and `md` (11×20, 14px — forms, CTAs). Radius `--r-input` (10).
- **Disabled:** the enabled role's exact style at `opacity: 0.5` + `cursor: not-allowed`. Never a separate gray/mauve disabled fill — CentralButton/IconButton own this; delete call-site overrides. *Scoped exception:* the §4.1c pulse-card on-dark primary dims to opacity 0.35 staying cream.
- **Hero-invert:** a primary inside a plum hero flips to cream bg / plum text.
- **Verb→icon map (one icon per verb, everywhere):** Edit = `Pencil`, Delete = `Trash2`, Add/Create = `Plus`, Close/Cancel = `X`, Confirm = `Check`, Settings = `Settings`, Search = `Search`.

**Do not:** use near-black (`--plum-2` / `--ink`) as a button fill; use more than one primary per view; hand-roll a raw `<button>` with inline colors; use two different icons for the same verb (the old `Edit3`/`Pencil` split). Legacy `CentralButton` variants (`plum-outline`, `ghost`, `soft-pill`) remain only until their call sites are migrated.

### 4.4 Inputs
- **Standard input:** 12×14 padding, 1px `#E2DDCF`, radius 10, `#FDFCF8` bg, 15px sans.
- **Inline serif input** (announcement title, journal entries): 8×0 padding, no border, `border-bottom: 1px solid #E2DDCF`, transparent bg, 36px serif weight 600, letter-spacing -0.02em. Placeholder uses helper-text `--faint` (quiet guidance), not label `--muted-text`.
- **Textarea body** (announcement, transition note): 19px serif, line-height 1.65, no border, transparent bg, vertical resize, min-height 540 for full-page editors.
- **Pill picker row** (audience, options): horizontal flex wrap gap 6–8. **The one selected-state grammar (R4):** On state = 1px `--plum` border, `--plum-tint` bg, `--plum` text. Off state = 1px `--line-2` border, `--cream` bg, `--body` text. The previous solid-plum on-state (cream text on a `--plum` fill) is **retired (R4)**. The shared `FilterChip` primitive is the canonical implementation and now renders this ONE grammar — the `plum`/`ivory` tone fork is retired (the `tone` prop is still accepted for backward compat but is a no-op). This same grammar is the universal selected-state surface across chips, `SegmentedControl` segments, selected cards, and active nav rows (§1.2 `--plum-tint`).

### 4.5 Cards
- **Standard card:** `#FDFCF8` bg, 1px `#E8E2D2` border, radius 12–14, padding 18–22. Shares the same tone as the page body — separation from the background is by hairline border alone, not by tone contrast.
- **Soft callout card:** `#F1ECDE` bg, 1px `#E2DDCF` border (used for emphasized stat cards, readiness).
- **Inset card:** `#F6F2E8` bg, 1px `#E8E2D2` border (verse callout, accent panels).
- **Hero card** (Up Next): use full §4.1 hero banner treatment at smaller scale.

### 4.6 Stat card
Used in clusters at the top-right of editorial pages (event overview, settings overview).
```
padding: 14–22
border: 1px solid #E8E2D2
border-radius: 12–14
background: #FDFCF8
```
- Mono eyebrow
- Serif number 28–40
- 12–13px muted sub-label

### 4.7 Pills & badges
- **Category pill** (event category, post type): radius 999, padding 5×12, `#F1ECDE` bg, `#3E1540` text, 11–12px, weight 500, letter-spacing 0.4–0.6, uppercase for small variants.
- **Role badge:** Admin = `#2D0F2E` bg / cream text; Leader = `#F1ECDE` bg / plum text; Member = `#F1ECDE` bg / muted text. All radius 999, 4×10, 11px weight 500.
- **Soft pill** (assigned-to chip): radius 999, padding 5×12, `#F1ECDE` bg, 1px `#E8E2D2`, plum-2 text 12–13px. Avatar circle 24px on the left when used for people.
- **Status pill:** derived from a semantic accent, never an invented hex. bg `color-mix(in srgb, <accent> 13%, var(--cream))`; text `color-mix(in srgb, <accent> 65%, var(--ink))`. Accents: `--success` (ok/on-track), `--gold` (pending/warn), `--danger` (error/overdue). Radius 999. Replaces all traffic-light hexes (`#FDE68A`, `#22C55E`, `#92400E`, …).

### 4.8 Avatars

> **Canonical source:** Avatars/monograms are unified into the live **`MonogramChip`** component (`components/central/MonogramChip.tsx`) — every monogram is a **circle** (border-radius 999), **plum `#3E1540`** background, **cream** initials. That component is the single source of truth; the legacy bullet below (square monograms, ivory/dark/non-plum backgrounds) is retired.

- **⛔ RETIRED — DO NOT USE (reference only):** ~~**Square monogram (default):** 32–44px, radius 8–11. `#3E1540` plum bg + cream initial for plum-emphasized; `#F1ECDE` bg + plum text for muted; `#13101A` for user/dark.~~ Superseded by `MonogramChip` (circle / plum `#3E1540` / cream initials). No square monograms, no non-plum avatar backgrounds.
- **Round avatar** only in chat avatar stack (16px overlapping circles).
- Initial style: sans weight 600, size ~36% of avatar.

### 4.9 Toggle switch
- Track: 34–38 × 20–22, radius 999. Off: `#D6D0C0`. On: `#3E1540`.
- Thumb: 16–18 sq, radius 999, cream bg, 2px inset.
- Label: 13px weight 500 ink + 12px muted sub-label. Always pair toggle with a description sentence.

### 4.10 Checkbox
- 18 sq, radius 5, 1.5px border.
- Off: border `#C4C0B0`, transparent bg.
- On: border + bg `#3E1540`, cream `✓` 11px.

### 4.11 Hairline rules
- Section dividers: 1px `#E8E2D2`.
- Row dividers inside lists: 1px `#EFE9DA`.
- Last row in a list: **no border**, not a fading edge.
- **Hairline sizing principle:** a hairline is always inset from the hard container edges so it reads as a floating rule, not a wall-to-wall border. The inset amount should match the content it underlines — a hairline below a header that spans `px-6` content should be inset roughly to that content width, not fixed to an arbitrary page-margin constant. A hairline sized to the wrong content width looks truncated or overlong; size it to what it's separating.

### 4.12 Timeline rail
For meeting notes, transition notes, activity feeds.
- Left vertical line: 1px `#E2DDCF`, inset 9px from container.
- Bullet: 14px circle, cream fill, 2px plum border, positioned -23 from text column.
- Item padding-bottom 28.
- Item body in serif 15–19, line-height 1.6.

### 4.13 Quote / editorial paragraph
- Left rule: 2px `#3E1540`, paddingLeft 22.
- Body: serif italic 19, line-height 1.45, ink color.
- Attribution: 13px muted with name in `#2D0F2E` weight 500.

### 4.14 Calendar grid
- 7-column grid, radius 14, 1px `#E8E2D2` outer border, cream bg.
- Day header row: `#F6F2E8` bg, mono 10px labels.
- Day cells: min-height 88, padding 8×10. Right border `#EFE9DA` (except col 7); top border `#EFE9DA` (except row 1). Today cell: `#F6F2E8` bg + bold ink date.
- Event chip: padding 4×8, radius 6, `rgba(62,21,64,0.04)` bg, left border 2px in category color (`#3E1540` ministry / `#9D7B4F` social / `#5B7A6C` outreach), 11px plum-2 weight 500.
- **Click = navigate**. Never use a modal as an intermediate. Hover for peek only.

### 4.15 Chat bubble
- **Own (right):** plum-2 bg, cream text, 1px plum-2 border, radius 14, padding 10×14, 14.5px sans line-height 1.45.
- **Other (left):** cream bg, ink text, 1px `#E8E2D2` border, radius 14.
- **Reply quote inside bubble:** 8×10 inset, left rule 2px (cream on own, plum on other), radius 8.
- **Reactions row:** flat pills, 3×8 padding, radius 999, soft-tint bg matching bubble side.
- **Date divider:** standalone centered date — no flanking hairlines. Serif italic, muted text color, comfortable vertical spacing above and below. The date floats as its own calm separator (Messenger-style).

### 4.16 Composer
- Pill: 1px `#E2DDCF`, radius 16, `#F8F4EA` bg, padding 10/12/10/16.
- `+` attachment button left, formatting micro-toolbar middle, plum-2 send button (38 sq, radius 10).
- Helper line below: 11px `#A09A8C`, left = keyboard hint, right = audience scope.
- **Composer bar container:** no top divider, background continuous with the chat body background token. The bar blends into the thread — only the input pill itself carries a distinct affordance. The reply preview, attachment preview, and archived-state bars use the same background and no top border.

### 4.17 Modal (for **creation/config only**, never navigation)
Modals are reserved for *new-X* and configure-X flows where context needs to be preserved (e.g. quick-add behind a calendar, curating the home hero). For opening existing entities to **read/browse**, navigate to a page. Use sparingly. **Forms are modal-eligible (ratified 2026-07-05):** the form builder (create/edit) *and* the member fill-out both render in `CentralModal` at the hefty-form width — they're config / short data-entry, not browsing. **Data-entry modals (builder, fill) MUST pass `dirty`** so a stray backdrop/Escape shows a "Discard changes?" confirm instead of silently losing input.

**Every modal renders through `CentralModal`** (`components/central/central-modal.tsx`) — hand-rolled fixed-overlay panels are design debt. The canonical anatomy (ratified 2026-07-04, from the curate-hero manager):

- **Backdrop:** `rgba(19,16,26,0.55)` ink veil, no blur, `animate-backdrop-in`. Click-away closes.
- **Panel:** `var(--cream-2)` surface, radius `var(--r-callout)`, **no border, no shadow** — separation comes from the dark veil, not elevation. `maxWidth` per content (360 pickers · 420–480 forms · 520–560 wide forms · **~720 hefty/multi-question forms** — the form builder & fill-out), `maxHeight 85vh`, `animate-dialog-in`.
- **Header:** optional mono eyebrow (10px, 1.2px tracking, uppercase, `--muted-text`) over a serif 22/400 `--ink` title; hairline (`--line`) below; 32px circular X top-right (`--ivory` fill, 1px `--line`).
- **Body:** scrollable, `20px 24px` padding. Section labels inside use the mono eyebrow style.
- **Footer (optional):** action row above a top hairline — confirm/submit buttons live here, right-aligned (or full-width for single primary actions).
- **Closes three ways, always:** X · backdrop click · Escape (built into the component).
- **Z-index:** 200 default; override (e.g. 210) only when a modal must stack above another overlay.
- **Sheet variant** (`sheet` prop): bottom-pinned with rounded top corners on mobile, centered panel on md+ — for thumb-reach flows (polls, receipt submit).

Exceptions (not CentralModal): the command palette (top-anchored nav chrome), the image lightbox, and full-screen page-like overlays (§4.18 subpages, ChatScreen).

### 4.18 Triggered subpage
A **subpage** is a body button opening a temporary view or action surface (a note detail, a record detail, a responses view). It is **not** a modal. (Forms are the exception — builder + fill-out are §4.17 modals, not subpages.)
- **Consumes the full content body AND the page's own header.** The originating page's `TabPageHeader` does NOT survive — the subpage replaces it.
- **Content is full-width or centered** — never a small randomly-margined slice, never inline-within-the-parent's-padding. `width="full"` uses the standard `md:px-14` content inset; `width="centered"` uses a centered `maxWidth` column for small content.
- **Cream-on-cream only.** Background is `--cream`; components inside use `--cream-2` / `--ivory` / `--line`. Never `bg-white`, never inverted/dark.
- **No drop shadow** — a subpage is not a floating layer.
- **The shell breadcrumb persists and IS the back.** The subpage appends its own crumb(s) via the breadcrumb context; the parent crumb's `onClick` is the back. There is **NO** standalone "← Back" / "All workspaces" button.
- It renders **in the content area** — **never** a `fixed inset-0` portal.
- **Mobile** has no breadcrumb (it's desktop-only), so `SubpageShell` renders a single `md:hidden` back row derived from the parent crumb. Desktop stays breadcrumb-only; mobile gets that one back affordance automatically — never hand-roll a second one.
- Modals (scrim / centered, §4.17) cover *tiny* confirmations, creation/config, and **forms** (the builder + the member fill-out, at §4.17's hefty-form width with the `dirty` guard). Everything else that could plausibly be a full-bleed page — reading an existing entity, a record/note detail, a responses view — stays a subpage.
- **VERTICAL RHYTHM — HARD RULE (mirror top-level pages exactly; never hand-roll or eyeball these gaps):** a subpage's header/strip/body spacing is FIXED and identical to a `TabPageHeader` + `PlanSubTabStrip` + body composition. Do NOT add ad-hoc `marginTop`/`marginBottom` between the breadcrumb, header, strip, and body — they stack and drift.
  - **Header:** pass `title` to `SubpageShell` (never hand-roll an `<h1>` in the body). It renders `InsetHairline → var(--space-8) (22px) → PageTitle compact (25px serif) → var(--space-8) (22px) → InsetHairline`, butting the breadcrumb with **no top gap**.
  - **Header → section strip:** nothing. The `PlanSubTabStrip` owns its `12px` button top-padding; the strip wrapper gets **no** `marginTop`/`marginBottom`.
  - **Strip → body content:** the content wrapper's `paddingTop: 24` is the ONLY gap (the strip already ends in its own `InsetHairline`).
  - **No strip → body content (header straight to body):** body wrapper `paddingTop: 24`.
  - Spacing tokens only (`--space-*`, the 4/6/8/10/12/14/18/22/28/40/56 scale); `12`/`24` here are the existing strip/body constants — match them, don't invent in-betweens.
- **Canonical implementation:** `components/central/SubpageShell` (use its `title` prop — see the Student Org event page as the reference).

### 4.19 Empty / placeholder state
- Use a dashed-border card (`1px dashed #C4C0B0`, radius 10–14, transparent bg) with body color text and a single `+` icon.
- Voice: **descriptive, not chirpy.** "+ Assign someone", "+ Add image, file, or link". Never "Nothing here yet!" or emoji-led empty copy.
- For full-section empty states, follow with one neutral guiding sentence in 13px `#8A8497`.

### 4.20 Danger zone
Editorial inline rule, **not a red boxed callout**:
```
hr-1px #E8E2D2  ──── DANGER ZONE (mono, color #9F3030) ──── hr-1px #E8E2D2
```
Each destructive option is a row: serif 22 title + 13px body description + outline-destructive button on the right (border `#9F3030`, text `#9F3030`, transparent bg). Spacing 22–24 between rows.

### 4.21 Events agenda list (team Events section)

The team **Events** section is an **agenda/timeline list** (not a calendar grid — that's the General section). Events are grouped by **month** (mono divider label + `--line` hairline), each rendered as a three-column row: **date block** (serif day number ~38px, mono DOW/month) · **timeline spine** (2px `--line` rail + an 11px node, `--cream` fill / 2px `--dashed` border; the rail trims to the node on the first/last row so it doesn't overhang) · **body card** (standard cream card, hover border → `--dashed`). Each card carries a title (serif ~19/600), a meta row (date-time + optional location with stroked icons, `--faint` dot separators), a **countdown pill** (`--cream-2`/`--line-2`, or the `--ivory`/`--plum` "soon" variant within ~7 days; omitted for past events), and the faint `--faint` "has-a-plan" check. Click opens the event's plan workspace (no modal).

### 4.22 Read-only / preview mat (view-only workspace)

When someone views a workspace they can't edit (a governance admin with view-only access — `govView`), the whole view sits inside a **matted preview frame** — "art behind glass." This is the ratified read-only signal (cdesign 1a); it replaces the old flat `Viewing as admin · read-only` strip. **Plum-tint framing is sanctioned here as the read-only *semantic*** — the single frame + pill IS the signal, and it stays surgical (one 1px frame, not a surface). Canonical component: `ReadOnlyMat` / `ReadOnlyPill` (`components/central/read-only-mat.tsx`).
- **Mat frame:** `1px solid color-mix(in srgb, var(--plum) 42%, var(--cream))`, radius `--r-callout`, `--cream` bg, plus a subtle **inset** double-mat ring `inset 0 0 0 4px var(--cream), inset 0 0 0 5px color-mix(in srgb, var(--plum) 12%, var(--cream))` (an inset texture, **not** an elevation drop-shadow — §8.10 still bans drop-shadows). Inset from the shell (`36px 18px 18px`, 36 top for the pill).
- **Status pill** (straddling the top border, centered): `--plum-2` fill / `--cream` text, `EYEBROW_STYLE` mono, radius 999, **no drop-shadow**. "Read-only view · viewing as Admin" with a leading Eye icon (this reuses the §4.7 plum-2 admin-badge fill; it's a badge, not a §4.3 button).
- **Footer** (pinned at the mat bottom, always visible): top hairline `color-mix(in srgb, var(--plum) 14%, var(--line))`, a Lock icon (`--plum`) + a **`--body` sentence** ("…exactly as an Admin sees it. Nothing here can be changed.", emphasis word `--ink`/weight-500). No action button.
- **Single-scroller rule:** the mat's scroll region must be byte-equivalent to the plain `flex-1 overflow-y-auto` it replaces (padding lives on the non-scrolling frame, not the scroller) so shell-mounted children (Convention #13) keep exactly one active scrollbar.
- **Mobile:** lighter — just the `ReadOnlyPill` inline, no frame/footer (a full mat is cramped on a narrow screen).

**"Up Next" card (the closest upcoming event)** — the one emphasized entry: a plum date number, a **plum timeline node with a subtle pulse ring** (2.4s, `prefers-reduced-motion` → static faint ring), and a `--cream-3` callout carrying the **authorized §8.7 left-border exception** (`border-left: 3px solid var(--plum)`, `--r-callout`). Inside: a plum mono "Up next · Starts in N days" eyebrow (+ plum dot), a serif ~23 title with date-range/location meta, and a right-aligned **big countdown** (serif ~22 `--plum` number + mono unit). This is the only sanctioned left-border rounded callout in the app.

**Sub-events disclosure** — events with children (`calendar_events.parent_event_id`) show a plum "Sub-events (N)" toggle (rotating chevron + `--ivory` count pill) that expands an inline panel (max-height transition) of child rows: a mini date, a mini sub-spine, and a small cream sub-card (child title ~15/500 + description + right-aligned mono time). The Up Next event's panel defaults open.

**Past events** — events before today are split out below the upcoming list behind a **collapsed** "Past events (N)" toggle divider (centered mono label + rotating chevron + `--ivory` count pill, flanked by `--line` hairlines). Expanded, past events list **reverse-chronologically** (most recent first, not month-grouped) and **de-emphasized**: `--cream-2` card at `opacity .82` (hover → 1), title `--body`/500, meta `--faint`, a muted date block, and a `--line-2` spine node carrying a small cream "done" check. Each shows an "Ended · {relative}" mono `--faint` label instead of a countdown, and no sub-events disclosure. The toggle defaults open only when there are zero upcoming events (so an all-past list isn't hidden).

### 4.22 Event overview (EventPlanWorkspace overview tab)

The **Overview** tab of an event's plan workspace is a **two-column** layout (`1fr 336px`) shared by all standard team events (worship weeks use their own workspace, not this). Under the serif event title + underline tabs:

**Left column** —
- **Identity header:** the serif event date + a compact facts list (mono key `Time` / `Where` / `What` + value; empty facts omitted), with an **"Edit event"** outline button (edits the calendar-event identity) — bottom hairline.
- **Launchpad** ("Jump into planning"): a column of link rows into the event's OWN planning tabs, built dynamically per event template — **Checklist** and **Roles & Leads** always first (each with a metric: a mini `--plum` progress bar + "N / M" for checklist, "N / M assigned" for roles), then one row per the event type's `extraTabs` (Sub-events, New Folks, Acts, Teams, Transport, Program). Each row: ivory icon-chip (plum icon) + serif title + subtitle + right-side metric/arrow; hover → `--plum` border + slight translateX. **No left-border on the primary rows** — they're distinguished by position + the progress metric, not a border (the §8.7 exception is NOT extended here).
- **Planning notes** (demoted): an editable `--cream-2` box for free-form context.

**Right column** — three stat cards (`--cream`, `--r-callout`): **Expected turnout** (serif number or `—`, click-to-edit), **Budget** (allocated number, click-to-edit; divider; ministry-allocation sub-line or "No ministry budget set"), and **Readiness** (a status dot — `--gold` needs-attention → `--success`/`--sage` ready — + a 5-segment bar + "X of N done · P%", derived from checklist completion).

---

## 5. Page header recipe

A new page MUST be assembled like this:

```
<Chrome activeRail="..." navMode="..." crumbs={[...]}>
  {hero ? <PlumHero {...}/> : <PageTitleBlock {...}/>}
  <TabStrip tabs={[...]} active={...}/>
  <Section eyebrow="..." title="...">
    ...
  </Section>
</Chrome>
```

Mandatory elements above the fold:
1. Mono eyebrow
2. Serif title
3. One descriptive sentence in body color (max ~120 chars)
4. Optionally a hero stat row (3 stat cards). **No primary/create button sits at the title baseline** (R1) — the page's create lives in its collection content header (§3.2 Zone C); only the Zone-B Settings gear may share the title row.

---

## 6. Content & copy

- **Headings are nouns, not commands.** "Roles & Leads", "Transition Notes", "Up Next" — not "Manage roles" or "View notes".
- **Eyebrows describe context.** "INSTITUTIONAL MEMORY — NEVER DELETED" beats "NOTES".
- **Helper text reads like a sentence.** End with a period when it's a full sentence; omit the period when it's a label fragment.
- **Numerals:** spell out one through nine in prose; use digits in stats, lists, and metadata.
- **Date format:** `Saturday, May 16` (no year unless it disambiguates). Time: `5:00 AM – 6:00 AM` with en-dash and en-space.
- **Possessives over second person where natural:** "Your teams · 2", not "Teams you're on (2)".

---

## 7. Layout patterns by page type

### 7.0 Horizontal width & whitespace — read before choosing any layout

A max-width cap is a **readability tool, not a default**, and never an excuse to leave half the content area empty. The failure mode to avoid: a fixed-width block left-aligned in a wide content area, stranding a large dead margin on one side (a 760px column on a 1400px desktop). "Make everything full width" is the wrong correction — it stretches prose and forms past a comfortable measure. The rule is by content type:

- **Reading- / form-measure content** (prose, devotionals, a single-column form, an editorial body): cap the line length for legibility (~460–720px by type size), but then **use the freed space** — center the column (`margin: 0 auto`) or pair it with a companion rail/aside. Never left-align a narrow column against empty space. (Auth body = 460 centered, onboarding = 560 centered, identity/settings = two-column `1.5fr/1fr` — all already do this.)
- **Collection / data content** (lists of cards, tables, stat grids, response charts): these have **no reading-measure constraint** — let them **fill the content area** out to the page padding (`px-14` / `0 40px`), and reflow into more columns as width grows. Do not trap a list or grid in a fixed narrow column.

Test before shipping: at desktop width, is there a large band of unused space with content hugging one edge? If yes, the layout is wrong — center/pair the capped column, or let the collection expand.

### 7.1 Identity page (team home, event detail, profile)
1. Plum hero
2. Underline tabs
3. Section grid: `1.5fr 1fr` two-column with primary content left, stat/aside column right
4. Optional below-fold section spanning full width (e.g. meeting-notes feed, transition notes)

### 7.2 List page (announcements list, directory)
- No hero — plain title block
- Filter rail / segmented control above the table
- Rows use 1px `#EFE9DA` dividers, never zebra striping

### 7.3 Form page (new announcement, new event when standalone)
- Full-page surface, never a modal when work is long-form
- Left column = writing surface (inline serif title input, formatting toolbar, large serif body textarea)
- Right column 320 wide = settings rail (audience, options, schedule, attachments)
- Footer is a hairline + actions: Preview / Save draft (secondary) on left, Publish (primary plum-2) on right
- Top-right of writing surface: "Auto-saved Ns ago" with success dot

### 7.4 Editorial reading page (transition notes, devotional, profile narrative)
- Left column = quote-rule prose, serif 19, gap 18 between items
- Right column = "leave a note" callout card (`#F1ECDE`) with a serif italic textarea

### 7.5 Settings page
- Two-column `1fr 280–320px`. Left: ministry profile card + members list + danger zone. Right: stat cards + discovery toggle + invite code card.

### 7.6 Auth/onboarding split-screen (login, signup, update-password)
Two-column split layout: photo panel on the left, form column on the right. Right column is wider than left (roughly 56/44). Implemented via `SplitShell` in `app/(auth)/shared.tsx` — use that component; do not reimplement the outer layout in individual auth pages.

**Photo panel (left):** Full-bleed chapel photo with plum gradient overlay. Brand lockup at top (`RingCrossLogo` inside a translucent square badge + "Central" in serif). Tagline at bottom in large-weight serif, followed by an italic scripture verse + mono reference. Panel is sticky so it stays fixed while a long form scrolls. Hidden on mobile.

**Form column (right):** Two-section structure:
- *Top bar* — persistent `min-height: 64` strip, always visible regardless of scroll. Contains navigation: a Back link (with `marginRight: auto` to push it left) + a secondary link ("Already have an account?" / "New to Central?") right-aligned. Both links in muted body color; the action link is plum-2, no underline until hover.
- *Form body* — flex-centered content area with `max-width: 460`. Starts with a mono eyebrow, then a large serif H1, then a subtitle in muted body color. Google OAuth button, then an OR divider (no built-in margin — callers add vertical spacing), then the field stack, then the primary plum CTA.
- Mobile wordmark (hidden on md+): `RingCrossLogo`-adjacent "Central" in serif, shown inline at top of form body when the photo panel is hidden.

**Component ownership:** `AuthPhotoPanel` owns the panel. `SplitShell` owns the grid + right column shell. Callers pass `topBar` (React node) and `children` (form body content). Shared primitives: `GoogleButton`, `OrDivider`, `EyeButton` — all from `app/(auth)/shared.tsx`.

### 7.7 Ministry registration wizard (`/onboarding`)
Two-panel layout: 320px cream context rail (left, fixed height) + scrollable content area (right, `flex: 1`). Entry is always via `/register-ministry` — never link directly to `/onboarding`.

**Context rail (left):** Background `--body-bg` (`#F4F1E8`), `border-right: 1px solid var(--line)`. Contains from top to bottom: brand lockup (`RingCrossLogo` in a 34px plum-2 square badge + "Central" in serif 21px); "REGISTER YOUR MINISTRY" mono eyebrow; vertical step list; verse callout card pushed to bottom with `margin: auto 18px 18px`. The rail does not scroll.

**Vertical step list:** Each step is a flex row: numbered dot (26px circle) + label text + small subtitle. Dots between steps are connected by a 1px × 14px vertical hairline. Dot states: *pending* = cream bg / muted text / hairline border; *active* = plum-2 bg / cream text / no border; *done* = ivory bg / plum checkmark. Label is muted and weight 400 when pending, ink and weight 500 when active.

**Content area (right):** Background `--cream`, `overflow-y: auto`. Content is `max-width: 560px, margin: 0 auto, padding: 56px 40px 80px`. Each step opens with a mono eyebrow ("Step N of 4 · Label"), then a serif H1 at 38px/weight 600/`-0.02em` tracking, then a subtitle in `--body` color.

**NavRow:** Flex row with `justify-content: space-between, margin-top: 36px`. Step 1: empty `<span>` left + Continue right. Steps 2–4: Back link (muted text, back-arrow icon, `gap: 8`) left + plum-2 CTA right. Back and CTA are always inline peers — never stacked vertically.

### 7.8 Marketing landing page (`/`, `components/landing-page.tsx`)
Type-led editorial layout on a flat cream background — no full-bleed photo hero. Implemented in `components/landing-page.tsx`, rendered by `app/page.tsx`.

**Nav:** Sticky, `height: 72px`, `background: rgba(253,252,248,0.92)`, `backdrop-filter: blur(16px)`. Border-bottom (`--line`) appears on scroll. Brand (logo + serif "Central") left; center links (Platform, Rhythm, Ministries); right: muted "Sign in" + plum-2 pill "Get started". Logged-in state: muted "Sign out" text + outline "Open app" button. Color never inverts — nav is always cream since the hero beneath it is also cream.

**Hero:** Asymmetric 2-column grid (`1.15fr 0.85fr`, `gap: 56`, `align-items: center`), inside a `max-width: 1100px` wrapper with `padding: 96px 0 64px`.
- *Left column:* Mono eyebrow → serif H1 72px/weight 600/`-0.025em`, ink, with `<em>` in plum-2 italic for the turn-of-phrase clause → serif subtitle 20px/`--body`/`max-width: 460` → CTA row (`gap: 12, margin-top: 34`): plum-2 pill primary (h 50, `padding: 0 26`) + ghost text link in plum-2.
- *Right column:* Framed photo — `aspect-ratio: 4/5`, `border-radius: 18px` (`--r-hero`), `border: 1px solid --line-2`, `overflow: hidden`. Gradient tint overlay (`linear-gradient(180deg, transparent 40%, rgba(27,10,30,0.72) 100%)`). Verse pinned bottom-left: serif italic 17px ivory + mono 10px reference at 1.4px letter-spacing. Hidden on mobile (`< 900px`).

**Rule:** 1px `--line` hairline divider between hero and features, inset to the `max-width: 1100px` column.

**Feature rows:** `padding: 84px 0`. Eyebrow + serif H2 44px/weight 600/`-0.02em`. Four numbered editorial rows, each `display: grid; grid-template-columns: 56px 1fr 1.4fr; gap: 28; align-items: baseline; padding: 30px 0`. First row `border-top: 1px solid --line`; subsequent rows `border-top: 1px solid --line-3`. Columns: serif italic numeral (i/ii/iii/iv, 20px) in `--muted-text` → serif feature title 26px/`--ink` → body copy 15px/`--body`/1.65 line-height.

**Rhythm section:** Background `--cream-3` (`#F6F2E8`), `padding: 84px 0`. Eyebrow + serif H2 40px/weight 600/`-0.02em`. List: `border-top: 1px solid --line`. Each row: `display: flex; align-items: baseline; gap: 24; padding: 22px 0; border-bottom: 1px solid --line`. Three columns: mono day label fixed `width: 150px` in `--muted-text` → serif action 24px/`--ink`/`flex: 1` → muted attribution 13px.

**CTA section:** Cream background (never plum here), `text-align: center`, `padding: 96px 0`. "BEGIN" mono eyebrow → serif H3 60px/weight 600/`-0.025em`/`--ink` → serif italic subtitle 20px/`--body` → CTA row (`gap: 14`, `justify-content: center`): plum-2 pill primary (h 50) + ghost text link in plum-2.

**Footer:** Single row, `padding: 48px 0`, `border-top: 1px solid --line`. Brand lockup (`RingCrossLogo` + serif "Central") left; italic serif tagline + "© Central" right in `--muted-text`.

**Do not:** put a full-bleed photo behind the hero — the photo is contained inside the right-column frame only. Do not use a plum background for the CTA section — this page uses cream throughout. Do not add a dot-texture overlay anywhere on this page.

---

## 8. Specific "do not" — fixes that were applied across redesigns

These bullet-pointed pitfalls were the recurring failures in the original screens. Treat each as a hard rule.

1. **No modal-in-the-middle-of-navigation.** Clicking an event must open the plan page directly. Modals are for *creation*, peeks are hover popovers.
2. **No tabbed kitchen-sink under "Plan".** Each event is a destination; the workflow tabs (Overview/Checklist/Roles/Notes) belong to that destination, not to a global Plan tab.
3. **No white cards on white bg.** Always cream surface; differentiate with hairlines and inset shades.
4. **Headlines are Bricolage Grotesque at weight 600, body/UI text at weight 400.** Do not use weight 600 for body copy, labels, or metadata — reserve it for heading hierarchy (H1, H2, display).
5. **No emoji-led status pills, no traffic-light colors, no invented hexes.** Status pills derive from the semantic accents via the §4.7 formula. Traffic-light hexes (`#FDE68A` / `#22C55E` / `#92400E` style) are banned.
6. **No red filled "Delete" buttons.** Destructive actions are outline-only in `#9F3030`.
7. **No left-border-accent rounded callout cards.** The only left-rule pattern allowed is the editorial quote (§4.13), the timeline rail (§4.12), and — as a **single authorized exception (July 2026)** — the **Events "Up Next" card** (§4.21): a `cream-3` rounded callout with a `border-left: 3px solid var(--plum)` marking the closest upcoming event in the team Events agenda. This is the one sanctioned left-border rounded callout; do not generalize it to any other card.
8. **No gradient backgrounds outside the hero banner.** Cream surfaces never have gradients. **Scoped exception (July 2026): the checklist high-priority row highlight.** A `priority === 'high'` task row in the event Checklist carries a solid light-plum tint across the whole row — `background: color-mix(in srgb, var(--plum) 7%, transparent)` (a flat highlight, NOT a gradient and NOT a left-border rail). This is the one place a light-plum row highlight marks state; it reads as a subtle "flagged" wash, not a plum surface. Scoped to this list — do not reuse it elsewhere. (Priority is a binary high/not-high flag, toggled in the row editor.)
9. **No iconography invented for "fun" decoration.** Icons are functional. If a slot would otherwise be empty, prefer a dashed placeholder over decorative icons.
10. **No drop shadows anywhere.** Cards separate by border and surface tone; modals separate via the §4.17 ink veil, not elevation (ratified 2026-07-04 — the modal-shadow carve-out is retired).

**Ratified exception — Home greeting sheen (2026-07-05):** the Home page greeting's animated text sheen (`.greeting-sheen` / `.greeting-sheen-plum`, globals.css) is an approved living-accent: a slow gradient text-fill shimmer on the greeting line only, static under `prefers-reduced-motion`. Scoped to the Home greeting — not a license for gradient text or ambient animation elsewhere.
11. **No `Inter` for big numbers.** Stat numbers are serif.
12. **Sidebar holds workspace, teams, and a team's nested sections/events — never a global event dump.** Within a team's planning workspace, the team's sections (General, Plan, Resources, Groups, Rotations) live in the sidebar, and events nest under the Plan section as children. This is intentional and scoped to the target ministry size (see §0): a team carries a small, bounded set of events (roughly under ten), so nesting them keeps navigation to a single vertical hierarchy and avoids stacked horizontal tab rows. Events are sorted by date. Do NOT nest events in the sidebar OUTSIDE a team's Plan section, and do NOT treat unbounded event growth as a case to design for here — that is explicitly out of scope (§0).
13. **No "Plan this event" launchpad modal between calendar and event.** Removed.
14. **No invite-code CTA on the ministry chooser.** Removed.
15. **Sidebar must change with context** — `navMode="home"` for admin surfaces, `navMode="teams"` for team-scoped surfaces. They are NOT the same component invocation.
16. **Long-form creation is full-page, not modal.** Announcements use the full-page editor; modal is forbidden for this flow.
17. **Pages never start without a mono eyebrow.** Every H1 is preceded by mono context.
18. **Verse callout is permanent.** Don't drop it to save space.
19. **Underline tabs for views; `SegmentedControl` (§4.2) for exclusive filters — never mix the two roles.** Never boxed/pill tabs for view navigation; never underline tabs for filters/modes.
20. **Cream bg `#FDFCF8`, page bg `#F1ECDE`** — never invert.
21. **No fixed-width column stranded in a wide content area.** Cap width only for reading measure (and center or pair it); let lists, grids, tables, and stat content fill the content area (§7.0). A page with content hugging one edge and a dead band of unused space on the other is a layout bug.

---

## 9. Accessibility & responsiveness

- Minimum hit target 30 sq for chrome buttons, 34 sq for primary header buttons.
- Body text minimum 13px; sub-labels minimum 11px (mono eyebrows excepted as labels).
- Color contrast: ink `#13101A` on cream `#FDFCF8` is the primary text pair; do not use `#8A8497` on `#FDFCF8` for anything longer than a label.
- Layouts are designed at 1440 width and scale by content reflow, not by hiding columns.

---

## 10. Quick reference — "is this Central?"

Ask before shipping any new page:

- [ ] Cream surface, not white?
- [ ] Mono eyebrow above every title?
- [ ] Serif title at the correct scale?
- [ ] Hero banner only if this is an identity page?
- [ ] Underline tabs (never pill)?
- [ ] Verse callout still in the sidebar?
- [ ] Primary CTA is plum (or cream-on-plum if inside hero)?
- [ ] All dividers 1px and in the cream-line palette?
- [ ] Editorial helper text in body color, not muted?
- [ ] No modal where a navigation should be?

If any box is unchecked, the page is not consistent — go back.

---

## 11. Canonical code snippets

Paste-ready patterns. Use these verbatim when assembling a new page — they encode every spacing, color, and weight decision above.

### 11.1 Page scaffold
```jsx
<Chrome
  activeRail="plan"            // home | chat | people | profile | love | plan
  navMode="teams"              // teams | home
  activeTeam="student"         // praise | student      (when navMode=teams)
  activeHomeItem="home"        // home | announcements | settings (when navMode=home)
  crumbs={["Central", "Student Org Board", "Plan", "SSO"]}
>
  {/* Hero (identity pages only) OR page-title block */}
  {/* Tab strip */}
  {/* Sections */}
</Chrome>
```

### 11.2 Mono eyebrow
```jsx
const mono = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11, letterSpacing: 1.4, color: "#8A8497", textTransform: "uppercase",
};

<div style={mono}>SATURDAY, MAY 16 · SOCIAL</div>
```

### 11.3 Page-title block (no hero)
```jsx
<div>
  <div style={mono}>MINISTRY ADMIN</div>
  <h1 style={{ fontFamily: "var(--serif)", fontSize: 48, margin: "6px 0 0",
               letterSpacing: "-0.02em", color: "#13101A" }}>
    Church Settings
  </h1>
  <div style={{ fontSize: 15, color: "#5A5466", marginTop: 8 }}>
    Identity, members, and discovery controls for your ministry.
  </div>
</div>
```

### 11.4 Plum hero banner

> **⛔ RETIRED — DO NOT USE — preserved for reference only.** The plum hero gradient is retired from all app-shell surfaces (see §4.1 Status note). The square monogram chip inside this sample also contradicts the unified avatar spec — use the circular `MonogramChip` (§4.8). Do not copy this block as canonical code.

```jsx
{/* ⛔ RETIRED — DO NOT USE — reference only. Hero gradient retired from app-shell surfaces; the monogram below is square/non-canonical — use MonogramChip (circle / plum / cream). */}
<div style={{
  position: "relative", marginTop: 18,
  borderRadius: 18, overflow: "hidden",
  background: "radial-gradient(120% 100% at 0% 0%, #4A1B4D 0%, #2D0F2E 55%, #1B0A1E 100%)",
  color: "#FDFCF8", padding: "30px 36px 32px",
}}>
  {/* dot texture — required */}
  <div style={{
    position: "absolute", inset: 0, opacity: 0.18, pointerEvents: "none",
    background: "radial-gradient(rgba(253,252,248,0.6) 1px, transparent 1.4px) 0 0 / 14px 14px",
  }}/>
  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 24 }}>
    {/* ⛔ RETIRED square monogram — contradicts the unified avatar spec. Use circular MonogramChip (border-radius 999, plum #3E1540 bg, cream initials). */}
    <span style={{
      width: 92, height: 92, borderRadius: 18,
      background: "rgba(253,252,248,0.08)",
      border: "1px solid rgba(253,252,248,0.18)",
      display: "grid", placeItems: "center",
      fontFamily: "var(--serif)", fontSize: 46, color: "#FDFCF8", flexShrink: 0,
    }}>S</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...mono, color: "rgba(253,252,248,0.65)" }}>SATURDAY, MAY 16 · SOCIAL</div>
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 56, lineHeight: 1,
                   margin: "8px 0 0", letterSpacing: "-0.02em", color: "#FDFCF8" }}>SSO</h1>
      <div style={{ fontSize: 15, color: "rgba(251,248,242,0.78)", marginTop: 10 }}>
        Senior Send Off &nbsp;·&nbsp; 5:00 AM – 6:00 AM &nbsp;·&nbsp; Church Courtyard
      </div>
    </div>
    {/* right-side actions: cream-on-translucent secondary, cream-fill primary */}
  </div>
</div>
```

### 11.5 Underline tab strip
```jsx
<div style={{ display: "flex", gap: 32, borderBottom: "1px solid #E8E2D2" }}>
  {tabs.map(t => {
    const on = t === active;
    return (
      <button key={t} onClick={() => setActive(t)} style={{
        background: "none", border: "none", cursor: "pointer",
        padding: "12px 0 14px", fontSize: 15, fontFamily: "var(--sans)",
        color: on ? "#2D0F2E" : "#8A8497",
        fontWeight: on ? 600 : 400,
        borderBottom: on ? "2px solid #3E1540" : "2px solid transparent",
        marginBottom: -1,
      }}>{t}</button>
    );
  })}
</div>
```

### 11.6 Two-column section
```jsx
<section style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 28, marginTop: 36 }}>
  <div>
    <div style={mono}>EVENT BRIEF</div>
    <h2 style={{ fontFamily: "var(--serif)", fontSize: 36, margin: "6px 0 0",
                 letterSpacing: "-0.02em", color: "#13101A" }}>Planning Details</h2>
    {/* body 15 sans #5A5466 line-height 1.7 */}
  </div>
  <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    {/* stat cards */}
  </aside>
</section>
```

### 11.7 Stat card
```jsx
<div style={{ padding: 22, border: "1px solid #E8E2D2", borderRadius: 14, background: "#FDFCF8" }}>
  <div style={mono}>EXPECTED TURNOUT</div>
  <div style={{ fontFamily: "var(--serif)", fontSize: 40, marginTop: 10,
                color: "#13101A", letterSpacing: -0.6 }}>100</div>
  <div style={{ fontSize: 13, color: "#8A8497", marginTop: 4 }}>guests · capacity 120</div>
</div>
```

### 11.8 Primary / Secondary buttons
```jsx
const btnPrimary = {
  padding: "12px 22px", borderRadius: 10, border: "none",
  background: "#2D0F2E", color: "#FDFCF8",
  fontSize: 14, fontWeight: 500, fontFamily: "var(--sans)", cursor: "pointer",
};
const btnSecondary = {
  padding: "10px 16px", borderRadius: 10, border: "1px solid #E2DDCF",
  background: "transparent", color: "#5A5466",
  fontSize: 13, fontFamily: "var(--sans)", cursor: "pointer",
};
const btnPlumOutline = {
  padding: "8px 14px", borderRadius: 10, border: "1px solid #3E1540",
  background: "transparent", color: "#3E1540",
  fontSize: 13, fontWeight: 500, fontFamily: "var(--sans)", cursor: "pointer",
};
const btnDestructive = {
  padding: "10px 18px", borderRadius: 10, border: "1px solid #9F3030",
  background: "transparent", color: "#9F3030",
  fontSize: 13, fontWeight: 500, fontFamily: "var(--sans)", cursor: "pointer",
};
```

### 11.9 Editorial quote (transition notes pattern)
```jsx
<article style={{ position: "relative", paddingLeft: 22, borderLeft: "2px solid #3E1540" }}>
  <div style={{ fontFamily: "var(--serif)", fontStyle: "italic",
                fontSize: 19, lineHeight: 1.45, color: "#13101A" }}>
    “Start outreach to the graduating class 3 weeks out — sign-ups dropped off last year when we waited.”
  </div>
  <div style={{ marginTop: 10, fontSize: 13, color: "#8A8497" }}>
    <span style={{ color: "#2D0F2E", fontWeight: 500 }}>Min Park</span> · Past President · 2025
  </div>
</article>
```

### 11.10 Timeline rail (meeting notes pattern)
```jsx
<div style={{ position: "relative", paddingLeft: 28 }}>
  <span style={{ position: "absolute", left: 9, top: 8, bottom: 8,
                 width: 1, background: "#E2DDCF" }}/>
  {items.map((n, i) => (
    <article key={i} style={{ position: "relative", paddingBottom: 28 }}>
      <span style={{ position: "absolute", left: -23, top: 4,
                     width: 14, height: 14, borderRadius: 99,
                     background: "#FDFCF8", border: "2px solid #3E1540" }}/>
      {/* author row + serif 15 body */}
    </article>
  ))}
</div>
```

### 11.11 Pill picker (audience / category)
```jsx
{options.map(p => (
  <button key={p.label} style={{
    padding: "7px 12px", borderRadius: 999,
    border: "1px solid " + (p.on ? "#3E1540" : "#E2DDCF"),
    background:  p.on ? "#3E1540" : "#FDFCF8",
    color:       p.on ? "#FDFCF8" : "#5A5466",
    fontSize: 12, fontWeight: p.on ? 500 : 400,
    fontFamily: "var(--sans)", cursor: "pointer",
  }}>{p.label}</button>
))}
```

### 11.12 Toggle row (settings options)
```jsx
<div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
  <span style={{
    width: 34, height: 20, borderRadius: 999,
    background: on ? "#3E1540" : "#D6D0C0",
    position: "relative", flexShrink: 0, marginTop: 2,
  }}>
    <span style={{
      position: "absolute", width: 16, height: 16, borderRadius: 999,
      background: "#FDFCF8", top: 2, [on ? "right" : "left"]: 2,
    }}/>
  </span>
  <div>
    <div style={{ fontSize: 13, fontWeight: 500, color: "#13101A" }}>Pin to top</div>
    <div style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>
      Stays at the top of Announcements for 7 days
    </div>
  </div>
</div>
```

### 11.13 Dashed placeholder
```jsx
<button style={{
  padding: "14px 16px", borderRadius: 10,
  border: "1px dashed #C4C0B0", background: "transparent",
  color: "#5A5466", fontSize: 13, fontFamily: "var(--sans)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
}}>
  + Add image, file, or link
</button>
```

### 11.14 Danger-zone inline rule
```jsx
<div style={{ marginTop: 48 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <span style={{ height: 1, background: "#E8E2D2", flex: 1 }}/>
    <span style={{ ...mono, color: "#9F3030" }}>DANGER ZONE</span>
    <span style={{ height: 1, background: "#E8E2D2", flex: 1 }}/>
  </div>
  <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginTop: 22 }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontFamily: "var(--serif)", fontSize: 22, color: "#13101A" }}>
        Archive ministry
      </div>
      <div style={{ fontSize: 13, color: "#5A5466", marginTop: 6,
                    maxWidth: 520, lineHeight: 1.5 }}>
        Deactivates the ministry. Members lose access immediately. Data is preserved.
      </div>
    </div>
    <button style={btnDestructive}>Archive</button>
  </div>
</div>
```

---

## 12. File inventory — where the canonical examples live

When in doubt, open these files and copy the *exact* pattern. Do not interpret — replicate.

| Concern | Canonical file |
|---|---|
| Shell / chrome / sidebar variants  | `central/redesign-chrome.jsx` |
| Plum hero banner + identity tabs   | `central/redesign-event.jsx` → `EventHeader` |
| Editorial two-column section       | `central/redesign-event.jsx` → `OverviewTab` |
| Checklist / inline-add row         | `central/redesign-event.jsx` → `ChecklistTab` |
| Roles & dashed placeholders        | `central/redesign-event.jsx` → `RolesTab` |
| Editorial quote + leave-a-note     | `central/redesign-event.jsx` → `NotesTab` |
| Team home with calendar + timeline | `central/redesign-team.jsx` → `TeamHome` |
| Up Next hero card (compact)        | `central/redesign-team.jsx` → "Up Next" |
| Meeting notes timeline             | `central/redesign-team.jsx` → "Meeting notes feed" |
| Choose-ministry empty-feel landing | `central/redesign-onboarding.jsx` → `ChooseMinistry` |
| Full-page editor (long-form form)  | `central/redesign-onboarding.jsx` → `NewAnnouncementPage` |
| Settings layout + danger zone      | `central/redesign-onboarding.jsx` → `ChurchSettings` |
| Chat bubbles + reading-room thread | `central/redesign-chat.jsx` → `ChatScreen` |
| Composer pill                      | `central/redesign-chat.jsx` → composer block |
| Icon set (lucide-stroked)          | `central/icons.jsx` |

---

## 13. Starter page template

Drop this into a new file and replace the placeholder content. It is already correct **except for the identity-hero block**, which uses the **⛔ RETIRED plum gradient + square monogram** (see the marker on that block below). For any app-shell page, delete that block and use a cream identity header plus the circular `MonogramChip` (§4.8) instead.

```jsx
const MyNewPage = () => (
  <Chrome
    activeRail="plan"
    navMode="teams"
    activeTeam="student"
    crumbs={["Central", "Student Org Board", "MyNewPage"]}
  >
    {/* ⛔ RETIRED — DO NOT USE — reference only. This identity hero uses the retired plum gradient + square monogram (radius 16). For app-shell pages use a cream header + circular MonogramChip (§4.8). Delete this block if the page is NOT identity-anchored. */}
    <div style={{
      position: "relative", marginTop: 18,
      borderRadius: 18, overflow: "hidden",
      background: "radial-gradient(120% 100% at 0% 0%, #4A1B4D 0%, #2D0F2E 55%, #1B0A1E 100%)",
      color: "#FDFCF8", padding: "30px 36px 32px",
    }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.18, pointerEvents: "none",
        background: "radial-gradient(rgba(253,252,248,0.6) 1px, transparent 1.4px) 0 0 / 14px 14px" }}/>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 24 }}>
        {/* ⛔ RETIRED square monogram — use circular MonogramChip (border-radius 999, plum #3E1540 bg, cream initials). */}
        <span style={{ width: 84, height: 84, borderRadius: 16,
          background: "rgba(253,252,248,0.08)", border: "1px solid rgba(253,252,248,0.18)",
          display: "grid", placeItems: "center", fontFamily: "var(--serif)", fontSize: 40,
          color: "#FDFCF8", flexShrink: 0 }}>X</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...chromeMono, color: "rgba(253,252,248,0.65)" }}>EYEBROW · CONTEXT</div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 48, lineHeight: 1,
            margin: "8px 0 0", letterSpacing: "-0.02em", color: "#FDFCF8" }}>Page Title</h1>
          <div style={{ fontSize: 14, color: "rgba(251,248,242,0.78)", marginTop: 10 }}>
            One-sentence meta · with · separators
          </div>
        </div>
      </div>
    </div>

    {/* Tab strip */}
    <div style={{ marginTop: 22, display: "flex", gap: 32, borderBottom: "1px solid #E8E2D2" }}>
      {["Overview", "Detail", "Notes"].map((t, i) => (
        <div key={t} style={{
          padding: "12px 0 14px", fontSize: 15,
          color: i === 0 ? "#2D0F2E" : "#8A8497",
          fontWeight: i === 0 ? 600 : 400,
          borderBottom: i === 0 ? "2px solid #3E1540" : "2px solid transparent",
          marginBottom: -1, cursor: "pointer",
        }}>{t}</div>
      ))}
    </div>

    {/* First section — eyebrow + serif H2 mandatory */}
    <section style={{ marginTop: 36 }}>
      <div style={chromeMono}>SECTION CONTEXT</div>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 32, margin: "4px 0 0",
        letterSpacing: "-0.02em" }}>Section title</h2>

      {/* content here — refer to §4 for any component */}
    </section>
  </Chrome>
);
```

---

## 14. Deletion confirmation (mandatory)

**Every destructive action requires a two-step confirmation.** No exceptions — not even for small items.

### Inline confirmation pattern (preferred for table rows and list items)

First click replaces the delete control with a compact inline confirm:

```tsx
{confirmId === item.id ? (
  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
    <button
      onClick={async () => { setDeleting(item.id); setConfirmId(null); await onDelete(item.id); setDeleting(null) }}
      disabled={deleting === item.id}
      style={{ fontSize: 11, fontWeight: 600, color: "#9F3030", background: "#FEF2F2",
               border: "1px solid #FECACA", borderRadius: 6, padding: "2px 8px",
               cursor: "pointer", whiteSpace: "nowrap",
               opacity: deleting === item.id ? 0.5 : 1 }}
    >
      {deleting === item.id ? "Deleting…" : "Delete"}
    </button>
    <button
      onClick={() => setConfirmId(null)}
      style={{ fontSize: 11, color: "#8A8497", background: "none", border: "none",
               cursor: "pointer", padding: "2px 4px" }}
    >
      Cancel
    </button>
  </div>
) : (
  <button onClick={() => setConfirmId(item.id)} style={{ /* ghost X */ }}>
    <X size={13} />
  </button>
)}
```

**State shape:** always two separate state variables:
- `confirmId: string | null` — which item is awaiting confirmation
- `deleting: string | null` — which item is actively being deleted (shows "Deleting…", disables button)

**Rules:**
- Only one item can be in confirm state at a time — opening a new confirm closes the previous
- Cancel always restores the original X button immediately, no async needed
- "Delete" button text changes to "Deleting…" during the async call and disables itself
- Never use `window.confirm()` — it blocks the main thread and looks wrong on mobile

### Modal confirmation — `ConfirmDialog` (for standalone / substantial destructive actions)

For a destructive action that is **not** a dense table/list row — a delete/remove/leave triggered from a ⋯ overflow menu, a settings block, a card, a hero, or any single prominent affordance — use the shared **`ConfirmDialog`** (`components/central/confirm-dialog.tsx`, exported from `@/components/central`) instead of hand-rolling a `CentralModal` or a bare overlay. It is a thin wrapper over `CentralModal` (§4.17) that portals a centered confirm with a `secondary` Cancel + a `danger-solid` confirm button.

```tsx
const [confirmDelete, setConfirmDelete] = useState<Row | null>(null)
// the affordance sets a target instead of firing the mutation:
<button onClick={() => setConfirmDelete(row)}>…</button>
// one dialog per section:
<ConfirmDialog
  open={!!confirmDelete}
  title="Delete announcement?"
  message="This permanently removes it for everyone."   // optional; defaults to "This can't be undone."
  confirmLabel="Delete"          // "Remove" / "Leave" where the verb differs
  loading={deleting}             // shows "…", disables both buttons
  onConfirm={() => { const r = confirmDelete; setConfirmDelete(null); handleDelete(r) }}
  onClose={() => setConfirmDelete(null)}
/>
```

Props: `open, title, message?, confirmLabel="Delete", cancelLabel="Cancel", danger=true, loading=false, onConfirm, onClose`. Renders nothing when closed; portals to `document.body` (SSR-safe) so it escapes any `overflow-hidden` / transformed ancestor. `danger` uses `danger-solid`; pass `danger={false}` for a non-destructive confirm (uses `primary`).

### Which pattern
- **Inline two-step** — dense table rows and list items (member lists, category / link / verse rows). A modal would be overkill.
- **`ConfirmDialog`** — everything else: ⋯-menu deletes, settings-block removals, card / hero actions, leave-chat, poll delete.
- **Never fire a delete / remove / leave directly** — every destructive affordance routes through one of these two. A bespoke full-bleed-scrim confirm or a `window.confirm()` is design debt; migrate it to `ConfirmDialog`.

---

## 15. Final principle

When a decision isn't covered above, default to **less**. Less color, less weight, less border, less iconography. The Central app earns its character from *restraint* — every time the original screens went wrong, it was by adding (a gradient, a red, a bold sans, a modal, a tab, an icon). The corrections were almost always subtractive. Build that way.
