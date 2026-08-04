## A group header must never be quieter than the rows it contains (2026-08-03)

Brian's sign-off feedback on the event workspace: *"i dont like how everything is muted on this page…
it all looks the same in importance."* He asked for bolding, and invited a better proposal.

The actual defect was an **inversion**, not a weight shortfall. The L4 group divider was
`14 / 500 / --muted-text`; the row titles inside each group were `15 / 500 / --ink`. So the header
was *smaller AND lighter AND fainter* than its own contents. It didn't read as a header at all — it
read as a caption trailing the group above it. Every group looked equally important because nothing
in the page announced where one ended and the next began.

Fix: `14 / 600 / --ink`. Size still separates it from L3 (17/600), but bold-on-ink makes it read as
structure. **Bolding alone would not have worked** — the colour step was doing more damage than the
weight, and a bold muted label against ink rows is still an inversion.

**Rules:**
- When designing a sub-header, compare it to the rows **below** it, not just to the header above it.
  Levels are usually specified top-down (L1 → L2 → L3 → L4), which makes it easy to keep stepping
  the type *down* until a header ends up quieter than its own content.
- A header may be **smaller** than its rows and still work; it may not be **fainter**. Size reads as
  level; colour reads as importance. Spend the size budget, protect the colour.
- "Everything looks the same importance" is a symptom of too few distinct levels OR one level
  sitting in the wrong order — diagnose which before reaching for weight.
- Related trap: this shipped *because* an accessibility retune had just made `--muted-text` legible.
  Legible is not the same as correctly ranked. [[token-contrast-neighbour]]
