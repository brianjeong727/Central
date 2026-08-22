## A flip is not a fit — anchored overlays need a measured box, not a side (2026-08-22)

The chat message menus (reaction bar, context menu, reaction picker) had
"collision handling": a `useLayoutEffect` measured the message, compared it to the
scroll container's TOP, and flipped the menu below if placing it above would clip.
That reads like the problem is solved. It is one third of it.

Sweeping viewport × keyboard × anchor position × menu turned up four separate
escapes the flip could not see:

- **The other edge.** Nothing asked whether BELOW fit. The 435px picker ran 51px
  off the foot of a 390×844 screen from a mid-transcript message with no keyboard
  involved at all.
- **The box changing under it.** Placement was decided once, at open. Raise the
  keyboard while a menu is up and the transcript halves beneath it; the menu keeps
  the verdict it was born with. The `ResizeObserver` watched only the MENU, so a
  container that shrank was invisible to it.
- **The other axis.** Width was never considered. emoji-mart's picker is a fixed
  352px — 9px wider than the transcript column on a 375 iPhone, 64px on a 320.
- **Neither side fitting.** Once both are too small, "which side" is the wrong
  question entirely; the answer is a clamp.

The shape that actually holds: measure the CONTAINER (not the viewport — the chat
surface is `.kb-lift`, so the container's own bottom already tracks the keyboard,
and one measurement covers both states), compute the room on each side, choose the
side that fits, and clamp `maxHeight` to what is really there so the menu scrolls
instead of escaping. Then observe the container as well as the menu.

Two traps inside that shape, both hit on the way:

1. **Never feed the clamp back into its own input.** Measuring the menu's rendered
   height after applying `maxHeight` makes the two oscillate. Read the CONTENT's
   `scrollHeight`, which the clamp does not change.
2. **A minimum defeats the purpose.** A `Math.max(120, room)` floor was added so a
   cramped menu would not be useless — and on a 375×667 with the keyboard up, where
   the room above a mid-message is ~88px, the floor pushed the menu 32px off the
   top. A cramped menu that scrolls beats a roomy one you cannot see.

And one library note: `dynamicWidth` looked like the answer to the width problem
and was not. It makes emoji-mart MEASURE its container, and the container is an
absolutely-positioned div whose width arrives a commit later — it latched onto the
empty box and rendered a 190px picker inside a 352px wrapper. Deriving the column
count ourselves (`perLine` from the available width) has no measurement race in it.

Convention #20 already says every dropdown must use `ActionMenu` "because it
portals, flips, and clamps"; the chat message menu is its one sanctioned exception,
and this is the bill for that exception coming due.
