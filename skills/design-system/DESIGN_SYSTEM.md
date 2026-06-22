# Central — Design System

A formal spec reverse-engineered from `Central Redesign.html` and its component files. Any new page built against this doc should be indistinguishable from the established Home, Profile, Give, Plan, Chat, Announcements, and Settings screens.

This system replaces a more generic, white-card SaaS look with an **editorial cream-and-plum** aesthetic. The mistakes most often made on the originals — and the ones a sub-agent must NOT repeat — are listed at the end of each section as "Do not."

---

## 0. Design North Star

**"Reverent, not corporate. Warm, not cute. Calm, not playful."**

Central is a daily-driver tool that an entire church community lives in for communication, giving, and leadership. Warmth comes from tone, materials (cream surfaces, editorial serif), generous whitespace, and human language — NOT from decoration, bold color blocks, or playfulness. When any decision is unclear, default to calm and restraint.

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
| `--plum-2`      | `#2D0F2E` | Single primary CTA button, active breadcrumb text, identity hero gradient base (rare) |
| `--plum-deep`   | `#1B0A1E` | Hero gradient dark stop |
| `--plum-light`  | `#4A1B4D` | Hero gradient light stop |
| `--ink`         | `#13101A` | Primary text |
| `--body`        | `#5A5466` | Body text, sub-labels |
| `--muted`       | `#8A8497` | Tertiary text, eyebrow mono, labels |
| `--faint`       | `#A09A8C` | Disabled, helper text, timestamps |
| `--cream`       | `#FDFCF8` | Primary surface (page bg, cards) |
| `--cream-2`     | `#F8F4EA` | Inset surface (composer, dashed cells) |
| `--cream-3`     | `#F6F2E8` | Accent surface (verse callout, today cell) |
| `--body-bg`     | `#F4F1E8` | Desktop context sidebar panel — middle tier of three-tone desktop surface |
| `--ivory`       | `#F1ECDE` | Active sidebar item, soft-pill background; also the **B · Emphasis** surface for the single most prominent inset card (Up Next) |
| `--canvas`      | `#F1ECDE` | Design-canvas page bg outside artboards |
| `--rail`        | `#ECE6D6` | Desktop icon rail — darkest step of three-tone desktop surface |
| `--line`        | `#E8E2D2` | Primary hairline |
| `--line-2`      | `#E2DDCF` | Card border, input border |
| `--line-3`      | `#EFE9DA` | Faint row divider |
| `--dashed`      | `#C4C0B0` | Dashed placeholder borders |
| `--success`     | `#7FA67F` | Auto-save dot, "on track" indicator |
| `--warm-tan`    | `#9D7B4F` | Calendar "social" category |
| `--sage`        | `#5B7A6C` | Calendar "outreach" category |
| `--gold`        | `#D4A45C` | Avatar accent only — never as button color |
| `--danger`      | `#9F3030` | Destructive text/border only — never as filled button bg |

**Do not:** invent new neutrals. Do not use pure white (`#fff`) — always cream. Do not use saturated red, blue, or green for status. Do not use gradients except in the rare full-identity hero (§4.1). Do not use plum as a repeated surface, card background, or decorative fill — it is a surgical accent appearing in at most one or two intentional moments per view.

### 1.3 Typography

```
--serif: "Bricolage Grotesque", system-ui, sans-serif;  /* display/heading role */
--sans:  "Bricolage Grotesque", system-ui, sans-serif;  /* body/UI role */
--mono:  ui-monospace, SFMono-Regular, Menlo, monospace;
```

