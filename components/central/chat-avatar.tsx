"use client"

import type { CSSProperties } from "react"
import { MonogramChip } from "./MonogramChip"

// ── ChatAvatar — the one avatar a CHAT wears ─────────────────────────────────
// cdesign "Member-derived group avatars", ratified 2026-08-17.
//
// The rule: A TITLE A PERSON TYPED GETS A LETTER. A TITLE THE APP ASSEMBLED GETS
// FACES. "Leaders" or "Worship Team" keeps the single plum circle with the
// title's first letter. A chat the member picker auto-titled — "Sarah, James,
// Grace" — shows its members instead, because that S belongs to nobody.
//
// Which of the two it is CANNOT be read off the string: "Sarah, Grace" is a
// perfectly legal thing to type. It comes from `groups.name_is_generated`,
// recorded at creation.
//
// The viewer is never in their own cluster: counts and members here already
// exclude them (get_chat_list does it in SQL). So a 2-person DM has ONE other
// member and renders as a single circle, and a 5-person group renders faces + a
// count of the rest.
//
// Message bubbles do NOT use this — a bubble avatar is a person, not a chat.

export type ChatAvatarMember = {
  id: string
  name: string
  avatar_url?: string | null
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ""
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

type Piece = {
  key: string
  size: number
  left: number
  top: number
  fontSize: number
  /** true = the "+N" remainder chip: ivory fill, plum text, no photo. */
  count?: string
  member?: ChatAvatarMember
  /** The first piece never rings; each later one rings and paints over the last. */
  ring: boolean
}

// Geometry is the handoff's, verbatim. Diameters and offsets are OUTER values —
// the ring is inset (border-box), so a cluster never exceeds its footprint.
//
// Below 46px the triangle is dropped for a two-circle cap: three sets of initials
// inside 40px stop being legible.
//
// The count never reads "+1". At 46 two faces show so the remainder is n−2, which
// is ≥2 whenever a count renders at all; at 40/34 one face shows so it is n−1,
// and n===2 renders the second FACE instead of a count. Both fall out of the
// formulas — there is no special case to forget.
function pieces(members: ChatAvatarMember[], otherCount: number, box: number): Piece[] {
  const at = (m: ChatAvatarMember | undefined, i: number, size: number, left: number, top: number, fontSize: number, ring: boolean): Piece =>
    ({ key: m?.id ?? `slot-${i}`, member: m, size, left, top, fontSize, ring })

  if (box >= 46) {
    if (otherCount === 2) {
      return [
        at(members[0], 0, 30, 0, 0, 11, false),
        at(members[1], 1, 30, 16, 16, 11, true),
      ]
    }
    // Three or more: triangle, one slightly larger on top so the most recent
    // speaker leads (get_chat_list orders by recency, then join date).
    const third: Piece = otherCount > 3
      ? { key: "count", count: `+${otherCount - 2}`, size: 24, left: 22, top: 22, fontSize: 9, ring: true }
      : at(members[2], 2, 24, 22, 22, 9, true)
    return [
      at(members[0], 0, 26, 10, 0, 9.5, false),
      at(members[1], 1, 24, 0, 22, 9, true),
      third,
    ]
  }

  const d = box === 40 ? 26 : 22
  const off = box - d
  const fs = box === 40 ? 9.5 : 8.5
  const second: Piece = otherCount === 2
    ? at(members[1], 1, d, off, off, fs, true)
    : { key: "count", count: `+${otherCount - 1}`, size: d, left: off, top: off, fontSize: fs, ring: true }
  return [at(members[0], 0, d, 0, 0, fs, false), second]
}

export function ChatAvatar({
  size = 46,
  title,
  avatarUrl,
  members = [],
  otherCount = 0,
  nameIsGenerated = false,
  surface = "var(--cream)",
  className = "",
  style,
}: {
  size?: number
  /** The chat's display title — supplies the letter for a named chat. */
  title: string
  /** The chat's own photo (group photo, or a DM counterpart's), if any. */
  avatarUrl?: string | null
  /** First three members EXCLUDING the viewer, recency-ordered. */
  members?: ChatAvatarMember[]
  /** Total members excluding the viewer — drives the arrangement and the count. */
  otherCount?: number
  nameIsGenerated?: boolean
  /** The ring between overlapping circles is a gap in the ROW's own background,
   *  not a cream stroke — so a pressed or selected row must pass its own fill. */
  surface?: string
  className?: string
  style?: CSSProperties
}) {
  const solo = !nameIsGenerated || otherCount <= 1 || members.length === 0

  if (solo) {
    // A named chat shows its title's letter; an unnamed one that has emptied out
    // to a single other person shows THAT person.
    const one = !nameIsGenerated ? null : members[0]
    return (
      <MonogramChip
        initials={one ? initialsOf(one.name) : title.charAt(0).toUpperCase()}
        avatarUrl={one ? one.avatar_url : avatarUrl}
        className={className}
        style={{ width: size, height: size, flexShrink: 0, fontFamily: "var(--serif)", fontSize: Math.round(size * 0.35), fontWeight: 600, ...style }}
      />
    )
  }

  return (
    // Decorative: the row's own accessible name already lists the people, and
    // 9px initials are not text anyone can have read aloud.
    <span
      aria-hidden
      className={className}
      style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "block", ...style }}
    >
      {pieces(members, otherCount, size).map((p) => (
        <span
          key={p.key}
          style={{
            position: "absolute", left: p.left, top: p.top, width: p.size, height: p.size,
            borderRadius: 999, boxSizing: "border-box",
            // A gap in the surface, not a border: inset so the cluster stays
            // inside its footprint, and inheriting the row's fill so it stays
            // invisible on any background.
            border: p.ring ? `2px solid ${surface}` : "none",
            display: "grid", placeItems: "center", overflow: "hidden",
            background: p.count ? "var(--ivory)" : "var(--plum)",
            color: p.count ? "var(--plum)" : "var(--cream-on-dark)",
            fontFamily: "var(--serif)", fontSize: p.fontSize, fontWeight: 600, letterSpacing: "-0.01em",
          }}
        >
          {p.count ?? (
            <MonogramChip
              initials={p.member ? initialsOf(p.member.name) : ""}
              avatarUrl={p.member?.avatar_url}
              style={{ width: "100%", height: "100%", fontFamily: "var(--serif)", fontSize: p.fontSize, fontWeight: 600 }}
            />
          )}
        </span>
      ))}
    </span>
  )
}

/** The row's accessible name for a clustered chat — the cluster itself is
 *  aria-hidden, so this is what actually carries the members. */
export function chatAvatarLabel(title: string, members: ChatAvatarMember[], otherCount: number, nameIsGenerated: boolean): string {
  if (!nameIsGenerated || members.length === 0) return title
  const shown = members.map((m) => m.name)
  const hidden = otherCount - shown.length
  if (hidden > 0) return `${shown.join(", ")} and ${hidden} ${hidden === 1 ? "other" : "others"}`
  return shown.join(", ")
}
