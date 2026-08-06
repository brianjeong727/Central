## In hub-and-spoke, the hub owns navigation — a spoke that re-lists it is a duplicated surface (2026-08-05)

The mobile event Overview scrolled ~2100px at 390px. The single biggest cause was
not density — it was that Overview **re-rendered the hub's own "Jump into planning"
row list**. You tap that list to get to Overview, and Overview's answer is to show
you the same list again.

This happens whenever a desktop pane is ported to mobile by squeezing the desktop
grid into one column (`className="max-md:!block"` on a 2-col grid). On desktop the
launchpad earns its place — Overview is a *tab*, sitting beside the others, so it
has to offer a way across. On mobile the same content is a *spoke* reached
**through** a hub that already is that launchpad. The layout collapsed; the
information architecture didn't.

**Rule: when a desktop tab becomes a mobile spoke, delete whatever the hub already
provides.** `mobile_design_system.md` §3 says desktop tab strips become hub rows —
the corollary is that the hub then OWNS navigation, and every spoke owns only its
own content. Check for the duplicate before tuning spacing.

Two smaller things fell out of the same pass, both worth generalising:

- **Reading copy is never a facts-grid value.** The event description sat in a
  `renderFact(…, keyW: 72)` row inside a flex container that also held an Edit
  pill, leaving ~178px for the value — 40 words wrapped to 15 lines, roughly one
  word per line. Prose gets its own full-width block under a kicker; the facts grid
  is for short values (`PocketFactsGrid`, true `auto 1fr`).
- **A shared tree with `isMobile ?` at every node is a smell.** Once the two
  viewports disagree about *structure* rather than *scale*, give mobile its own
  early-return branch. The desktop tree then sheds its dead arms, and neither
  width's spacing is hostage to the other's.

Related: [[2026-08-05-mobile-chrome-actions-are-a-slot]],
[[2026-08-02-design-against-worst-density]]
</content>
