"use client"

import type { ReactNode } from "react"
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
// screens (mockup `.chrome`): page title (serif 22/600) on the LEFT, an optional
// action button, then the user's MonogramChip avatar (taps to the profile tab)
// far RIGHT. Owns its own md:hidden + 12/20/10 padding so it drops in at the tab
// root, outside any px-5 content wrapper.
export function PocketChrome({
  title, action, userName, avatarUrl, onAvatarClick,
}: {
  title: string
  action?: ReactNode
  userName: string
  avatarUrl?: string | null
  onAvatarClick: () => void
}) {
  return (
    <div className="flex items-center md:hidden" style={{ gap: 10, padding: "12px 20px 10px" }}>
      <span
        style={{
          flex: 1, minWidth: 0,
          fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600,
          letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>
      {action}
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
    </div>
  )
}

// 34px round chrome action button. `plum` = filled plum primary (create); `ghost`
// = tonal --ivory pill (mockup `.ghost` colorway). Icon supplied as children.
export function PocketRoundButton({
  variant = "ghost", onClick, ariaLabel, children,
}: {
  variant?: "plum" | "ghost"
  onClick: () => void
  ariaLabel: string
  children: ReactNode
}) {
  const plum = variant === "plum"
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 34, height: 34, borderRadius: 999, flexShrink: 0,
        display: "grid", placeItems: "center", border: "none", cursor: "pointer",
        background: plum ? "var(--plum)" : "var(--ivory)",
        color: plum ? "var(--cream-on-dark)" : "var(--body)",
        transition: "background var(--dur-fast)",
      }}
    >
      {children}
    </button>
  )
}

// 40px squircle monogram chip (mockup `.chip`): --line-2 tonal with a plum
// letter; `solid` inverts to a plum fill with a cream letter (ministry-wide chat).
export function PocketChip({ letter, solid = false, size = 40 }: { letter: string; solid?: boolean; size?: number }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 14, flexShrink: 0,
        display: "grid", placeItems: "center",
        fontFamily: "var(--serif)", fontSize: 13, fontWeight: 600,
        background: solid ? "var(--plum)" : "var(--line-2)",
        color: solid ? "var(--cream-on-dark)" : "var(--plum)",
      }}
    >
      {letter}
    </span>
  )
}
