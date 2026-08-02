## A visual rewrite silently drops semantics — only a RUNTIME check catches it (2026-08-02)

`EventSectionHeader` was rebuilt from a serif `<h2>` into a ruled flex row. The rewrite was
token-perfect, spacing-perfect, and passed a full Tier-2 rule sweep on Opus — which read the diff
statically and found five real blocks, none of them this one.

The new component rendered its title as a bare `<span>`. Across all nine call sites the event
workspace's entire section structure vanished from the accessibility tree. It was caught only
because an existing spec asserted `getByRole('heading', { name: 'Roles' })` and started failing
deterministically.

The failure mode is specific: when a rewrite is framed as *visual* ("serif 32px → sans 17px with a
rule"), attention goes to the style object, and the element name is retyped as whatever is
convenient for layout. Nothing in a token/spacing/colour checklist looks at the tag.

**Rules:**
- When rewriting a component's appearance, **diff the ELEMENT names, not just the styles**.
  `git show <commit>^:path/to/component.tsx` and compare the tags directly.
- A visual-only change must be provable as visual-only: restore the semantic element and reset its
  UA margins/size inline, then verify computed styles + bounding rects are byte-identical rather
  than asserting "no visual diff."
- **Static rule sweeps cannot see this class of defect.** Any task that rewrites a shared component
  needs a runtime pass that queries by ROLE (`getByRole('heading'|'button'|'list')`), not just a
  reviewer reading the diff.
- Audit the sibling components created in the same pass — the same task also shipped a `NightDivider`
  whose label should have been an `<h3>`. One instance of this mistake predicts more.
