"use client"

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
