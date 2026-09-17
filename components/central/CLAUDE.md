# UI conventions — shared components and every surface built from them

> Loads when working in `components/central/`, and is imported by `app/home/CLAUDE.md`. Numbers match the root CLAUDE.md numbering — never renumber. Full text + reasoning: `REFERENCE.md` Part A. Design contract: the `design-system` skill.

**Desktop**
- **#13 Shell-migrated tabs** put `md:flex md:flex-col md:h-full md:overflow-hidden` on the tab's OWN root div (match `DirectoryTab`).
- **#15 Desktop header-right = object config only** (gear/kebab). Every create is a plum primary in the collection's BODY header (`ContentHeader` + `ContentActionButton`), never the title row. Canonical: `StudentOrgTeamHome`.
- **#16 `PlanSubTabStrip` sits at the component root beside `TabPageHeader`**, never inside a padded wrapper; inside one, pass `flush`.
- **#20 Every dropdown/kebab uses `ActionMenu`.** Sole exception: the chat message menu in `app/home/tabs/message-row.tsx`. *Guarded: `e2e/action-menu.spec.ts`.*

**Mobile (phone width)**
- **#22 Mobile back = `BackChevron` OR left-edge swipe**, the same action. `SubpageShell` gets swipe for free; a standalone overlay wires `useEdgeSwipeBack(onClose)`. Never hand-roll swipe handling.
- **#25 Chrome-row actions render through `<MobileChromeActions>`** — never a rail of your own under the chrome.
- **#26 Subpages own ONE 20px gutter** — never wrap `SubpageShell` in padding or pad inside it. *Guarded: `e2e/mobile-subpage-gutter.mobile.spec.ts`.*
- **#27 One chrome rhythm:** chrome rows use `POCKET_CHROME_PAD_Y`/`PAD_X` and title type `POCKET_CHROME_TITLE` (serif 22/600 ink, back-labels included) from `pocket.tsx` — never hand-typed. The title lands at y ∈ [12, 19]; body content starts at ≤ 92px. If a screen fails, fix the screen or the detector — **never widen the band.** *Enforced: `scripts/check-chrome-title.sh`, `e2e/mobile-chrome-rhythm.mobile.spec.ts`, `e2e/mobile-screen-sweep.mobile.spec.ts`.* Detector rules: Part A #27.
- **Layout:** shell-escaping overlays (`fixed inset-0`) add their own top safe area via `POCKET_OVERLAY_PAD_TOP_CLS` / `POCKET_OVERLAY_INSET_CLS` — never a hardcoded floor. Pages never add bottom padding for the nav (`.shell-scroll` owns `--nav-clearance`). Z-index tiers: `REFERENCE.md` Part B §Z-Index.

**Chat**
- **#7 Bubble gestures:** tap < 400ms = emoji picker, press ≥ 400ms = context menu, rightward drag ≥ 56px = reply. They share one press timer, so the swipe must cancel the press explicitly.

**This folder specifically**
- `components/central` is a LEAF: no imports from `app/`. *Enforced: ESLint.*
