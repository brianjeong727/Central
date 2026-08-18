"use client"

// ─── Browse open groups ──────────────────────────────────────────────────────
//
// The ONE discovery surface for chats anyone in the ministry may join.
//
// WHY THIS IS A DRILL-IN AND NOT A NAV SECTION. Slack and Discord put every room
// permanently in the sidebar, badged, so the list itself becomes an obligation —
// that clutter is exactly what Central is refusing. A list you open ON PURPOSE,
// from one row at the top of your chat list, costs nothing when you are not
// looking for it. Do not promote this to a tab, a nav item, or a persistent
// section of the chat list.
//
// TAP IS JOIN. A row you are not in joins on tap (optimistic, with an Undo toast);
// a row you are already in opens the chat. There is no separate Join button
// because `PocketRow` has no action slot by design — the row IS the affordance —
// and a bespoke row here would be the first crack in the list grammar. Joining is
// cheap and reversible, which is what makes tap-to-join proportionate.
//
// Every read goes through app/home/open-groups.ts (definer RPCs), never a `groups`
// table query — see that file for why widening SELECT is not an option.

import { useState } from "react"
import useSWR from "swr"
import { Users } from "lucide-react"
import { SubpageShell, PocketRow, PocketKicker, MonogramChip, Toast } from "@/components/central"
import { EmptyState } from "@/app/home/components/shared"
import { getInitials } from "@/app/home/utils"
import {
  fetchOpenGroups,
  joinOpenGroup,
  leaveOpenGroup,
  openGroupsKey,
  type OpenGroup,
} from "@/app/home/open-groups"

export function OpenGroupsBrowse({
  userId,
  ministryId,
  onBack,
  onOpenChat,
}: {
  userId: string
  ministryId: string
  onBack: () => void
  onOpenChat: (groupId: string, groupName: string) => void
}) {
  const { data, mutate, isLoading } = useSWR(openGroupsKey(ministryId), fetchOpenGroups)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState<OpenGroup | null>(null)

  const groups = data ?? []

  async function join(g: OpenGroup) {
    setBusyId(g.id)
    setError(null)
    const before = groups
    // Optimistic (Convention #4) — joining is a conversational write, not a
    // staged setting.
    void mutate(
      before.map((x) => (x.id === g.id ? { ...x, isMember: true, memberCount: x.memberCount + 1 } : x)),
      { revalidate: false },
    )
    const err = await joinOpenGroup(g.id, userId)
    setBusyId(null)
    if (err) {
      void mutate(before, { revalidate: false })
      setError(err)
      return
    }
    setJoined(g)
    void mutate()
  }

  async function undoJoin(g: OpenGroup) {
    setJoined(null)
    void mutate(
      groups.map((x) => (x.id === g.id ? { ...x, isMember: false, memberCount: Math.max(0, x.memberCount - 1) } : x)),
      { revalidate: false },
    )
    await leaveOpenGroup(g.id, userId)
    void mutate()
  }

  return (
    <SubpageShell
      crumbs={[{ label: "Chats", onClick: onBack }, { label: "Open groups" }]}
      title="Open groups"
      mobileTitle="Open groups"
      width="full"
    >
      <p
        className="px-5 md:px-14 text-[14.5px]"
        style={{ color: "var(--body)", lineHeight: 1.6, margin: "0 0 18px" }}
      >
        Chats anyone in the ministry can join. Tap one to join — it then shows up with your other
        chats.
      </p>

      {error && (
        <p className="px-5 md:px-14 text-[13px]" style={{ color: "var(--danger)", margin: "0 0 14px" }} role="alert">
          {error}
        </p>
      )}

      {isLoading ? null : groups.length === 0 ? (
        <div className="px-5 md:px-14">
          <EmptyState
            icon={<Users style={{ width: 21, height: 21 }} strokeWidth={1.7} />}
            title="No open groups yet"
            subtitle="When someone opens a group chat to the ministry, it shows up here."
          />
        </div>
      ) : (
        <>
          <PocketKicker
            label={`${groups.length} group${groups.length === 1 ? "" : "s"}`}
            style={{ margin: "0 20px 8px" }}
          />
          {groups.map((g, i) => (
            <PocketRow
              key={g.id}
              immersive
              isFirst={i === 0}
              leading={<MonogramChip initials={getInitials(g.name)} avatarUrl={g.avatarUrl ?? undefined} />}
              title={g.name}
              sub={`${g.memberCount} member${g.memberCount === 1 ? "" : "s"}`}
              meta={g.isMember ? "Joined" : busyId === g.id ? "Joining…" : undefined}
              chevron={g.isMember}
              ariaLabel={g.isMember ? `Open ${g.name}` : `Join ${g.name}`}
              onClick={() => {
                if (busyId === g.id) return
                if (g.isMember) onOpenChat(g.id, g.name)
                else void join(g)
              }}
            />
          ))}
        </>
      )}

      {joined && (
        <Toast
          message={`Joined ${joined.name}`}
          actionLabel="Undo"
          onAction={() => undoJoin(joined)}
          onDismiss={() => setJoined(null)}
        />
      )}
    </SubpageShell>
  )
}
