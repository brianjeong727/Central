"use client"

// ── The chat LIST surfaces (phone `ChatsTab` + desktop `ChatListPanel`) ──────
//
// Split out of chats-tab.tsx so the list can paint from the SERVER.
//
// Both list surfaces used to live in the same 4,841-line module as ChatScreen /
// ChatSettings / CreateChatScreen, and home-app mounted all of them through one
// `dynamic(..., { ssr: false })`. The consequence was that the cheap list could
// not render until the expensive thread (composer, emoji picker, polls,
// attachments, reactions, read receipts) had downloaded, parsed and executed —
// measured at ~2.5s on a throttled mid-range phone, with the data already
// present in the HTML the whole time (app/home/page.tsx SSR-fetches
// get_chat_list and seeds it as fallbackChats).
//
// This module is small and SSR-clean, so home-app mounts it STATICALLY: the
// conversation rows are HTML on first paint. ChatScreen and friends stay lazy
// and ssr:false against chats-tab.tsx — the thread is still the heavy thing, it
// is just no longer on the list's critical path. CreateChatScreen reaches back
// into that module through its own `dynamic`, so tapping + is what pulls it,
// not rendering the list.
//
// Two rules keep the server render honest:
//   1. The `?chats` scope arrives as a PROP (initialSection), resolved on the
//      server — never a `typeof window` peek in a useState initializer.
//   2. Row timestamps are device-local by design (Convention #23), so they are
//      rendered CLIENT-ONLY (see useChatListTime). Everything that identifies a
//      row — name, preview, pin/mute glyphs, unread dot — is server-rendered.

import { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { Search, ChevronDown, X, Plus, Users, Pin, PinOff, Lock, Bell, BellOff, Archive, ArchiveRestore, LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Spinner, EmptyState, MONO_STYLE } from "../components/shared"
import { PocketChrome, PocketRoundButton } from "../components/pocket-header"
import { ChatAvatar, chatAvatarLabel, SegmentedControl, PocketSearchField, PocketRow, PocketKicker, POCKET_KICKER_STYLE, useScrollResetOn, SwipeActionRow, ConfirmDialog, Toast } from "@/components/central"
import { Compass } from "lucide-react"
import { fetchOpenGroups, openGroupsKey } from "@/app/home/open-groups"
import { OpenGroupsBrowse } from "./open-groups-view"
import { ChatSearchView } from "../components/chat-search"
import { findExistingDm } from "../dm"
import { formatChatListTime } from "../utils"
import type { ChatsTabProps, ChatGroup, Profile } from "../types"
import { useNavState } from "../nav-state"
import { fetchChatList } from "../chat-list"
import { chatCapabilities } from "../chat-permissions"
import { chatChipAvatar } from "../chat-avatar"
import { prefetchThread } from "../chat-thread-cache"

// Warm a chat's transcript only for a press that behaves like a TAP — one that
// doesn't move. A press that turns into a scroll or a horizontal swipe never
// becomes an open, so it must not pay for one. Deliberately tiny and local: the
// press either settles (warm) or moves (cancel), and prefetchThread itself is
// idempotent, TTL'd and failure-silent, so a double fire costs nothing.
const WARM_SETTLE_MS = 90
const WARM_MOVE_TOLERANCE_PX = 8
function warmOnSettledPress(groupId: string) {
  if (typeof window === "undefined") return
  let startX = 0, startY = 0, moved = false
  const onMove = (e: PointerEvent) => {
    if (!startX && !startY) { startX = e.clientX; startY = e.clientY; return }
    if (Math.abs(e.clientX - startX) > WARM_MOVE_TOLERANCE_PX || Math.abs(e.clientY - startY) > WARM_MOVE_TOLERANCE_PX) moved = true
  }
  const cleanup = () => {
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", cleanup)
    window.removeEventListener("pointercancel", cleanup)
    clearTimeout(timer)
  }
  const timer = setTimeout(() => {
    if (!moved) prefetchThread(groupId)
    cleanup()
  }, WARM_SETTLE_MS)
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", cleanup)
  window.addEventListener("pointercancel", cleanup)
}
import { setChatPinned, setChatMuted, setChatArchived, leaveChat } from "../chat-actions"
import type { SwipeAction, SwipeSide } from "@/components/central/swipe-actions"
import { PushSubscribeCard } from "../components/notifications"
import { isChatManageRole } from "@/lib/roles"
import { useBackIntent } from "@/lib/back-intent"
import { CHURCH_SECTION_DEFS, sectionChurchChats, partitionPinned, isLockedChat, type ChurchSection, type ChatsSection } from "./chat-shared"

// The create-chat composer lives in the heavy chats-tab module. Reaching it with
// a plain import would drag ChatScreen + ChatSettings back into this chunk and
// undo the split, so it is loaded on demand — `showCreateChat` starts null, so
// nothing fetches it until someone actually taps +.
const CreateChatScreen = dynamic(() => import("./chats-tab").then(m => m.CreateChatScreen), { ssr: false })

// ── Client-only row timestamp ────────────────────────────────────────────────
// formatChatListTime (app/home/utils.ts) is DEVICE-LOCAL by design — chat
// message time is the one time in the app that is deliberately not the
// ministry's zone (Convention #23). That makes it unrenderable on the server:
// Vercel is UTC, so the server would emit a different clock string AND a
// different today/yesterday boundary than the device, which is a hydration
// mismatch. suppressHydrationWarning would only hide the warning while still
// painting the wrong time for a frame.
//
// So: render no time on the server and on the hydration render; it appears on
// mount. useSyncExternalStore gives that with no set-state-in-effect — the
// server snapshot is false, the client snapshot is true, and the value never
// changes so subscribe is a no-op.
const subscribeNoop = () => () => {}
function useChatListTime(iso: string | null | undefined): string | undefined {
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false)
  return mounted && iso ? formatChatListTime(iso) : undefined
}

