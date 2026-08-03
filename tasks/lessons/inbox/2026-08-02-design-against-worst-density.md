## A mockup shows ONE of a thing; production shows five. Design the pattern against real density (2026-08-02)

The Welcome Week handoff established a rule: an empty group gets a compact empty line plus a
full-width dashed "add the first block for X" card. In the design source that read beautifully —
there was exactly **one** empty night among populated ones, and the dashed card was a warm invitation
to start it.

Seeded with realistic data (5 of 7 nights empty, which is normal early in planning) the same rule
produced five stacked dashed boxes down a mostly-empty page. The rule wasn't wrong; it had only ever
been evaluated at n=1.

The revised rule is better *because* of the density pressure: inside a grouped list every group gets
the same bare add row, and the dashed card is reserved for a wholly empty **collection**. The
distinction is now principled rather than incidental — the dashed control invites you to start a
collection; a group with nothing in it, inside a collection that already exists, is just an empty
group.

**Rules:**
- Before ratifying any pattern that **repeats**, ask: how many of these appear at once in the worst
  realistic case? Seed that case and look at it. A mockup almost always shows the flattering count.
- Empty states are the highest-risk repeating pattern, because a mockup is usually drawn with data.
  The empty case is the one nobody screenshots — and early in a workflow it is the *common* case.
- This is not catchable by build, lint, e2e, a rule sweep, or a static diff review. **Every one of
  those passed.** It required seeding real-shaped data and putting eyes on the rendered page — which
  is why the "capture a screenshot, look at it, iterate" step is non-negotiable and must happen
  before Brian sees it, not after.
- When density forces a rule change, prefer sharpening the rule's *principle* over adding a count
  threshold. "Dashed = the whole collection is empty" is derivable; "dashed on the first empty group
  only" is a special case someone will get wrong later.

Related: [[cdesign-source-is-live]]
