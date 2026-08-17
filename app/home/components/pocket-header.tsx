"use client"

import type { ReactNode } from "react"
import { RingCrossLogo } from "./shared"
import { BackChevron, POCKET_CHROME_PAD_Y, POCKET_CHROME_PAD_X, POCKET_CHROME_TITLE } from "@/components/central"

interface PocketHeaderProps {
  ministryName: string
  // Optional trailing chrome action (Home's admin-tier Settings gear). A single
  // object-level action only — creates never live here (mobile carve-out from
  // Convention #15 is the plum "+" per screen).
  action?: ReactNode
}

// Shared mobile chrome row for the "Pocket" screens: brand mark + ministry name
// (serif) on the LEFT, an optional action (gear) on the RIGHT.
//
// The user's MonogramChip avatar used to sit at the far right and tap through to
// Profile. It was removed when Profile became a pill destination (2026-08-16) —
// it was a second door to a place the nav now reaches from every screen. See
// mobile_design_system.md §3.
export function PocketHeader({ ministryName, action }: PocketHeaderProps) {
  return (
    <div
      className="flex items-center"
      // Chrome rhythm is the shared constant (Convention #27). Home used to sit at
      // --space-6 (14px), one step deeper than every other tab root.
      // No PAD_X: Home mounts this inside its own px-5 wrapper.
      style={{ gap: 10, ...POCKET_CHROME_PAD_Y }}
    >
      <RingCrossLogo size={26} color="var(--plum)" />
      <span
        style={{ flex: 1, minWidth: 0, ...POCKET_CHROME_TITLE }}
      >
        {ministryName}
      </span>
      {action}
    </div>
  )
}

// ── B3 Pocket Daybreak chrome ────────────────────────────────────────────────
// The single top row shared by the Announcements / Chats / Workspace mobile
// screens (mockup `.chrome`): an optional back chevron, the page title and 0–2
// action slots. Owns its own md:hidden + 12/20/10 padding so it drops in at the
// tab root, outside any px-5 content wrapper.
//
// The title is ALWAYS `POCKET_CHROME_TITLE` (serif 22/600 `--ink`). It used to
// drop to 20 whenever two actions shared the row — the same drift Convention #27
// named and abolished for `PocketHubChrome`, left live here because the type-scale
// line in mobile_design_system.md still documented the drop. Removed 2026-08-17;
// only one caller passed two actions (Profile while editing), so it now reads 22
// like every other chrome row.
//
// Daybreak-v2 extensions (all optional, existing callers untouched): `action2`
// for a second action and `back` for the one-level-up chevron on drilled-in
// subpages.
//
// The trailing MonogramChip avatar (and its `hideAvatar` opt-out, which by the
// end every caller but three was passing) was removed when Profile became a pill
// destination (2026-08-16). See mobile_design_system.md §3.
// 16px, wider than the row's own 10px gap: at 22/600 with -0.02em tracking a 12px
// gap let the two options read as one phrase ("Church My chats") instead of two
// controls — the active/muted contrast alone was not enough separation.
const SCOPE_GAP = 16

// `scope` turns the title slot INTO an exclusive switch: each option carries the
// one chrome title type, the active one in `--ink` and the rest muted. A screen
// whose header only repeated its own tab name AND carried a full-width scope-chip
// band below it collapses to a single row this way — the chips were the second of
// two stacked chrome bands, and the tab name was already on the bottom nav. The
// Convention #27 rhythm is untouched: a serif-22 leaf still opens the row at the
// same height as every other tab root, which is what the cross-tab contract
// actually pins (Chats, 2026-08-17). `title` stays required — it labels the
// switch for assistive tech, and it is the fallback for callers with no scope.
export function PocketChrome({ title, scope, action, action2, back }: {
  title: string
  scope?: {
    options: readonly { id: string; label: string }[]
    value: string
    onChange: (id: string) => void
  }
  action?: ReactNode
  action2?: ReactNode
  back?: () => void
}) {
  return (
    <div className="flex items-center md:hidden" style={{ gap: 10, ...POCKET_CHROME_PAD_Y, paddingLeft: POCKET_CHROME_PAD_X, paddingRight: POCKET_CHROME_PAD_X }}>
      {back && <BackChevron onClick={back} />}
      {scope ? (
        <div className="flex items-center" style={{ flex: 1, minWidth: 0, gap: SCOPE_GAP }} role="tablist" aria-label={title}>
          {scope.options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={o.id === scope.value}
              onClick={() => scope.onChange(o.id)}
              style={{
                ...POCKET_CHROME_TITLE,
                color: o.id === scope.value ? "var(--ink)" : "var(--muted-text)",
                background: "none", border: 0, padding: 0, minHeight: 34,
                cursor: "pointer", flexShrink: 0,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <span style={{ ...POCKET_CHROME_TITLE, flex: 1, minWidth: 0 }}>{title}</span>
      )}
      {action}
      {action2}
    </div>
  )
}

// PocketRoundButton and PocketChip moved to the design-system leaf
// (components/central/pocket.tsx); re-exported here so existing imports keep
// working. New code should import from "@/components/central".
export { PocketRoundButton, PocketChip } from "@/components/central/pocket"