| Role | Family | Size | Weight | Letter-spacing | Use |
|---|---|---|---|---|---|
| Display    | serif | 56–64 | 600 | -0.02em      | Hero banner names ("SSO", "Student Org Board") |
| H1         | serif | 36–52 | 600 | -0.02em      | Page titles (PageTitle component default: 36px) |
| H2         | serif | 28–36 | 600 | -0.02em      | Section titles inside a page |
| H3         | sans  | 16–18 | 500 | 0            | UI-chrome card titles, role names, list headings. Serif H3 only for genuine editorial section heads within long-form content. |
| Body L     | serif | 19    | 400 | 0.1          | Long-form quotes, editorial body, transition notes, chat reading-room |
| Body       | sans  | 14–15 | 400 | 0            | UI copy, descriptions |
| Body S     | sans  | 12–13 | 400 | 0            | Secondary metadata |
| Eyebrow / Mono | mono | 11 | 400 | 1.4 | All-caps labels above any title or section. **Always required above page H1 and section H2.** |
| Numeric    | serif | 28–40 | 400 | -0.4 to -0.6 | Stat card numbers, invite codes — weight 400 is intentional; editorial numbers read differently from heading text |

**Pattern rules:**
- Every page title is preceded by an eyebrow mono label (`DATE`, `SECTION · CONTEXT`, `WORKSPACE`, etc.).
- Every section title inside a page repeats the eyebrow + serif H2 pattern.
- Long bodies (announcements, transition notes, chat thread) are set in **serif at 17–19px** for a reading-room feel — not sans body.
- Stat card numbers are serif, not bold sans.

**Display weight threshold:** Weight 600 is the heading emphasis carrier — use it at the top of the hierarchy only. Reserve weight 600 for: page H1, section H2, display/hero text. Use weight 400 for: editorial long-form body, stat card numbers, and all UI-chrome text (card titles in list views, role badges, metadata rows, tab labels, navigation items, helper copy). If more than two or three text nodes on a single screen carry weight 600, the hierarchy collapses and the effect is diluted.

**Do not:** mix typefaces — Central uses Bricolage Grotesque exclusively; never import additional font families. Do not use weight 600 for body copy, UI labels, or metadata — reserve it for heading hierarchy (H1, H2, display). Do not all-caps anything except mono eyebrows.

### 1.4 Spacing & radius
- **Scale:** 4, 6, 8, 10, 12, 14, 18, 22, 28, 36, 40, 56. Do not invent in-between values.
- **Page padding:** `0 40px 40px` on the main column; `22px 40px 0` on the breadcrumb header.
- **Section gap:** 28–36 vertical between major sections; 56 between calendar and meeting-notes feed.
- **Card padding:** 18 (small), 22 (default), 22×28 (wide stat row).
- **Radii:** 6 (tiny pills, icon buttons), 8 (chips), 10 (inputs, secondary buttons), 12 (most cards), 14 (sidebar callouts, prominent cards), 16 (composer pill), 18 (hero banner, full-bleed modal).
- **Hairlines:** always 1px, never 2px. Active tab underline is the only 2px rule.

### 1.5 Iconography
- Lucide-style stroked icons via the local `<Icon d={...}/>` component. Stroke 1.6, linecaps round.
- Icon sizes: 13 (inline button), 14 (label), 15 (header), 16–18 (rail).
- Icons sit in mono-cased squares (36×36 with radius 9) when they represent a team/avatar; sit naked when they sit next to text.

**Do not:** use emoji as iconography. Do not use Font Awesome / Heroicons mixed sets. Do not fill icons — strokes only.

---

## 2. Shell & navigation

### 2.1 Three-column workspace
```
[ 76px dark icon rail ] [ 220px cream sidebar ] [ flexible main ]
```

- **Icon rail** — `#13101A` background, plum primary "+" button at top, six section icons (Home, Chat, People, Profile, Pray, Plan). Active icon: `rgba(251,248,242,0.08)` background + 2px cream stripe on the left edge.
- **Sidebar** — cream `#FDFCF8`, 220px wide, 1px right border `#E8E2D2`. Header block (32 top / 28 side / 24 bottom) has mono eyebrow "WORKSPACE" + serif "Central" 32px.
- **Main column** — cream `#FDFCF8`. Top header strip is breadcrumbs left, search/header-actions right, then content.

### 2.2 Sidebar variants

Two modes, controlled by a `navMode` prop:

**`navMode="teams"`** (default, for team-scoped surfaces: Plan, Roster, Resources)
- "YOUR TEAMS · n" mono eyebrow with `+` icon button on the right.
- Team rows: icon chip (36×36) + name + role. Active row uses `#F1ECDE` bg + 1px `#E2DDCF` border + plum-filled icon chip.

