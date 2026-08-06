## Mobile chrome-row actions are a SLOT, not a hand-rolled rail (2026-08-05)

`mobile_design_system.md` §3 ratifies the chrome-row create as mobile's carve-out
from desktop Convention #15 — but `SubpageShell` shipped with no slot for it, only
`titleAction` (desktop-only). So spokes that needed a phone-width action invented
their own: the event Roles pane rendered `<span flex:1/> + chat icon + plum "+"` as
a right-aligned row directly under the chrome. It read as a stray floating row and
pushed the list down by the button height.

**Rule: never hand-roll an action rail under a `SubpageShell` chrome row.** Render
`<SubpageChromeActions>` (exported from `components/central`) and the buttons land
in the chrome row itself.

**Why a portal and not a prop.** The controls that belong in the chrome row are
usually rendered deep in the subpage body — the Roles pane is ~7 levels below the
`SubpageShell` call site — and they close over live state (`planChatState`,
`showAddRole`, `editingRoleId`, `creatingPlanChat`). Both obvious hoists are bad:

- a prop means threading a `ReactNode` through every intermediate component;
- an effect (`onMobileCrumbChange`-style) means the buttons are captured in a
  closure whose dep array must list every piece of state they read — miss one and
  the header silently shows a stale button.

The slot sidesteps both: `SubpageShell` publishes its chrome-row `<div>` through
context (as `useState`, not a ref — a ref leaves the first portal render null), and
the deep child keeps rendering in its own place in the tree with fresh closures
while the pixels land in the header. Same trick is available for any future
"render this into an ancestor's chrome" need.

Related: [[2026-08-05-hub-owns-navigation-spoke-owns-content]]
</content>
