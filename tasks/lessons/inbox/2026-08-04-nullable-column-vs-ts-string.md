## A nullable DB column typed as `string` in TS makes controlled inputs go UNCONTROLLED (2026-08-04)

`team_members.role_id` is nullable (8 live rows hold null), but
`TeamMemberDisplay.role_id` in `app/home/types.ts` declares `string`. The loader
passed the raw value straight through, so two role `<select>`s in the team
settings view received `value={null}`.

React does not just warn here. `value={null}` makes the select **uncontrolled**,
so it displays the FIRST option — a member with no role rendered as though they
held whatever role happened to be first in the list. The console warning
(``` `value` prop on `select` should not be null ```) was the visible symptom; the
silent misattribution was the actual bug, and it was invisible to `tsc` because
the type claimed the null could not exist.

Found only because an e2e spec asserts a clean console
(`e2e/mobile-plan-workspace.spec.ts` → `assertNoErrors`). It had been failing on
`main` for a while; CI's `e2e (sandbox tenant)` job reports green, so it is not
covering that spec.

**Rules:**
1. When a TS interface mirrors a DB row, verify nullability against
   `information_schema.columns` — do not trust the hand-written type. A lying
   type disables the exact check that would have caught this.
2. Normalize at the LOAD boundary, once, to whatever sentinel the component
   already uses (here `""`, per the existing role-delete handler) — not at each
   render site.
3. A `""` sentinel needs a real `<option value="">` or the select renders blank.
4. Console-assertion specs are load-bearing. A failing one is a real defect, not
   noise to route around.

Related: [[ghost-file-vs-ghost-export]]