**`navMode="home"`** (for workspace-scoped surfaces: Home, Announcements, Church Settings)
- "HOME" mono eyebrow.
- Simple text rows. Active row uses `#F1ECDE` bg + 1px `#E2DDCF` border.

Both modes share:
- **Verse callout** at the bottom of the sidebar — `#F6F2E8` bg, 1px `#E8E2D2` border, radius 14, padding 18. Mono eyebrow ("VERSE · PSALM 46:10") + italic serif quote 17px in `#2D0F2E`. Always present on every screen.
- **User badge** at the very bottom — 30×30 ink square with cream initial.

### 2.3 Breadcrumbs
`Central / Student Org Board / Plan / SSO` — last crumb in `#2D0F2E` weight 500; rest in `#8A8497` weight 400. Slash separator in `#8A8497`.

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

For pages without a hero banner:
- Mono eyebrow ("MINISTRY ADMIN", "NEW ANNOUNCEMENT · DRAFT", etc.)
- Serif H1 (44–52px)
- Optional 15px body sentence describing the page

---

## 4. Component library

### 4.1 Plum hero banner
The highest-weight identity statement in the app. Reserved for **at most one** genuine identity moment per page — the surface that needs to own the room. This is not a default treatment for any entity type; it is an earned moment. Team home, profile, giving page, and event detail may each carry one hero; the "Up Next" home card uses a cream card with plum accent rather than the full gradient.

```
border-radius: 18
overflow: hidden
background: radial-gradient(120% 100% at 0% 0%, #4A1B4D 0%, #2D0F2E 55%, #1B0A1E 100%)
color: #FDFCF8
padding: 30px 36px 32px
```
- **Dot texture overlay** (required): absolute inset, opacity 0.18, `radial-gradient(rgba(253,252,248,0.6) 1px, transparent 1.4px) 0 0 / 14px 14px`.
- **Layout:** flex row, gap 24. Square monogram (84–92px, radius 16–18, `rgba(251,248,242,0.08)` bg, `rgba(251,248,242,0.18)` border, serif initial 46px) + identity column (mono eyebrow `rgba(251,248,242,0.65)` + serif title 48–56 + meta 15px `rgba(251,248,242,0.78)`) + actions column right-aligned.
- **Action buttons inside hero:** primary uses cream bg / plum-2 text; secondary uses `rgba(251,248,242,0.08)` bg with cream text and 1px `rgba(251,248,242,0.25)` border. Radius 10.

**Do not:** use the hero as a default card treatment or a repeated pattern within a view. Do not place it on list pages, settings pages, or secondary surfaces. Do not use it more than once in the same view — two full-bleed plum moments cancel each other. Do not change the gradient stops or direction when it appears.

**Status (June 2026):** The plum gradient hero has been retired from all Planning surfaces. Team home headers, event-context sub-headers, and the "Up Next" event card are now cream (`var(--cream)`, `#FDFCF8`). Plum remains a surgical accent (CTA button fills, active tab underlines) but is never a card background, hero fill, or surface gradient on these pages. The §4.1 spec is preserved for other valid hero contexts (profile, give page) but should not be re-introduced to Plan tab surfaces.

### 4.2 Tabs (underline)
- Container: `display: flex; gap: 32; border-bottom: 1px solid #E8E2D2;`
- Tab: `padding: 12px 0 14px; font-size: 15;`
- Inactive: color `#8A8497`, weight 400, `border-bottom: 2px solid transparent`
- Active: color `#2D0F2E`, weight 600, `border-bottom: 2px solid #3E1540`, `margin-bottom: -1px`

**Do not:** use pill tabs, segmented background tabs, or boxed tabs. Always underline.

#### Critical implementation rule
There is exactly **one** tab strip component in this codebase: `PlanSubTabStrip` in `app/home/tabs/plan-tab.tsx`. Every tab strip — team pages, event plan pages, profile pages, anywhere — must use this same component. Never inline tab styles or create a new tab implementation. If you need a tab strip, import and use the existing shared component.

