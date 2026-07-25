"use client"

import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { RingCrossLogo } from "./shared"
import { MonogramChip } from "@/components/central"
import { getInitials } from "../utils"

interface PocketHeaderProps {
  ministryName: string
  userName: string
  avatarUrl?: string | null
  onAvatarClick: () => void
}

// Shared mobile chrome row for the "Pocket" screens: brand mark + ministry name
// (serif) on the LEFT, the user's MonogramChip avatar on the RIGHT (taps through to
// the profile tab). Home wires it in this pass; news/chats/workspace adopt it later.
export function PocketHeader({ ministryName, userName, avatarUrl, onAvatarClick }: PocketHeaderProps) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ paddingTop: "var(--space-6)", paddingBottom: "var(--space-5)" }}
    >
      <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
        <RingCrossLogo size={26} color="var(--plum)" />
        <span
          style={{
            fontFamily: "var(--serif)",
            fontSize: 22,
            fontWeight: 600,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            lineHeight: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {ministryName}
        </span>
      </div>
      <button
        onClick={onAvatarClick}
        aria-label="Your profile"
        style={{ flexShrink: 0, border: "none", background: "none", padding: 0, cursor: "pointer" }}
      >
        <MonogramChip
          initials={getInitials(userName)}
          avatarUrl={avatarUrl}
          className="w-9 h-9"
          style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: 12 }}
        />
      </button>
    </div>
  )
}

// ── B3 Pocket Daybreak chrome ────────────────────────────────────────────────
// The single top row shared by the Announcements / Chats / Workspace mobile
// screens (mockup `.chrome`): an optional back chevron, the page title (serif
// 22/600, dropping to 20 when TWO actions share the row per v2 §2), 0–2 action
// slots, then the user's MonogramChip avatar (taps to the profile tab) far
// RIGHT. Owns its own md:hidden + 12/20/10 padding so it drops in at the tab
// root, outside any px-5 content wrapper.
//
// Daybreak-v2 extensions (all optional, existing callers untouched): `action2`
// for a second action, `back` for the one-level-up chevron on drilled-in
// subpages, and `hideAvatar` since subpages drop the avatar (v2 §3).
export function PocketChrome({
  title, action, action2, back, hideAvatar = false, userName, avatarUrl, onAvatarClick,
}: {
  title: string
  action?: ReactNode
  action2?: ReactNode
  back?: () => void
  hideAvatar?: boolean
  userName: string
  avatarUrl?: string | null
  onAvatarClick: () => void
}) {
  const twoActions = Boolean(action && action2)
  return (
    <div className="flex items-center md:hidden" style={{ gap: 10, padding: "12px 20px 10px" }}>
      {back && (
        <button
          onClick={back}
          aria-label="Back"
          style={{ flexShrink: 0, width: 34, height: 34, marginLeft: -6, borderRadius: 999, display: "grid", placeItems: "center", border: "none", background: "none", color: "var(--ink)", cursor: "pointer" }}
        >
          <ArrowLeft style={{ width: 20, height: 20 }} />
        </button>
      )}
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
      {!hideAvatar && (
        <button
          onClick={onAvatarClick}
          aria-label="Your profile"
          style={{ flexShrink: 0, border: "none", background: "none", padding: 0, cursor: "pointer" }}
        >
          <MonogramChip
            initials={getInitials(userName)}
            avatarUrl={avatarUrl}
            style={{ width: 34, height: 34, fontFamily: "var(--sans)", fontWeight: 600, fontSize: 11 }}
          />
        </button>
      )}
    </div>
  )
}

// PocketRoundButton and PocketChip moved to the design-system leaf
// (components/central/pocket.tsx); re-exported here so existing imports keep
// working. New code should import from "@/components/central".
export { PocketRoundButton, PocketChip } from "@/components/central/pocket"
