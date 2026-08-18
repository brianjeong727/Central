"use client"

// ─── "Find your people" — the Home card that does the migration ──────────────
//
// A ministry moving off Messenger arrives with a dozen interest chats (a group per
// sport, board games, per apartment building, gaming). Without this card, onboarding
// means every student independently discovering twelve groups. With it, they pick
// theirs in the first thirty seconds — which is roughly how they joined those chats
// on Messenger in the first place.
//
// It is a CARD, not a list: something you read and act on as a unit, which is the
// side of the mobile contract's card rule ("cards for things you read, no cards for
// rows you tap through") this falls on.
//
// It quiets itself two ways, so it never becomes furniture: it disappears once there
// is nothing left to join, and it can be dismissed outright by someone who wants none
// of them. Dismissal is a `profiles` column rather than client storage — Convention
// #1 bans localStorage/sessionStorage, and the Supabase session is the only client
// state Central keeps.
//
// LEAF component: it takes data and handlers, and reaches for nothing in `app/`.

import { useState } from "react"
import { X, Users } from "lucide-react"
import { PocketCard } from "./pocket"
import { PocketButton } from "./pocket"
import { EYEBROW_STYLE } from "./typography"

export interface FindYourPeopleGroup {
  id: string
  name: string
  memberCount: number
}

export function FindYourPeopleCard({
  groups,
  onJoin,
  onDismiss,
  onSeeAll,
}: {
  /** Open groups the viewer is NOT in. The card hides itself when empty. */
  groups: FindYourPeopleGroup[]
  onJoin: (groupId: string) => Promise<void> | void
  onDismiss: () => void
  onSeeAll?: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [joined, setJoined] = useState<Set<string>>(new Set())

  if (groups.length === 0) return null

  // Four is the most that reads as a glance rather than a list; the rest live
  // behind "See all", which is the browse surface.
  const shown = groups.slice(0, 4)

  async function join(id: string) {
    setBusy(id)
    await onJoin(id)
    setJoined((prev) => new Set(prev).add(id))
    setBusy(null)
  }

  return (
    <PocketCard style={{ position: "relative" }}>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute", top: 12, right: 12, width: 28, height: 28,
          display: "grid", placeItems: "center", borderRadius: 999,
          background: "none", border: "none", color: "var(--muted-text)", cursor: "pointer",
        }}
      >
        <X style={{ width: 15, height: 15 }} strokeWidth={1.8} />
      </button>

      <span style={{ ...EYEBROW_STYLE, display: "block", marginBottom: 6 }}>Find your people</span>
      <p style={{ fontSize: 14.5, color: "var(--body)", lineHeight: 1.55, margin: "0 0 14px", paddingRight: 28 }}>
        Groups anyone can join. Pick the ones you&apos;re into.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {shown.map((g) => {
          const isJoined = joined.has(g.id)
          return (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
              <div
                style={{
                  width: 34, height: 34, borderRadius: "var(--r-callout)", flexShrink: 0,
                  background: "var(--pocket-track)", display: "grid", placeItems: "center",
                }}
              >
                <Users style={{ width: 15, height: 15, color: "var(--plum)" }} strokeWidth={1.7} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14.5, fontWeight: 500, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.name}
                </p>
                <p style={{ fontSize: 12.5, color: "var(--muted-text)", margin: "1px 0 0" }}>
                  {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                </p>
              </div>
              {isJoined ? (
                <span style={{ fontSize: 12.5, color: "var(--muted-text)", flexShrink: 0 }}>Joined</span>
              ) : (
                <PocketButton
                  variant="quiet"
                  surface="card"
                  compact
                  disabled={busy === g.id}
                  onClick={() => join(g.id)}
                >
                  {busy === g.id ? "…" : "Join"}
                </PocketButton>
              )}
            </div>
          )
        })}
      </div>

      {groups.length > shown.length && onSeeAll && (
        <button
          onClick={onSeeAll}
          style={{
            marginTop: 12, padding: 0, background: "none", border: "none",
            color: "var(--plum)", fontSize: 13.5, cursor: "pointer",
          }}
        >
          See all {groups.length}
        </button>
      )}
    </PocketCard>
  )
}