The wrapper `<div>` around `PlanSubTabStrip` must have **zero horizontal padding**. The `border-bottom: 1px solid #E8E2D2` inside the component must run edge-to-edge within its parent container. Horizontal breathing room belongs on the **content div below**, not on the tab strip wrapper. Adding horizontal padding to the tab strip wrapper breaks the border alignment and makes the strip look different from every other tab strip in the app.

This rule exists because tab styling has broken multiple times due to duplicate implementations drifting apart and wrapper padding being applied to the wrong element.

### 4.3 Buttons

| Variant | Padding | BG | Color | Border | Radius |
|---|---|---|---|---|---|
| Primary | 12×22 (or 10×16 compact) | `#2D0F2E` | `#FDFCF8` | none | 10–12 |
| Secondary | 10×16 | transparent | `#5A5466` | 1px `#E2DDCF` | 10 |
| Plum-outline | 8×14 | transparent | `#3E1540` | 1px `#3E1540` | 10 |
| Dashed placeholder | 12×16 | transparent | `#5A5466` | 1px dashed `#C4C0B0` | 10–14 |
| Soft-pill | 7×12 | `#F1ECDE` | `#2D0F2E` | 1px `#E2DDCF` | 999 |
| Mini-pill (in hero) | 4×10 | `rgba(251,248,242,0.12)` | cream | none | 999 |
| Destructive | 10×18 | transparent | `#9F3030` | 1px `#9F3030` | 10 |
| Icon button | 30–34 sq | transparent | `#5A5466` | 1px `#E2DDCF` | 8 |

- Primary buttons inside a hero invert: cream bg / plum text.
- Inside callout cards (cream-3), primary buttons remain plum-2.

### 4.4 Inputs
- **Standard input:** 12×14 padding, 1px `#E2DDCF`, radius 10, `#FDFCF8` bg, 15px sans.
- **Inline serif input** (announcement title, journal entries): 8×0 padding, no border, `border-bottom: 1px solid #E2DDCF`, transparent bg, 40px serif, letter-spacing -0.5.
- **Textarea body** (announcement, transition note): 19px serif, line-height 1.65, no border, transparent bg, vertical resize, min-height 540 for full-page editors.
- **Pill picker row** (audience, options): horizontal flex wrap gap 6–8. Off state: 1px `#E2DDCF`, cream bg, body color. On state: 1px `#3E1540`, `#2D0F2E` bg, cream text.

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

### 4.8 Avatars
- **Square monogram (default):** 32–44px, radius 8–11. `#3E1540` plum bg + cream initial for plum-emphasized; `#F1ECDE` bg + plum text for muted; `#13101A` for user/dark.
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
- **Date divider:** serif italic 14px centered between two flex-1 hairlines.

### 4.16 Composer
- Pill: 1px `#E2DDCF`, radius 16, `#F8F4EA` bg, padding 10/12/10/16.
- `+` attachment button left, formatting micro-toolbar middle, plum-2 send button (38 sq, radius 10).
- Helper line below: 11px `#A09A8C`, left = keyboard hint, right = audience scope.

### 4.17 Modal (for **creation only**, never navigation)
Modals are reserved for *new-X* flows where context needs to be preserved (e.g. quick-add behind a calendar). For opening existing entities, **always navigate to a page**. Use sparingly.

- Backdrop: `rgba(20,16,26,0.32)`.
- Panel: 520–600 wide, cream bg, 1px `#E2DDCF`, radius 18, shadow `0 30px 80px rgba(20,16,26,0.18)`.
- Close button: 28 sq, radius 8, 1px `#E2DDCF`, top-right.

### 4.18 Empty / placeholder state
- Use a dashed-border card (`1px dashed #C4C0B0`, radius 10–14, transparent bg) with body color text and a single `+` icon.
- Voice: **descriptive, not chirpy.** "+ Assign someone", "+ Add image, file, or link". Never "Nothing here yet!" or emoji-led empty copy.
- For full-section empty states, follow with one neutral guiding sentence in 13px `#8A8497`.

