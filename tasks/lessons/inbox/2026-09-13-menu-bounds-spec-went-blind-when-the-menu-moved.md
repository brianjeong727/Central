## A detector keyed on the OLD placement goes blind, not red, when the component moves (2026-09-13)

`e2e/chat-menu-bounds.mobile.spec.ts` found the open message menu by scanning for
`position: absolute` divs at `z-index 160/161` — the in-row menus of the day. The
immersive long-press overlay shipped ONE DAY later (`message-menu-overlay.tsx`,
`position: fixed`, z 170), and from then on every "context menu" case reported
`0 menus open, expected 1`. That IS a violation string, so the spec did fail — but
the only way to know was to run a 2-minute spec nobody ran again until an
unrelated chat task (smart timestamps) ran the covering suite and hit it.

Two rules:
- **When you change how a surface is PLACED (in-row → portal, absolute → fixed, a
  new z tier), grep `e2e/` for detectors keyed on the old placement** — z-index
  values, `position:` filters, class-name scrims — and teach them the new one in
  the same commit. A marker attribute (`data-msg-menu="actions"`) is what the
  spec should anchor on; a z-index is a coincidence.
- **The covering chat specs are cheap to run per task and should be** —
  `chat-timestamps`, `chat-swipe-reply`, `chat-menu-bounds`, `jumbo-emoji` — any
  change to `message-row.tsx` / `ChatScreen` runs all four, not just the new one.

Fixed in the timestamps commit: `menuVsBox` now measures the overlay's
`[data-msg-menu="reactions"|"actions"]` against the viewport above `--kb-inset`
(the overlay lifts the message OUT of the transcript on purpose, so the
transcript box is the wrong bound for it), and `closeMenus` dismisses the overlay
via its own root.
