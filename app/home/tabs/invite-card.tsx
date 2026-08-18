"use client"

// ─── Invite card — an invitation to an open group, posted into a chat ─────────
//
// The message you drop into the general chat that IS the invite: name, headcount,
// and joining on tap. It replaces the ritual it was designed from — "like this
// message if you want in the running gc", then someone hand-adds every liker.
//
// THE CARD RESOLVES ITS TARGET THROUGH `open_group_card`, NEVER A TABLE READ, and
// that is a security property, not a convenience. `messages.invite_group_id` is
// attacker-supplied: the messages INSERT policy checks only that you may post to
// the DESTINATION chat, and says nothing about the group the card points AT. So a
// member can post a card into a chat they belong to naming ANY group id they have
// ever seen. `open_group_card` returns zero rows for anything that is not open, so
// such a card renders as a dead tombstone. Resolving a non-open group here — even
// only to put its name on that tombstone — would turn this component into a
// name-and-headcount oracle for every private chat in the ministry. The tombstone
// stays deliberately anonymous.

import { useState } from "react"
import useSWR from "swr"
import { Users } from "lucide-react"
import { ChatAvatar, PocketButton } from "@/components/central"
import { fetchOpenGroupCard, joinOpenGroup, openGroupCardKey, openGroupsKey } from "@/app/home/open-groups"
import { mutate as globalMutate } from "swr"

export function InviteCard({
  inviteGroupId,
  userId,
  ministryId,
  onOpenChat,
}: {
  inviteGroupId: string
  userId: string
  ministryId: string
  onOpenChat: (groupId: string, groupName: string) => void
}) {
  const { data, mutate, isLoading } = useSWR(openGroupCardKey(inviteGroupId), () =>
    fetchOpenGroupCard(inviteGroupId),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shell: React.CSSProperties = {
    maxWidth: 320,
    borderRadius: 14,
    border: "1px solid var(--line-2)",
    background: "var(--cream-panel)",
    padding: 14,
  }

  if (isLoading) {
    return <div style={{ ...shell, height: 74 }} aria-hidden />
  }

  // Not open, deleted, or another ministry's — all identical, on purpose.
  if (!data) {
    return (
      <div style={{ ...shell, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13.5, color: "var(--muted-text)", fontStyle: "italic" }}>
          This invitation is no longer available.
        </span>
      </div>
    )
  }

  async function join() {
    if (!data) return
    setBusy(true)
    setError(null)
    void mutate({ ...data, isMember: true, memberCount: data.memberCount + 1 }, { revalidate: false })
    const err = await joinOpenGroup(data.id, userId)
    setBusy(false)
    if (err) {
      void mutate(data, { revalidate: false })
      setError(err)
      return
    }
    // The browse list and the chat list both change when you join from here.
    void globalMutate(openGroupsKey(ministryId))
    void mutate()
  }

  return (
    <div style={shell}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <ChatAvatar size={40} title={data.name} avatarUrl={data.avatarUrl} surface="var(--cream-panel)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 14.5,
              fontWeight: 500,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {data.name}
          </p>
          <p style={{ fontSize: 12.5, color: "var(--muted-text)", margin: "2px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
            <Users style={{ width: 12, height: 12 }} strokeWidth={1.8} />
            {data.memberCount} member{data.memberCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: "var(--danger)", margin: "10px 0 0" }} role="alert">
          {error}
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        {data.isMember ? (
          <PocketButton variant="quiet" surface="card" compact onClick={() => onOpenChat(data.id, data.name)}>
            Open chat
          </PocketButton>
        ) : (
          <PocketButton variant="primary" compact disabled={busy} onClick={join}>
            {busy ? "Joining…" : "Join"}
          </PocketButton>
        )}
      </div>
    </div>
  )
}