### 4.19 Danger zone
Editorial inline rule, **not a red boxed callout**:
```
hr-1px #E8E2D2  ──── DANGER ZONE (mono, color #9F3030) ──── hr-1px #E8E2D2
```
Each destructive option is a row: serif 22 title + 13px body description + outline-destructive button on the right (border `#9F3030`, text `#9F3030`, transparent bg). Spacing 22–24 between rows.

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
4. Either a hero stat row (3 stat cards) OR a clear primary action button right-aligned at the same baseline as the title — never both at full strength.

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

---

## 8. Specific "do not" — fixes that were applied across redesigns

These bullet-pointed pitfalls were the recurring failures in the original screens. Treat each as a hard rule.

1. **No modal-in-the-middle-of-navigation.** Clicking an event must open the plan page directly. Modals are for *creation*, peeks are hover popovers.
2. **No tabbed kitchen-sink under "Plan".** Each event is a destination; the workflow tabs (Overview/Checklist/Roles/Notes) belong to that destination, not to a global Plan tab.
3. **No white cards on white bg.** Always cream surface; differentiate with hairlines and inset shades.
4. **Headlines are Bricolage Grotesque at weight 600, body/UI text at weight 400.** Do not use weight 600 for body copy, labels, or metadata — reserve it for heading hierarchy (H1, H2, display).
5. **No emoji-led status pills, no traffic-light colors.** Use the limited semantic palette (success sage, warm-tan social, sage outreach, plum ministry).
6. **No red filled "Delete" buttons.** Destructive actions are outline-only in `#9F3030`.
7. **No left-border-accent rounded callout cards.** The only left-rule pattern allowed is the editorial quote (§4.13) and the timeline rail (§4.12).
8. **No gradient backgrounds outside the hero banner.** Cream surfaces never have gradients.
9. **No iconography invented for "fun" decoration.** Icons are functional. If a slot would otherwise be empty, prefer a dashed placeholder over decorative icons.
10. **No drop shadows on cards.** The only shadow allowed is on a centered modal panel (§4.17).
11. **No `Inter` for big numbers.** Stat numbers are serif.
12. **No tab-per-event in the sidebar.** Sidebar holds workspace and teams only — never time-bound entities.
13. **No "Plan this event" launchpad modal between calendar and event.** Removed.
14. **No invite-code CTA on the ministry chooser.** Removed.
15. **Sidebar must change with context** — `navMode="home"` for admin surfaces, `navMode="teams"` for team-scoped surfaces. They are NOT the same component invocation.
16. **Long-form creation is full-page, not modal.** Announcements use the full-page editor; modal is forbidden for this flow.
17. **Pages never start without a mono eyebrow.** Every H1 is preceded by mono context.
18. **Verse callout is permanent.** Don't drop it to save space.
19. **Underline tabs only.** Never pill tabs, never boxed tabs.
20. **Cream bg `#FDFCF8`, page bg `#F1ECDE`** — never invert.

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
- [ ] Primary CTA is plum-2 (or cream-on-plum if inside hero)?
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
```jsx
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
    background:  p.on ? "#2D0F2E" : "#FDFCF8",
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

Drop this into a new file and replace the placeholder content. It is already correct.

```jsx
const MyNewPage = () => (
  <Chrome
    activeRail="plan"
    navMode="teams"
    activeTeam="student"
    crumbs={["Central", "Student Org Board", "MyNewPage"]}
  >
    {/* Identity hero — delete this block if the page is NOT identity-anchored */}
    <div style={{
      position: "relative", marginTop: 18,
      borderRadius: 18, overflow: "hidden",
      background: "radial-gradient(120% 100% at 0% 0%, #4A1B4D 0%, #2D0F2E 55%, #1B0A1E 100%)",
      color: "#FDFCF8", padding: "30px 36px 32px",
    }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.18, pointerEvents: "none",
        background: "radial-gradient(rgba(253,252,248,0.6) 1px, transparent 1.4px) 0 0 / 14px 14px" }}/>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 24 }}>
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

---

## 15. Final principle

When a decision isn't covered above, default to **less**. Less color, less weight, less border, less iconography. The Central app earns its character from *restraint* — every time the original screens went wrong, it was by adding (a gradient, a red, a bold sans, a modal, a tab, an icon). The corrections were almost always subtractive. Build that way.
