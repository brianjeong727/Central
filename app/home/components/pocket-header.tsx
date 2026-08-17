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
// screens (mockup `.chrome`): an optional back chevron, the page title (serif
// 22/600, dropping to 20 when TWO actions share the row per v2 §2) and 0–2
// action slots. Owns its own md:hidden + 12/20/10 padding so it drops in at the
// tab root, outside any px-5 content wrapper.
//
// Daybreak-v2 extensions (all optional, existing callers untouched): `action2`
// for a second action and `back` for the one-level-up chevron on drilled-in
// subpages.
//
// The trailing MonogramChip avatar (and its `hideAvatar` opt-out, which by the
// end every caller but three was passing) was removed when Profile became a pill
// destination (2026-08-16). See mobile_design_system.md §3.
export function PocketChrome({ title, action, action2, back }: {
  title: string
  action?: ReactNode
  action2?: ReactNode
  back?: () => void
}) {
  const twoActions = Boolean(action && action2)
  return (
    <div className="flex items-center md:hidden" style={{ gap: 10, ...POCKET_CHROME_PAD_Y, paddingLeft: POCKET_CHROME_PAD_X, paddingRight: POCKET_CHROME_PAD_X }}>
      {back && <BackChevron onClick={back} />}
      <span
        style={{
          flex: 1, minWidth: 0,
          fontFamily: "var(--serif)", fontSize: twoActions ? 20 : 22, fontWeight: 600,
          letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>
      {action}
      {action2}
    </div>
  )
}

// PocketRoundButton and PocketChip moved to the design-system leaf
// (components/central/pocket.tsx); re-exported here so existing imports keep
// working. New code should import from "@/components/central".
export { PocketRoundButton, PocketChip } from "@/components/central/pocket"