// One conversation row: PocketRow fed from a ChatGroup — plum circle monogram,
// "Sender: text" preview, time + unread dot right column.
//
// The chip is a MonogramChip (plum + cream, CIRCLE — the one owner of avatar
// colour and shape, per CLAUDE.md), matching the desktop chat list exactly. It
// was a PocketChip: a `--r-callout` SQUIRCLE, tonal `--pocket-track` by default
// and solid plum only for the ministry-wide room. Retired 2026-08-16 — a chat's
// identity is a person or a group, and those are round everywhere else in the
// app (directory, roster, member sheet). Every chat now takes the same plum
// circle; `is_central_chat` no longer changes how a row LOOKS (it still drives
// permissions and chat settings).
//
// The picture comes from `chatChipAvatar(group)` (app/home/chat-avatar.ts) — the
// group's own photo, or for a DM the counterpart's profile photo. Always through
// that resolver, never by reading a field directly; check-chat-avatar.sh enforces
// it. Initials are the fallback when there's no photo.
function PocketChatRow({ group, isFirst, onClick }: { group: ChatGroup; isFirst: boolean; onClick: () => void }) {
  const time = useChatListTime(group.last_message_time)
  return (
    <PocketRow
      immersive
      isFirst={isFirst}
      leading={
        <ChatAvatar
          size={46}
          title={group.name}
          avatarUrl={chatChipAvatar(group)}
          members={group.cluster_members}
          otherCount={group.other_member_count}
          nameIsGenerated={group.name_is_generated}
          isCentral={group.is_central_chat}
          // Full-bleed rows sit on the page surface, so the ring between
          // overlapping circles has to be cream, not the old card ivory.
          surface="var(--cream)"
        />
      }
      // The cluster is aria-hidden, so the row's own name is what carries the
      // members to a screen reader.
      ariaLabel={chatAvatarLabel(group.name, group.cluster_members ?? [], group.other_member_count ?? 0, group.name_is_generated === true)}
      title={group.name}
      // Dead thread (the counterpart deleted their account): the title drops to
      // the tertiary text token. The row is otherwise untouched and still opens
      // the conversation — mapChatListRows has already sunk it to the bottom.
      titleDim={group.counterpart_deleted === true}
      titleAccessory={
        <>
          {group.pinned && <Pin style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0 }} aria-label="Pinned" />}
          {group.muted && <BellOff style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0 }} aria-label="Muted" />}
        </>
      }
      sub={group.last_message
        ? (group.last_sender ? `${group.last_sender}: ${group.last_message}` : group.last_message)
        : "No messages yet"}
      time={time}
      showDot={group.unread_count > 0 && !group.muted}
      onClick={onClick}
      // Warm the thread on PRESS, so the fetch is in flight before the tap
      // resolves and ChatScreen mounts. Gated on the press STAYING STILL: this row
      // is wrapped in SwipeActionRow and sits in a scroller, so a bare pointerdown
      // also fires for every flick-scroll and swipe-to-reveal — flicking down a
      // 20-room list would have fired ~20 fifty-message queries on cellular.
      onPointerDown={() => warmOnSettledPress(group.id)}
    />
  )
}

// Swipe wiring for a card of chat rows. `openId`/`openSide` live in ChatsTab so
// only ONE row across the whole list can be open at a time.
export interface ChatSwipeConfig {
  openId: string | null
  openSide: SwipeSide | null
  onOpenChange: (id: string, side: SwipeSide | null) => void
  actionsFor: (g: ChatGroup) => { leading: SwipeAction[]; trailing: SwipeAction[] }
}

// A full-bleed run of chat rows sitting directly on the page surface — no card.
// Rows carry their own 20px gutter (PocketRow `immersive`) and separate with a
// --line-3 top rule, so the list and the screen are one ground plane and the tap
// target is the full screen width instead of width − 76px.
//
// `bleed` is 0 now: it existed solely to cancel PocketRowCard's 18px inset so the
// swipe panel reached the card's edge. With no card the panel already spans the
// screen, and a non-zero bleed would overhang it.
function PocketChatRun({ groups, onOpen, swipe }: {
  groups: ChatGroup[]
  onOpen: (id: string, name: string) => void
  swipe?: ChatSwipeConfig
}) {
  return (
    <>
      {groups.map((g, i) => {
        const row = <PocketChatRow group={g} isFirst={i === 0} onClick={() => onOpen(g.id, g.name)} />
        if (!swipe) return <div key={g.id}>{row}</div>
        const { leading, trailing } = swipe.actionsFor(g)
        return (
          <SwipeActionRow
            key={g.id}
            leading={leading}
            trailing={trailing}
            surface="var(--cream)"
            open={swipe.openId === g.id ? swipe.openSide : null}
            onOpenChange={(side) => swipe.onOpenChange(g.id, side)}
          >
            {row}
          </SwipeActionRow>
        )
      })}
    </>
  )
}

// Church chats sectioned into General / Groups / Teams (mockup `.grp` headers +
// per-section tonal card). Each header carries its own compact plum + that opens
// the create sheet pre-set to that section's category (leader/admin only). Empty
// sections self-hide; a fully-empty church scope is handled by the caller.
function PocketChurchSections({ sections, canCreate, onOpen, onAddInSection, swipe }: {
  sections: Record<ChurchSection, ChatGroup[]>
  canCreate: boolean
  onOpen: (id: string, name: string) => void
  onAddInSection: (category: ChurchSection) => void
  swipe?: ChatSwipeConfig
}) {
  // The FIRST rendered section sits tight under the scope pills — the 20px
  // section gap is a between-sections rhythm, not a lead-in (empty sections
  // self-hide, so "first" is the first section that actually renders).
  const visibleKeys = CHURCH_SECTION_DEFS.filter(({ key }) => sections[key].length > 0).map(({ key }) => key)
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {CHURCH_SECTION_DEFS.map(({ key, label }) => {
        const rooms = partitionPinned(sections[key])
        if (rooms.length === 0) return null
        return (
          <div key={key}>
            {/* Full-bleed section eyebrow: it carries the rule that opens the run,
                so the first row needs no top border and the last row leaves none
                dangling under it. 20px inset matches the rows' own gutter. */}
            <PocketKicker
              label={label}
              style={{
                margin: 0,
                padding: key === visibleKeys[0] ? "14px 20px 10px" : "24px 20px 10px",
                borderTop: "1px solid var(--line-3)",
              }}
              action={canCreate ? (
                <button
                  onClick={() => onAddInSection(key)}
                  aria-label={`New ${label.toLowerCase()} chat`}
                  style={{ background: "none", border: "none", color: "var(--plum)", width: 26, height: 26, display: "grid", placeItems: "center", margin: "-4px 0", cursor: "pointer" }}
                >
                  <Plus style={{ width: 15, height: 15 }} strokeWidth={1.8} />
                </button>
              ) : undefined}
            />
            <PocketChatRun groups={rooms} onOpen={onOpen} swipe={swipe} />
          </div>
        )
      })}
    </div>
  )
}

