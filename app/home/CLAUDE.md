# App shell — `app/home/`

@../../components/central/CLAUDE.md

> The UI conventions above are imported, because almost every surface here is built from `components/central`. If they aren't visible in your context, open `components/central/CLAUDE.md` before building UI. Full text + reasoning: `REFERENCE.md` Part A.

- **#6 Shell:** `home-app.tsx` orchestrates tabs and global state; each tab is its own file in `tabs/`; extract shared UI into `components/central/`. Don't add tab logic back into `home-app.tsx`.
- **#12 Tabbed views sync to URL params** — lazy-init from `window.location.search`, write with ONE atomic `router.replace` (sequential replaces race). Param map: `tasks/lessons.md` §URL State Persistence.
- **#18 Read receipts:** chats < 30 members get live receipts; ≥ 30 get on-demand "Seen by N" and no receipts subscription. Threshold constant: `SMART_ROOM_THRESHOLD` (`lib/chat-notification.ts`).
- **#19 Nav sections derive from `components/central/nav-sections.ts`** — never hand-code tab→section couplings.
- **#21 Settings surfaces stage changes behind Save** (pending local state; Cancel reverts). Optimistic updates are for conversational writes only.
- **Worship-team code is frozen** (`PraiseTeamTab`, `DgPraiseTeamTab`, `OneTimeTeamTab`, `TechTeamTab`) — backlogged indefinitely; don't refactor or invest there.
