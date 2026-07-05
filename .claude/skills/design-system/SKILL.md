# Design System Skill

Load `skills/design-system/DESIGN_SYSTEM.md` before touching any UI file.

## Hard stops

These are non-negotiable checks before writing or editing any UI code. Stop immediately if any of these conditions are true — do not proceed until resolved.

- A new tab strip implementation created instead of using the shared `PlanSubTabStrip` component → **HARD STOP**, find and use the existing one in `app/home/tabs/plan-tab.tsx`
- Horizontal padding added to the tab strip wrapper `<div>` → **HARD STOP**, remove it; padding belongs on the content div below, not the tab strip wrapper
- A color used that is not in the §1.2 token table → **HARD STOP**, map it to the nearest token
- A bold (`fontWeight > 400`) serif heading → **HARD STOP**, serif is always weight 400
- A pill, segmented, or boxed tab → **HARD STOP**, underline tabs only (§4.2)
- Pure white (`#fff` or `white`) used as a surface → **HARD STOP**, use cream `#FBF8F2`
- A modal used for navigation (opening an existing entity) → **HARD STOP**, navigate to a page instead
- The verse callout removed from the sidebar → **HARD STOP**, it is permanent brand
- `Inter` or any sans font used for a stat number → **HARD STOP**, stat numbers are serif
- A drop shadow anywhere → **HARD STOP** — no-shadow system; modals separate via the §4.17 ink veil, not elevation