export function ChatsTab({ userId, userProfile, userRole, ministryId, ministryName, onOpenChat, onTotalUnreadChange, refreshKey, onOpenDirectory, activeGroupId, canCreateChurchChat, fallbackChats, initialSection, onComposerOpenChange, onOpenDraftDm }: ChatsTabProps) {
  const { setParam } = useNavState()
  // Server-resolved (app/home/page.tsx → resolveChatsSection), never read off
  // window here — see the note on resolveChatsSection in ./chat-shared.
  const [subTab, setSubTab] = useState<ChatsSection>(initialSection)
  const [showCreateChat, setShowCreateChat] = useState<"my" | "church" | null>(null)
  // Land the Church↔My scope swap at the top (window scroll on phone width).
  useScrollResetOn([subTab])

  // Report the full-screen CreateChatScreen up/down so home-app hides the pill
  // nav (§2.2). Cleanup covers unmount-while-open (e.g. URL-driven tab change).
  useEffect(() => {
    onComposerOpenChange?.(showCreateChat !== null)
    return () => onComposerOpenChange?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateChat])
  // Which church section the create sheet should pre-select, when opened from a
  // section header's + (ignored for My Chats). Reset whenever the sheet closes.
  const [createChatCategory, setCreateChatCategory] = useState<ChurchSection | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")
  // Mobile search: the field is always mounted; `searchOpen` swaps the body below
  // it to the search view. Kept separate from `search` (the desktop panel's own
  // filter) so the two surfaces never share a stale query.
  const [mobileSearch, setMobileSearch] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  // Open-group discovery. Its OWN SWR key, not the chat-list key — this is the
  // ministry's open rooms, most of which the user is not in, so it revalidates on
  // its own cadence. The row counts only rooms you could actually join.
  const [browseOpen, setBrowseOpen] = useState(false)
  const { data: openGroups } = useSWR(openGroupsKey(ministryId), fetchOpenGroups)
  const openGroupCount = (openGroups ?? []).filter((g) => !g.isMember).length
  const closeMobileSearch = useCallback(() => { setSearchOpen(false); setMobileSearch("") }, [])

  // Escape leaves search, mirroring the X.
  useEffect(() => {
    if (!searchOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMobileSearch() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [searchOpen, closeMobileSearch])

  // While searching, the floating pill nav hides — same rule the full-screen
  // composer uses (mobile §3: nav hidden on composers).
  useEffect(() => {
    onComposerOpenChange?.(searchOpen)
    return () => onComposerOpenChange?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen])

  const isAdminOrLeader = isChatManageRole(userRole)

  // Tapping a person in search: reuse the DM you already share, otherwise open a
  // draft. The group is only created on the first send (app/home/dm.ts).
  const searchSupabase = useMemo(() => createClient(), [])
  const handleOpenPerson = useCallback(async (p: { id: string; name: string }) => {
    const existing = await findExistingDm(searchSupabase, userId, p.id)
    if (existing) onOpenChat(existing, p.name, "dm")
    else onOpenDraftDm?.({ id: p.id, name: p.name })
  }, [searchSupabase, userId, onOpenChat, onOpenDraftDm])

  // Stable key (no refreshKey) so revisits dedupe to one cache entry and paint instantly.
  const { data, error, isLoading, mutate } = useSWR<ChatGroup[]>(
    userId && ministryId ? ["chat-list", userId, ministryId] : null,
    fetchChatList,
    { fallbackData: fallbackChats },
  )

  // Prefer this panel's own SWR data when it actually has items; otherwise fall
  // back to fallbackChats (home-app's reliable plain-fetch state), which renders
  // even when this code-split panel's SWR hook stays undefined.
  const allGroups = (data && data.length > 0 ? data : fallbackChats) ?? data ?? []
  const churchChats = allGroups.filter((g) => g.type === "church" && !g.archived)
  const archivedChurchChats = allGroups.filter((g) => g.type === "church" && g.archived)
  const myChats = allGroups.filter((g) => g.type !== "church")
  // The spinner is for having NOTHING to show — not for "a request is in
  // flight". Both cases it exists for are the empty case: a first load that
  // hasn't answered yet, and a poisoned/failed fetch (which must never fall
  // through to the "No chats" empty state, since that reads as a fact about the
  // user). Whenever rows exist — SSR seed, fallbackChats, or stale
  // keepPreviousData — render them; stale beats empty, and seeded beats stale.
  //
  // This used to lead with `isLoading`, which SWR defines as "a request is in
  // flight and no LOADED data" — and fallbackData explicitly does not count as
  // loaded. So the seeded list was thrown away and every visit showed a spinner
  // until the client round trip returned, which is the exact wait this whole
  // change exists to remove: the rows are in the HTML, they just weren't allowed
  // to paint.
  const loading = allGroups.length === 0 && (isLoading || !!error)

  // Optimistic unread-clear on the shared cache key (survives revalidation timing).
  function clearUnread(groupId: string) {
    mutate(
      (current) => current ? current.map((g) => (g.id === groupId ? { ...g, unread_count: 0 } : g)) : current,
      { revalidate: false },
    )
  }

  function handleOpenChat(groupId: string, groupName: string) {
    clearUnread(groupId)
    onOpenChat(groupId, groupName)
  }

  // ── Swipe row actions (phone width) ────────────────────────────────────────
  // An ACCELERATOR for things chat Settings already does — pin/mute for everyone,
  // plus the one reversible room action the user's role allows. Church-chat
  // DELETE is deliberately absent: it destroys the room and every message for all
  // members, and a thumb-flick is the wrong distance from that. Archive (which a
  // leader can undo) stands in for it; Delete keeps its deliberate path through
  // Settings' danger zone.
  const [swipeOpen, setSwipeOpen] = useState<{ id: string; side: SwipeSide } | null>(null)
  const [chatConfirm, setChatConfirm] = useState<{ kind: "archive" | "leave"; group: ChatGroup } | null>(null)
  const [chatToast, setChatToast] = useState<{ message: string; undo?: () => void } | null>(null)

  // Android hardware/gesture back closes an open row before it does anything
  // else — the row is a transient state the user expects back to dismiss.
  useBackIntent(swipeOpen ? () => setSwipeOpen(null) : undefined)
  // A row left open while the list re-buckets would sit over the wrong chat.
  useEffect(() => { setSwipeOpen(null) }, [subTab])

  const chatCtx = useCallback(
    (g: ChatGroup) => ({ groupId: g.id, userId, ministryId, userName: userProfile.name }),
    [userId, ministryId, userProfile.name],
  )

  // The row updates optimistically, so the toast does too — waiting for the round
  // trip to confirm what the list already shows reads as lag. A failed write
  // rolls the row back and REPLACES the toast with the reason.
  const runPin = useCallback(async (g: ChatGroup) => {
    const next = !g.pinned
    setChatToast({
      message: next ? "Pinned" : "Unpinned",
      undo: () => { setChatPinned(chatCtx(g), !next) },
    })
    const err = await setChatPinned(chatCtx(g), next)
    if (err) setChatToast({ message: err })
  }, [chatCtx])

  const runMute = useCallback(async (g: ChatGroup) => {
    const next = !g.muted
    setChatToast({
      message: next ? "Muted" : "Unmuted",
      undo: () => { setChatMuted(chatCtx(g), !next) },
    })
    const err = await setChatMuted(chatCtx(g), next)
    if (err) setChatToast({ message: err })
  }, [chatCtx])

  const actionsFor = useCallback((g: ChatGroup): { leading: SwipeAction[]; trailing: SwipeAction[] } => {
    // Every row in this list came from get_chat_list, which only returns rooms
    // the user belongs to — so membership is implied and the church gate reduces
    // to the role check.
    const caps = chatCapabilities(
      { type: g.type, archived: g.archived, isCentral: g.is_central_chat, isMemberOfChat: true },
      userRole,
    )
    const ico = { width: 16, height: 16 } as const
    const leading: SwipeAction[] = [{
      key: "pin",
      label: g.pinned ? "Unpin" : "Pin",
      icon: g.pinned ? <PinOff style={ico} /> : <Pin style={ico} />,
      onSelect: () => { runPin(g) },
    }]
    const trailing: SwipeAction[] = [{
      key: "mute",
      label: g.muted ? "Unmute" : "Mute",
      icon: g.muted ? <Bell style={ico} /> : <BellOff style={ico} />,
      onSelect: () => { runMute(g) },
    }]
    if (caps.canArchive) trailing.push({
      key: "archive", label: "Archive", tone: "strong", icon: <Archive style={ico} />,
      onSelect: () => setChatConfirm({ kind: "archive", group: g }),
    })
    // Unarchive is reversible and low-stakes, so it fires straight from the swipe
    // with an Undo rather than through a confirm.
    else if (caps.canUnarchive) trailing.push({
      key: "unarchive", label: "Unarchive", tone: "strong", icon: <ArchiveRestore style={ico} />,
      onSelect: async () => {
        setChatToast({ message: "Chat unarchived", undo: () => { setChatArchived(chatCtx(g), true) } })
        const err = await setChatArchived(chatCtx(g), false)
        if (err) setChatToast({ message: err })
      },
    })
    if (caps.canLeave) trailing.push({
      key: "leave", label: "Leave", tone: "strong", icon: <LogOut style={ico} />,
      onSelect: () => setChatConfirm({ kind: "leave", group: g }),
    })
    return { leading, trailing }
  }, [userRole, runPin, runMute, chatCtx])

  const swipe: ChatSwipeConfig = {
    openId: swipeOpen?.id ?? null,
    openSide: swipeOpen?.side ?? null,
    onOpenChange: (id, side) => setSwipeOpen(side ? { id, side } : null),
    actionsFor,
  }

  async function confirmChatAction() {
    if (!chatConfirm) return
    const { kind, group } = chatConfirm
    setChatConfirm(null)
    if (kind === "archive") {
      const err = await setChatArchived(chatCtx(group), true)
      setChatToast(err ? { message: err } : { message: "Chat archived" })
    } else {
      const err = await leaveChat(chatCtx(group))
      setChatToast(err ? { message: err } : { message: `You left ${group.name}` })
    }
  }

  // Clear unread whenever activeGroupId changes (covers auto-open, HomeTab clicks, etc.)
  useEffect(() => {
    if (activeGroupId) clearUnread(activeGroupId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId])

  // Follow the open chat's category: when activeGroupId changes to a group present
  // in allGroups, snap the church/my subtab to that group's category. Reacts to
  // activeGroupId CHANGES only (the ref ensures an allGroups refresh alone won't
  // re-snap, so the user can freely click the other subtab while a chat stays open),
  // but still resolves once allGroups loads after activeGroupId was already set.
  const subTabSyncedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!activeGroupId) { subTabSyncedFor.current = null; return }
    if (subTabSyncedFor.current === activeGroupId) return
    const g = (data ?? []).find((x) => x.id === activeGroupId)
    if (!g) return
    subTabSyncedFor.current = activeGroupId
    setSubTab(g.type === "church" ? "church" : "my")
  }, [activeGroupId, data])

  // Revalidate the shared list when a chat closes (refreshKey bumps) — without
  // putting refreshKey in the SWR key (that would fragment the cache).
  useEffect(() => {
    if (refreshKey) mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  // Drive the bottom-nav unread badge off SWR data (side effect out of the fetcher).
  useEffect(() => {
    if (data) {
      const total = data.filter((g) => !g.archived && !g.muted).reduce((s, g) => s + g.unread_count, 0)
      onTotalUnreadChange(total)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const rawActive = subTab === "church" ? churchChats : myChats
  const active = search.trim()
    ? rawActive.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    : rawActive
  const monoStyle = MONO_STYLE

  // New-chat from the chrome — My chats only. On the Church scope the row-level +
  // is dropped (matches the desktop panel); each church section carries its own +.
  const canShowNewChat = subTab === "my"
  const openNewChat = () => {
    setCreateChatCategory(undefined)
    setShowCreateChat("my")
  }

  // Browse replaces the list entirely — it is a full-bleed push surface, so it
  // gets edge-swipe-back for free from SubpageShell (Convention #22).
  if (browseOpen) {
    return (
      <OpenGroupsBrowse
        userId={userId}
        ministryId={ministryId}
        onBack={() => setBrowseOpen(false)}
        onOpenChat={(id, name) => { setBrowseOpen(false); handleOpenChat(id, name) }}
      />
    )
  }

  return (
    <div className="pb-2 md:pb-0 md:h-full md:flex md:flex-col">
      {/* Mobile chrome (B3 Pocket) — the scope switch IS the title. "Chats" as a
          header earned nothing (the bottom nav already names the tab) while the
          Church/My chips cost a second full-width band, so the two collapsed into
          one row: scope at chrome-title type, then new-chat (My scope only) and
          the directory ghost. Ratified with Brian 2026-08-17. */}
      <PocketChrome
        title="Chats"
        scope={{
          options: [{ id: "church", label: "Church" }, { id: "my", label: "My chats" }],
          value: subTab,
          onChange: (t) => {
            setSubTab(t as ChatsSection)
            setSearch("")
            setParam("chats", t === "church" ? null : t)
          },
        }}
        action={canShowNewChat ? (
          <PocketRoundButton variant="plum" onClick={openNewChat} ariaLabel="New chat">
            <Plus style={{ width: 17, height: 17 }} strokeWidth={2} />
          </PocketRoundButton>
        ) : undefined}
        action2={
          <PocketRoundButton variant="ghost" onClick={onOpenDirectory} ariaLabel="Directory">
            <Users style={{ width: 17, height: 17 }} strokeWidth={1.6} />
          </PocketRoundButton>
        }
      />

      {/* Desktop Plan C header */}
      <div className="hidden md:block px-5 pt-5 pb-4 border-b border-[var(--line-2)] flex-shrink-0">
        <p style={monoStyle}>Workspace</p>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", lineHeight: 1.1, color: "var(--ink)", marginTop: "4px" }}>{ministryName}</p>
      </div>

      {/* Desktop search */}
      <div className="hidden md:flex items-center gap-2 mx-3 my-3 px-3.5 py-2.5 border border-[var(--line-2)] rounded-lg bg-[var(--body-bg)] text-[var(--muted-text)] flex-shrink-0">
        <Search className="w-4 h-4 flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages"
          className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-[var(--muted-text)] text-[var(--ink)]"
        />
      </div>

      {/* Desktop mode switcher — exclusive filter (Church | My Chats), SegmentedControl (R4/R12) */}
      <div className="hidden md:flex flex-shrink-0 px-4 py-3">
        <SegmentedControl
          aria-label="Chat scope"
          options={[{ id: "church", label: "Church Chats" }, { id: "my", label: "My Chats" }]}
          value={subTab}
          onChange={(t) => {
            setSubTab(t)
            setSearch("")
            setParam("chats", t === "church" ? null : t)
          }}
        />
      </div>

      {/* NO horizontal padding on this wrapper: the row list is FULL-BLEED and
          carries its own 20px gutter per row (PocketRow `immersive`). Everything
          that is not a row — chips, search, empty states — re-applies px-5 for
          itself. Desktop was already px-0 here, so it is unaffected. */}
      <div className="pt-1 pb-2 md:pt-2 md:flex-1 md:overflow-y-auto">
      {/* The mobile scope pills + inline new-chat that used to sit here moved INTO
          the chrome row above (scope = title). Nothing replaces this band — the
          list now starts directly under the one chrome row. */}

      {/* Search (mobile) — the field is always present; focusing it swaps the body
          below to the search view IN PLACE, so the field stays pinned and the
          change reads as a transition rather than a navigation. Chats + people,
          so you can reach someone you have never messaged. */}
      <div className="md:hidden mb-4 px-5">
        <PocketSearchField
          value={mobileSearch}
          onChange={setMobileSearch}
          placeholder="Search"
          onFocus={() => setSearchOpen(true)}
          trailing={searchOpen ? (
            <button
              onClick={closeMobileSearch}
              aria-label="Close search"
              style={{ background: "none", border: "none", padding: 0, display: "grid", placeItems: "center", color: "var(--muted-text)", cursor: "pointer", flexShrink: 0 }}
            >
              <X style={{ width: 17, height: 17 }} />
            </button>
          ) : undefined}
        />
      </div>

      {searchOpen ? (
        <div className="md:hidden chat-search-enter px-5">
          <ChatSearchView
            query={mobileSearch}
            chats={data ?? []}
            userId={userId}
            ministryId={ministryId}
            onOpenChat={(id, name) => { closeMobileSearch(); handleOpenChat(id, name) }}
            onOpenPerson={(p) => { closeMobileSearch(); handleOpenPerson(p) }}
          />
        </div>
      ) : (
      <>
      {/* Push-notification prompt — self-hides unless permission is 'default' & unsubscribed & not dismissed */}
      <div className="px-5 md:px-4">
        <PushSubscribeCard userId={userId} ministryId={ministryId} notificationSettings={userProfile.notification_settings} variant="pocket" style={{ marginBottom: 16 }} />
      </div>

      {/* Discovery, deliberately understated: ONE row, and only when there is
          actually something to browse. An always-present row for an empty list is
          the clutter this feature exists to avoid. */}
      {openGroupCount > 0 && (
        <PocketRow
          immersive
          isFirst
          leading={
            <div style={{
              width: 46, height: 46, borderRadius: "var(--r-callout)", flexShrink: 0,
              background: "var(--pocket-track)", display: "grid", placeItems: "center",
            }}>
              <Compass style={{ width: 20, height: 20, color: "var(--plum)" }} strokeWidth={1.7} />
            </div>
          }
          title="Open groups"
          sub={`${openGroupCount} group${openGroupCount === 1 ? "" : "s"} you can join`}
          chevron
          ariaLabel="Browse open groups"
          onClick={() => setBrowseOpen(true)}
        />
      )}

      {loading ? (
        <Spinner />
      ) : subTab === "my" ? (
        /* My chats — one full-bleed run of rows; pinned-first order. */
        active.length === 0 ? (
          <div className="px-5">
            <EmptyState
              icon={<Users className="w-7 h-7" />}
              title="No personal chats"
              subtitle="Tap + to start a new chat."
            />
          </div>
        ) : (
          <PocketChatRun groups={partitionPinned(active)} onOpen={handleOpenChat} swipe={swipe} />
        )
      ) : active.length === 0 && archivedChurchChats.length === 0 ? (
        <div className="px-5">
          <EmptyState
            icon={<Users className="w-7 h-7" />}
            title="No church chats"
            subtitle="You haven't been added to any church chats yet"
          />
        </div>
      ) : (
        /* Church chats — sectioned into General / Groups / Teams (Daybreak ruling
           #3), each a full-bleed run under its own ruled eyebrow; archived self-hides.
           No gap between sections: each eyebrow owns its lead-in padding + rule. */
        <div className="flex flex-col">
          {active.length > 0 && (
            <PocketChurchSections
              sections={sectionChurchChats(active)}
              canCreate={canCreateChurchChat}
              onOpen={handleOpenChat}
              onAddInSection={(category) => { setCreateChatCategory(category); setShowCreateChat("church") }}
              swipe={swipe}
            />
          )}

          {/* Archived (Church chats only) — collapsed accordion, self-hides when none */}
          {archivedChurchChats.length > 0 && (
            <div>
              <button
                onClick={() => setShowArchived((s) => !s)}
                className="w-full flex items-center justify-between py-2 px-5"
              >
                <span style={POCKET_KICKER_STYLE}>
                  Archived · {archivedChurchChats.length}
                </span>
                <ChevronDown className={`w-4 h-4 text-[var(--muted-text)] transition-transform duration-200 ${showArchived ? "rotate-180" : ""}`} />
              </button>
              {showArchived && (
                <div style={{ opacity: 0.6, marginTop: 8 }}>
                  <PocketChatRun groups={archivedChurchChats} onOpen={handleOpenChat} swipe={swipe} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </>
      )}

      {showCreateChat && (
        <CreateChatScreen
          userId={userId}
          userName={userProfile.name}
          ministryId={ministryId}
          groupType={showCreateChat}
          initialCategory={showCreateChat === "church" ? createChatCategory : undefined}
          onClose={() => { setShowCreateChat(null); setCreateChatCategory(undefined) }}
          onCreated={(group) => {
            const newGroup: ChatGroup = {
              id: group.id,
              name: group.name,
              type: showCreateChat!,
              category: group.category ?? null,
              last_message: null,
              last_sender: null,
              last_message_time: null,
              unread_count: 0,
              archived: false,
            }
            mutate((current) => [newGroup, ...(current ?? [])], { revalidate: false })
            setShowCreateChat(null)
            setCreateChatCategory(undefined)
            onOpenChat(group.id, group.name)
          }}
        />
      )}

      {/* Swipe-action confirms. Archive and Leave both change what a room IS for
          someone, so they get the same deliberate step Settings gives them
          (Hard-do-not #10). Pin/mute stay instant with an Undo toast. */}
      <ConfirmDialog
        open={!!chatConfirm}
        danger={chatConfirm?.kind === "leave"}
        title={chatConfirm?.kind === "archive" ? "Archive this chat?" : "Leave this chat?"}
        message={chatConfirm?.kind === "archive"
          ? "Members won't be able to send new messages. You can unarchive it later."
          : "You'll stop receiving its messages."}
        confirmLabel={chatConfirm?.kind === "archive" ? "Archive" : "Leave"}
        onConfirm={confirmChatAction}
        onClose={() => setChatConfirm(null)}
      />
      {chatToast && (
        <Toast
          message={chatToast.message}
          actionLabel={chatToast.undo ? "Undo" : undefined}
          onAction={chatToast.undo ? () => { chatToast.undo?.(); setChatToast(null) } : undefined}
          onDismiss={() => setChatToast(null)}
        />
      )}
      </div>{/* end inner scroll div */}

    </div>
  )
}

export function ChatGroupCard({ group, onClick, isActive, locked }: { group: ChatGroup; onClick: () => void; isActive?: boolean; locked?: boolean }) {
  // Group photo, or a DM partner's face — one derivation, see chat-avatar.ts.
  const chipAvatar = chatChipAvatar(group)
  // Glyph precedence: pinned + muted take the two available slots; lock drops when
  // both are set (a locked room is already implied by its section). With ≤1 of
  // pin/mute set, lock may render alongside. Order: pin, mute, lock.
  const showLock = locked && !(group.pinned && group.muted)
  // Muted silences the unread badge/dot regardless of unread_count.
  const showUnread = group.unread_count > 0 && !group.muted
  const time = useChatListTime(group.last_message_time)
  // Dead thread (the DM's counterpart deleted their account): the NAME drops to
  // the tertiary text token, matching the chat roster (Part A) and the phone-width
  // list. Not opacity (below AA) and not --faint (a non-text token); nothing else
  // on the row changes, and the row still opens. mapChatListRows already sank it.
  const nameColor = group.counterpart_deleted ? "var(--muted-text)" : "var(--ink)"

  return (
    <button onClick={onClick} onPointerDown={() => prefetchThread(group.id)} className="w-full text-left group">
      {/* Mobile style */}
      <div className="md:hidden bg-[var(--cream-panel)] border border-[var(--line)] rounded-[18px] p-4 hover:bg-[#F5F0E8] transition-colors">
        <div className="flex items-center gap-3.5">
          <ChatAvatar
            size={48}
            title={group.name}
            avatarUrl={chipAvatar}
            members={group.cluster_members}
            otherCount={group.other_member_count}
            nameIsGenerated={group.name_is_generated}
            isCentral={group.is_central_chat}
            surface="var(--cream-panel)"
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 min-w-0 pr-2">
                <h3 className="text-[15px] font-medium truncate" style={{ color: nameColor }}>{group.name}</h3>
                {group.pinned && <Pin className="w-3 h-3 flex-shrink-0" style={{ color: "var(--muted-text)" }} aria-label="Pinned" />}
                {group.muted && <BellOff className="w-3 h-3 flex-shrink-0" style={{ color: "var(--muted-text)" }} aria-label="Muted" />}
                {showLock && <Lock className="w-3 h-3 flex-shrink-0" style={{ color: "var(--muted-text)" }} aria-label="Members only" />}
              </div>
              {time && <span className="text-[11px] text-[var(--muted-text)] flex-shrink-0">{time}</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-[var(--body)] truncate">
                {group.last_message
                  ? group.last_sender ? <><span className="font-medium text-[var(--body)]">{group.last_sender}:</span> {group.last_message}</> : group.last_message
                  : <span className="italic text-[var(--muted-text)]">No messages yet</span>}
              </p>
              {showUnread && (
                <span className="w-6 h-6 bg-[var(--plum)] rounded-full text-[11px] font-medium text-[var(--cream)] flex items-center justify-center flex-shrink-0">{group.unread_count}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop panel item — proportioned for 220px context panel */}
      <div
        className="hidden md:flex items-center gap-2.5 px-2.5 py-2 transition-colors duration-100"
        style={{
          borderLeft: isActive ? "3px solid var(--plum)" : "3px solid transparent",
          background: isActive ? "var(--plum-tint)" : undefined,
          borderRadius: isActive ? "var(--r-callout)" : undefined,
          margin: "0 4px",
        }}
        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--cream-3)" }}
        onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "" }}
      >
        <ChatAvatar
          size={38}
          title={group.name}
          avatarUrl={chipAvatar}
          members={group.cluster_members}
          otherCount={group.other_member_count}
          nameIsGenerated={group.name_is_generated}
          isCentral={group.is_central_chat}
          // Desktop panel rows sit on the panel fill, and the active row tints —
          // the ring follows whichever is behind it.
          surface={isActive ? "var(--plum-tint)" : "var(--cream)"}
          className="flex-shrink-0"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
            <p className="text-[13px] truncate leading-tight" style={{ color: nameColor, fontWeight: group.unread_count ? 600 : 500, flex: 1, minWidth: 0 }}>
              {group.name}
            </p>
            {group.pinned && <Pin style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0, alignSelf: "center" }} aria-label="Pinned" />}
            {group.muted && <BellOff style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0, alignSelf: "center" }} aria-label="Muted" />}
            {showLock && <Lock style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0, alignSelf: "center" }} aria-label="Members only" />}
            {time && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.04em", color: "var(--muted-text)", flexShrink: 0 }}>
                {time}
              </span>
            )}
          </div>
          <p className="text-[11.5px] truncate leading-tight" style={{ color: group.unread_count ? "var(--body)" : "var(--muted-text)" }}>
            {group.last_message
              ? (group.last_sender ? `${group.last_sender}: ${group.last_message}` : group.last_message)
              : <span style={{ fontStyle: "italic" }}>No messages yet</span>}
          </p>
        </div>
        {showUnread && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--plum)", flexShrink: 0 }} />
        )}
      </div>
    </button>
  )
}

// ── ChatListPanel ────────────────────────────────────────────────────────────
// Self-contained panel component for the 220px DesktopSidebar context panel.
// Mirrors DirectoryMemberListPanel: own state + data fetching, minimal props.

export interface ChatListPanelProps {
  /** Opens the browse-open-groups page in the desktop content area. */
  onBrowseOpenGroups?: () => void
  userId: string
  ministryId: string
  ministryName: string
  activeGroupId?: string | null
  onOpenChat: (id: string, name: string, type?: string) => void
  refreshKey: number
  canCreateChurchChat: boolean
  userProfile: Profile
  userRole: string
  fallbackChats?: ChatGroup[]
  /** Scope this panel opens on, resolved from `?chats` on the SERVER. */
  initialSection: ChatsSection
  /** Open a draft DM (no group row until the first send) — see app/home/dm.ts. */
  onOpenDraftDm?: (person: { id: string; name: string }) => void
}

export function ChatListPanel({ userId, ministryId, ministryName, activeGroupId, onOpenChat, refreshKey, canCreateChurchChat, userProfile, userRole, fallbackChats, initialSection, onOpenDraftDm, onBrowseOpenGroups }: ChatListPanelProps) {
  // Same SWR key as the mobile list — one fetch serves both, and a join in either
  // place updates the other.
  const { data: panelOpenGroups } = useSWR(openGroupsKey(ministryId), fetchOpenGroups)
  const panelOpenGroupCount = (panelOpenGroups ?? []).filter((g) => !g.isMember).length
  const { setParam } = useNavState()
  // Server-resolved — same single source as ChatsTab (./chat-shared).
  const [subTab, setSubTab] = useState<ChatsSection>(initialSection)
  const [showCreateChat, setShowCreateChat] = useState<"my" | "church" | null>(null)
  // Section to pre-select when the create sheet opens from a church section's +
  // button. Ignored for "my" chats.
  const [pendingCategory, setPendingCategory] = useState<ChurchSection | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")
  // Focusing the field consumes the panel with the shared search body.
  const [searchOpen, setSearchOpen] = useState(false)
  const closePanelSearch = useCallback(() => { setSearchOpen(false); setSearch("") }, [])
  const panelSupabase = useMemo(() => createClient(), [])
  const handleOpenPersonPanel = useCallback(async (p: { id: string; name: string }) => {
    const existing = await findExistingDm(panelSupabase, userId, p.id)
    if (existing) onOpenChat(existing, p.name)
    else onOpenDraftDm?.({ id: p.id, name: p.name })
  }, [panelSupabase, userId, onOpenChat, onOpenDraftDm])

  // Same stable key + fetcher as mobile ChatsTab → SWR dedupes both to one cache
  // entry; revisits paint instantly from cache (no skeleton).
  const { data, error, isLoading, mutate } = useSWR<ChatGroup[]>(
    userId && ministryId ? ["chat-list", userId, ministryId] : null,
    fetchChatList,
    { fallbackData: fallbackChats },
  )

  // Prefer this panel's own SWR data when it actually has items; otherwise fall
  // back to fallbackChats (home-app's reliable plain-fetch state), which renders
  // even when this code-split panel's SWR hook stays undefined.
  const allGroups = (data && data.length > 0 ? data : fallbackChats) ?? data ?? []
  const churchChats = allGroups.filter((g) => g.type === "church" && !g.archived)
  const archivedChurchChats = allGroups.filter((g) => g.type === "church" && g.archived)
  const myChats = allGroups.filter((g) => g.type !== "church")
  // Same rule as ChatsTab above — spinner only when there is nothing to show.
  // See the note there on why leading with SWR's `isLoading` discarded the
  // server-seeded rows.
  const loading = allGroups.length === 0 && (isLoading || !!error)

  // Optimistic unread-clear on the shared cache key.
  function clearUnread(groupId: string) {
    mutate(
      (current) => current ? current.map((g) => (g.id === groupId ? { ...g, unread_count: 0 } : g)) : current,
      { revalidate: false },
    )
  }

  function handleOpenChatPanel(groupId: string, groupName: string) {
    clearUnread(groupId)
    onOpenChat(groupId, groupName)
  }

  useEffect(() => {
    if (activeGroupId) clearUnread(activeGroupId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId])

  // Follow the open chat's category — see ChatsTab above for rationale.
  const subTabSyncedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!activeGroupId) { subTabSyncedFor.current = null; return }
    if (subTabSyncedFor.current === activeGroupId) return
    const g = (data ?? []).find((x) => x.id === activeGroupId)
    if (!g) return
    subTabSyncedFor.current = activeGroupId
    setSubTab(g.type === "church" ? "church" : "my")
  }, [activeGroupId, data])

  // Revalidate the shared list when a chat closes (refreshKey bumps) — without
  // fragmenting the cache by putting refreshKey in the SWR key.
  useEffect(() => {
    if (refreshKey) mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const rawActive = subTab === "church" ? churchChats : myChats
  const active = search.trim()
    ? rawActive.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    : rawActive
  const churchSections = subTab === "church" ? sectionChurchChats(active) : null
  const showPlusButton = subTab === "my" || (subTab === "church" && canCreateChurchChat)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search — matches DirectoryMemberListPanel. Focusing it consumes the
          panel below with the SAME search body the mobile overlay uses, so this
          reaches people you've never messaged instead of only name-filtering the
          chats you're already in. The X restores the list. */}
      <div className="px-3 py-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--muted-text)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => { if (e.key === "Escape") closePanelSearch() }}
            placeholder="Search chats and people"
            className="w-full pl-9 pr-9 py-2 rounded-lg border text-[12.5px] placeholder:text-[var(--muted-text)] focus:outline-none focus:ring-2 focus:ring-[var(--plum)]/20"
            style={{ background: "var(--cream)", borderColor: "var(--line-2)", color: "var(--ink)" }}
          />
          {searchOpen && (
            <button
              onClick={closePanelSearch}
              aria-label="Close search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ background: "none", border: "none", padding: 2, display: "grid", placeItems: "center", color: "var(--muted-text)", cursor: "pointer" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <ChatSearchView
            query={search}
            chats={data ?? []}
            userId={userId}
            ministryId={ministryId}
            onOpenChat={(id, name) => { closePanelSearch(); handleOpenChatPanel(id, name) }}
            onOpenPerson={(p) => { closePanelSearch(); handleOpenPersonPanel(p) }}
          />
        </div>
      )}
      {!searchOpen && (
      <>

      {/* Discovery — the desktop twin of the mobile chat list's row. One line, only
          when there is something to browse; it opens the browse PAGE in the content
          area (never a modal — design contract hard do-not #1). */}
      {panelOpenGroupCount > 0 && onBrowseOpenGroups && (
        <button
          onClick={onBrowseOpenGroups}
          className="w-full flex items-center gap-2.5 px-3 py-2 mb-1 flex-shrink-0 text-left transition-colors hover:bg-[var(--ivory)]"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <Compass style={{ width: 15, height: 15, color: "var(--plum)", flexShrink: 0 }} strokeWidth={1.8} />
          <span className="flex-1 min-w-0 text-[13.5px]" style={{ color: "var(--ink)" }}>Open groups</span>
          <span className="text-[12px]" style={{ color: "var(--muted-text)" }}>{panelOpenGroupCount}</span>
        </button>
      )}

      {/* Church / My mode switcher — exclusive filter, SegmentedControl (R4/R12) */}
      <div className="px-3 flex-shrink-0">
        <SegmentedControl
          aria-label="Chat scope"
          options={[{ id: "church", label: "Church" }, { id: "my", label: "My Chats" }]}
          value={subTab}
          onChange={(t) => {
            setSubTab(t)
            setSearch("")
            setParam("chats", t === "church" ? null : t)
          }}
        />
      </div>

      {/* Count + plus button — My Chats only. On the Church subtab the count/+
          row is dropped; each section header carries its own + instead. */}
      {subTab === "my" && (
        <div className="flex items-center justify-between px-3 pt-4 pb-2 flex-shrink-0">
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)" }}>
            {`Direct · ${myChats.length}`}
          </p>
          {showPlusButton && (
            <button
              onClick={() => setShowCreateChat("my")}
              style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-text)", borderRadius: "var(--r-pill)", padding: 0 }}
              title="New chat"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* List */}
      <div className={`flex-1 overflow-y-auto ${subTab === "church" ? "pt-3" : ""}`}>
        <PushSubscribeCard userId={userId} ministryId={ministryId} notificationSettings={userProfile?.notification_settings} style={{ margin: "4px 12px 12px", padding: 16 }} />
        {loading ? (
          <div className="px-2 pt-2"><Spinner /></div>
        ) : active.length === 0 && !(subTab === "church" && archivedChurchChats.length > 0) ? (
          <p style={{ fontSize: 12, color: "var(--muted-text)", padding: "8px 12px", fontFamily: "var(--sans)" }}>
            {search.trim() ? "No results" : subTab === "church" ? "No church chats" : "No personal chats"}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 pt-1">
              {churchSections ? (
                CHURCH_SECTION_DEFS.flatMap(({ key, label }) => {
                  const rooms = partitionPinned(churchSections[key])
                  if (rooms.length === 0) return []
                  return [
                    <div key={`sec-${key}`} className="flex items-center justify-between px-4 pt-3 pb-1">
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)" }}>{label}</span>
                      {canCreateChurchChat && (
                        <button
                          onClick={() => { setPendingCategory(key); setShowCreateChat("church") }}
                          style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-text)", borderRadius: "var(--r-pill)", padding: 0 }}
                          title={`New ${label.toLowerCase()} chat`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>,
                    ...rooms.map((group) => (
                      <ChatGroupCard key={group.id} group={group} onClick={() => handleOpenChatPanel(group.id, group.name)} isActive={activeGroupId === group.id} locked={isLockedChat(group, ministryName)} />
                    )),
                  ]
                })
              ) : (
                partitionPinned(active).map((group) => (
                  <ChatGroupCard key={group.id} group={group} onClick={() => handleOpenChatPanel(group.id, group.name)} isActive={activeGroupId === group.id} />
                ))
              )}
            </div>
            {subTab === "church" && archivedChurchChats.length > 0 && (
              <div>
                <button
                  onClick={() => setShowArchived(s => !s)}
                  className="w-full flex items-center justify-between px-4 py-2"
                >
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)" }}>
                    Archived · {archivedChurchChats.length}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-[var(--faint)] transition-transform duration-200 ${showArchived ? "rotate-180" : ""}`} />
                </button>
                {showArchived && (
                  <div className="flex flex-col gap-2">
                    {archivedChurchChats.map((group) => (
                      <div key={group.id} className="opacity-50">
                        <ChatGroupCard group={group} onClick={() => handleOpenChatPanel(group.id, group.name)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Dashed "New message" footer — personal tab only */}
      {subTab === "my" && (
        <div className="flex-shrink-0 px-3 pb-3 pt-1">
          <button
            onClick={() => setShowCreateChat("my")}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "10px 14px", border: "1px dashed var(--dashed)", borderRadius: "var(--r-callout)",
              background: "transparent", color: "var(--body)", fontFamily: "var(--sans)", fontSize: 13,
              cursor: "pointer", transition: "border-color 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--plum)"; (e.currentTarget as HTMLElement).style.color = "var(--plum)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--dashed)"; (e.currentTarget as HTMLElement).style.color = "var(--body)" }}
          >
            <Plus className="w-3.5 h-3.5 flex-shrink-0" />
            New message
          </button>
        </div>
      )}
      </>
      )}

      {showCreateChat && (
        <CreateChatScreen
          userId={userId}
          userName={userProfile.name}
          ministryId={ministryId}
          groupType={showCreateChat}
          initialCategory={showCreateChat === "church" ? pendingCategory : undefined}
          onClose={() => { setShowCreateChat(null); setPendingCategory(undefined) }}
          onCreated={(group) => {
            const newGroup: ChatGroup = {
              id: group.id,
              name: group.name,
              type: showCreateChat!,
              category: group.category ?? null,
              last_message: null,
              last_sender: null,
              last_message_time: null,
              unread_count: 0,
              archived: false,
            }
            mutate((current) => [newGroup, ...(current ?? [])], { revalidate: false })
            setShowCreateChat(null)
            onOpenChat(group.id, group.name)
          }}
        />
      )}
    </div>
  )
}
