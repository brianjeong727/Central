"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Users } from "lucide-react"
import { MonogramChip, PocketKicker, PocketRow, PocketRowCard } from "@/components/central"
import { createClient } from "@/lib/supabase"
import { EmptyState } from "./shared"
import { getInitials } from "../utils"
import type { ChatGroup } from "../types"

// ── ChatSearchView ───────────────────────────────────────────────────────────
// ONE search body, rendered by BOTH the mobile Chats overlay and the desktop
// ChatListPanel, so the two surfaces cannot drift apart.
//
// Scope is chats + PEOPLE, not message bodies: the point is reaching someone you
// have never messaged, which is the thing the old chats-only name filter could
// not do.
//
// Cost: with no query this issues NO network call at all — Recent and Suggested
// are derived from the chat list SWR the caller already holds. Only the People
// half of a typed query hits the DB, debounced.

const DEBOUNCE_MS = 120
const RECENT_LIMIT = 6

export interface ChatSearchPerson {
  id: string
  name: string
  avatar_url: string | null
  graduation_year: number | null
}

export function ChatSearchView({
  query,
  chats,
  userId,
  ministryId,
  onOpenChat,
  onOpenPerson,
}: {
  query: string
  /** The already-cached chat list — Recent/Suggested/chat matches all read this. */
  chats: ChatGroup[]
  userId: string
  ministryId: string
  onOpenChat: (id: string, name: string) => void
  /** A person row — the caller opens the existing DM or a draft (app/home/dm.ts). */
  onOpenPerson: (person: ChatSearchPerson) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [people, setPeople] = useState<ChatSearchPerson[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const q = query.trim().toLowerCase()

  // People lookup — same shape the ⌘K palette uses (ministry-scoped, not
  // soft-deleted, ilike on name). Self is excluded: you cannot DM yourself.
  // Every setState lives INSIDE the timeout — setting state synchronously in an
  // effect body cascades renders (and the lint rule that catches it is right).
  // The no-query case is handled by deriving `shownPeople` below instead.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q) return
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, graduation_year")
        .eq("ministry_id", ministryId)
        .is("deleted_at", null)
        .neq("id", userId)
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(12)
      setPeople((data ?? []) as ChatSearchPerson[])
      setSearching(false)
    }, DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q, ministryId, userId, supabase])

  // Stale results from a previous query must never show under an empty field.
  const shownPeople = q ? people : []

  const live = useMemo(() => chats.filter((c) => !c.archived), [chats])

  // No query: Suggested = anything unread (that is the thing you most likely came
  // here for), Recent = the most recently active chats that aren't already shown
  // as Suggested. `chats` arrives sorted by last_message_time (fetchChatList).
  const suggested = useMemo(
    () => live.filter((c) => c.unread_count > 0 && !c.muted).slice(0, RECENT_LIMIT),
    [live],
  )
  const recent = useMemo(() => {
    const shown = new Set(suggested.map((c) => c.id))
    return live.filter((c) => !shown.has(c.id)).slice(0, RECENT_LIMIT)
  }, [live, suggested])

  const chatMatches = useMemo(
    () => (q ? live.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 12) : []),
    [live, q],
  )

  function chatRow(c: ChatGroup, isLast: boolean) {
    return (
      <PocketRow
        key={c.id}
        leading={<MonogramChip initials={getInitials(c.name)} className="w-9 h-9 font-medium text-[10px]" />}
        title={c.name}
        meta={c.type === "dm" ? undefined : c.type === "church" ? "Church" : "Group"}
        showDot={c.unread_count > 0 && !c.muted}
        isLast={isLast}
        onClick={() => onOpenChat(c.id, c.name)}
      />
    )
  }

  function personRow(p: ChatSearchPerson, isLast: boolean) {
    return (
      <PocketRow
        key={p.id}
        leading={<MonogramChip initials={getInitials(p.name)} avatarUrl={p.avatar_url} className="w-9 h-9 font-medium text-[10px]" />}
        title={p.name}
        meta={p.graduation_year ? `Class of ${p.graduation_year}` : undefined}
        isLast={isLast}
        onClick={() => onOpenPerson(p)}
      />
    )
  }

  // ── Typed query ──
  if (q) {
    const nothing = chatMatches.length === 0 && shownPeople.length === 0 && !searching
    if (nothing) {
      return (
        <EmptyState
          icon={<Search className="w-7 h-7" />}
          title="No matches"
          subtitle="Try a different name."
        />
      )
    }
    return (
      <div className="flex flex-col gap-4 pb-4">
        {chatMatches.length > 0 && (
          <div>
            <PocketKicker label="Chats" style={{ margin: "0 4px 8px" }} />
            <PocketRowCard>
              {chatMatches.map((c, i) => chatRow(c, i === chatMatches.length - 1))}
            </PocketRowCard>
          </div>
        )}
        {shownPeople.length > 0 && (
          <div>
            <PocketKicker label="People" style={{ margin: "0 4px 8px" }} />
            <PocketRowCard>
              {shownPeople.map((p, i) => personRow(p, i === shownPeople.length - 1))}
            </PocketRowCard>
          </div>
        )}
      </div>
    )
  }

  // ── No query: suggestions ──
  if (live.length === 0) {
    return (
      <EmptyState
        icon={<Users className="w-7 h-7" />}
        title="Search your ministry"
        subtitle="Find a chat, or anyone you haven't messaged yet."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {suggested.length > 0 && (
        <div>
          <PocketKicker label="Unread" style={{ margin: "0 4px 8px" }} />
          <PocketRowCard>
            {suggested.map((c, i) => chatRow(c, i === suggested.length - 1))}
          </PocketRowCard>
        </div>
      )}
      {recent.length > 0 && (
        <div>
          <PocketKicker label="Recent" style={{ margin: "0 4px 8px" }} />
          <PocketRowCard>
            {recent.map((c, i) => chatRow(c, i === recent.length - 1))}
          </PocketRowCard>
        </div>
      )}
    </div>
  )
}
