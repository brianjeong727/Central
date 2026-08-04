## A "ghost file" is often a ghost EXPORT — check every export before deleting (2026-08-04)

The full-codebase audit flagged `components/ui/chats-section.tsx` and
`components/central/up-next-card.tsx` as dead. Both were half right and fully
dangerous: each held a dead COMPONENT plus a live TYPE.

- `ChatsSection` had no render sites — but `ChatPreview` was imported by
  `app/home/types.ts`, `home-app.tsx`, `page.tsx`, and `chat-strip.tsx`.
- `UpNextCard` (529 lines) had no render sites — but `UpNextEventDetail` fed
  `home-hero-carousel.tsx`.

Deleting either file wholesale breaks the build. Grepping the COMPONENT name
returns nothing and reads as proof of death; the file is still load-bearing.

**Rule:** before deleting a file, grep every symbol it exports, not just the one
the finding names — `grep -n '^export' <file>` first, then one grep per symbol.
A file is dead only when ALL of its exports are dead.

**Corollary — where the rescued type goes is a real decision, not a formality.**
`ChatPreview` could not move to `app/home/types.ts`: `components/central` is a
LEAF that must not import from `app/`, and `chat-strip.tsx` is one of its
consumers. It moved to `chat-strip.tsx` (the live successor to the deleted
component) instead. The obvious destination for a shared type can be the one
destination the layering forbids.

Related: [[audit-findings-are-surface-reads]]
