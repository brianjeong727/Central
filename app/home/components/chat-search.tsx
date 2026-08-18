"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Users } from "lucide-react"
import { ChatAvatar, MonogramChip, PocketKicker, PocketRow, PocketRowCard } from "@/components/central"
import { createClient } from "@/lib/supabase"
import { EmptyState } from "./shared"
import { getInitials } from "../utils"
import { chatChipAvatar } from "../chat-avatar"
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
  variant = "pocket",
}: {
  query: string
  /** The already-cached chat list — Recent/Suggested/chat matches all read this. */
  chats: ChatGroup[]
  userId: string
  ministryId: string
  onOpenChat: (id: string, name: string) => void
  /** A person row — the caller opens the existing DM or a draft (app/home/dm.ts). */
  onOpenPerson: (person: ChatSearchPerson) => void
  /**
   * Which list grammar to render in.
   *
   * `pocket` (default) is the phone-width Pocket family — an ivory `PocketRowCard`
   * holding 40px-chip rows. `desktop` is the CHAT SIDEBAR's own grammar: flat rows
   * on the panel fill, 38px avatar, 13px name, 11.5px sub, no card.
   *
   * This exists because one shared body rendered in Pocket primitives put a big
   * tonal mobile card inside the desktop sidebar the moment you typed — the panel
   * changed design languages mid-interaction. Sharing the LOGIC is right; sharing
   * the CHROME across two design systems is not.
   */
  variant?: "pocket" | "desktop"
}) {
  const isDesktop = variant === "desktop"
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

  // Mirrors ChatGroupCard's desktop row (chat-list-view.tsx) so a search result and
  // the row it becomes are visibly the same object.
  function deskRow(key: string, avatar: React.ReactNode, title: string, sub: string | null, onClick: () => void, dot = false) {
    return (
      <button
        key={key}
        onClick={onClick}
        className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 transition-colors duration-100"
        style={{ borderLeft: "3px solid transparent", margin: "0 4px" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--cream-3)" }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "" }}
      >
        {avatar}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="text-[13px] truncate leading-tight" style={{ color: "var(--ink)", fontWeight: 500 }}>{title}</p>
          {sub && <p className="text-[11.5px] truncate leading-tight" style={{ color: "var(--muted-text)", marginTop: 2 }}>{sub}</p>}
        </div>
        {dot && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--plum)", flexShrink: 0 }} />}
      </button>
    )
  }

  function chatRow(c: ChatGroup, isLast: boolean) {
    if (isDesktop) {
      return deskRow(
        c.id,
        <ChatAvatar size={38} title={c.name} avatarUrl={chatChipAvatar(c)} members={c.cluster_members}
          otherCount={c.other_member_count} nameIsGenerated={c.name_is_generated} isCentral={c.is_central_chat}
          surface="var(--cream)" className="flex-shrink-0" />,
        c.name,
        c.type === "dm" ? null : c.type === "church" ? "Church" : "Group",
        () => onOpenChat(c.id, c.name),
        c.unread_count > 0 && !c.muted,
      )
    }
    return (
      <PocketRow
        key={c.id}
        leading={<MonogramChip initials={getInitials(c.name)} avatarUrl={chatChipAvatar(c)} className="w-9 h-9 font-medium text-[10px]" />}
        title={c.name}
        meta={c.type === "dm" ? undefined : c.type === "church" ? "Church" : "Group"}
        showDot={c.unread_count > 0 && !c.muted}
        isLast={isLast}
        onClick={() => onOpenChat(c.id, c.name)}
      />
    )
  }

  function personRow(p: ChatSearchPerson, isLast: boolean) {
    if (isDesktop) {
      return deskRow(
        p.id,
        <MonogramChip initials={getInitials(p.name)} avatarUrl={p.avatar_url} className="font-medium text-[11px]" style={{ width: 38, height: 38 }} />,
        p.name,
        p.graduation_year ? `Class of ${p.graduation_year}` : null,
        () => onOpenPerson(p),
      )
    }
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

  // The card is a PHONE affordance. On desktop the rows sit directly on the panel
  // fill, exactly like the chat list they are replacing.
  function section(label: string, rows: React.ReactNode) {
    return (
      <div>
        <PocketKicker label={label} style={{ margin: isDesktop ? "0 0 4px 10px" : "0 4px 8px" }} />
        {isDesktop ? rows : <PocketRowCard>{rows}</PocketRowCard>}
      </div>
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
          section("Chats", chatMatches.map((c, i) => chatRow(c, i === chatMatches.length - 1)))
        )}
        {shownPeople.length > 0 && (
          section("People", shownPeople.map((p, i) => personRow(p, i === shownPeople.length - 1)))
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
        section("Unread", suggested.map((c, i) => chatRow(c, i === suggested.length - 1)))
      )}
      {recent.length > 0 && (
        section("Recent", recent.map((c, i) => chatRow(c, i === recent.length - 1)))
      )}
    </div>
  )
}
