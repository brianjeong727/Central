# Design System Skill

Load order for any UI work — cheapest sufficient doc first:

1. **Desktop (≥768px) surfaces → load `skills/design-system/contract-card.md`** (~5KB). It carries the north star, the full token table, typography/spacing rules, action placement, and every hard "do not" — sufficient for edits to existing surfaces. Its routing table names which section of the full doc to open for component-specific or net-new work; open ONLY that section of `web_design_system.md` (~99KB), not the whole file.
2. **Phone-width (`md:hidden`, ≤430px) surfaces → load `skills/design-system/mobile_design_system.md`** (~14KB, small enough to load whole). Desktop rules never apply to mobile surfaces and vice versa — the surface determines the doc.
3. **Building a net-new page or component from scratch → read the full `web_design_system.md`** §11 snippets + §13 starter template in addition to the card.

The contract card's "Hard do nots" section is the HARD STOP list — if any item fires, stop and resolve before writing code. The card is a distillation, never an override: where card and full doc conflict, the full doc wins, and the conflict itself should be flagged (the card has drifted).
