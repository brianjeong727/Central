"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import useSWR, { useSWRConfig } from "swr"
import { Search, ChevronDown, ChevronUp, X, Check, ArrowLeft, Settings, Trash2, Plus, Users, Pencil, User, Forward, Pin } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { createGroup } from "@/app/actions/create-group"
import { deleteGroup } from "@/app/actions/chat"
import { syncSmallGroupFromChatAction } from "@/app/actions/auto-chats"
import { Spinner, EmptyState, AnimateIn, MONO_STYLE } from "../components/shared"
import { MonogramChip, SubpageShell, ContentHeader, ContentActionButton, CentralButton } from "@/components/central"
import { getInitials, formatRelativeTime, replyPreviewLabel } from "../utils"
import type { CreateChatScreenProps, ChatSettingsProps, ChatScreenProps, ChatsTabProps, ChatGroup, GroupMember, Message, Reaction, Profile, Crumb, ProcessedMessage, LinkPreviewData } from "../types"
import { useNavState } from "../nav-state"
import { InsetHairline } from "@/components/central/hairline"
import { fetchChatList } from "../chat-list"
import { MessageRow } from "./message-row"
import { Composer } from "./composer"
import { MODERATION_DEFAULTS, moderateText, scopeApplies } from "@/lib/moderation"
import type { ModerationSettings } from "@/lib/moderation"
import { recordChatOffense } from "@/app/actions/moderation"

export function CreateChatScreen({ userId, userName, ministryId, groupType, onClose, onCreated }: CreateChatScreenProps) {
  const supabase = createClient()
  const [customName, setCustomName] = useState("")
  const [showNameEdit, setShowNameEdit] = useState(false)
  const [search, setSearch] = useState("")
  const [allMembers, setAllMembers] = useState<{ id: string; name: string; graduation_year: number | null; role: string; avatar_url: string | null }[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadMembers() {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, graduation_year, role, avatar_url")
        .eq("ministry_id", ministryId)
        .neq("id", userId)
        .order("name")
      setAllMembers(data ?? [])
    }
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = allMembers.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )
  const selectedMembers = allMembers.filter((m) => selectedIds.has(m.id))

  // Auto-generated name from selected members (first names only, truncated at 3)
  const defaultName = useMemo(() => {
    const firstNames = selectedMembers.map((m) => m.name.split(" ")[0])
    if (firstNames.length === 0) return ""
    if (firstNames.length <= 3) return firstNames.join(", ")
    return `${firstNames.slice(0, 3).join(", ")} +${firstNames.length - 3}`
  }, [selectedMembers])

  // Effective name: custom override if typed, otherwise auto-generated
  const effectiveName = customName.trim() || defaultName

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    const name = effectiveName.trim()
    if (!name) { setError("Please enter a chat name."); return }

    setCreating(true)
    setError(null)

    const { group, error: createErr } = await createGroup({
      name,
      type: groupType,
      memberIds: Array.from(selectedIds),
      createdBy: userId,
    })

    if (createErr || !group) {
      setError(createErr ?? "Failed to create chat.")
      setCreating(false)
      return
    }

    // System message — first thing anyone sees in the chat
    await supabase.from("messages").insert({ group_id: group.id, sender_id: userId, content: `${userName.split(" ")[0]} created this chat`, message_type: "system" })

    onCreated({ id: group.id, name: group.name })
  }

  const isDM = selectedIds.size === 1
  const isGroup = selectedIds.size >= 2
  const noMembers = selectedIds.size === 0

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--cream-panel)] flex flex-col md:bg-black/20 md:backdrop-blur-sm md:items-center md:justify-center">
      <div className="flex flex-col w-full h-full bg-[var(--cream-panel)] md:h-auto md:max-h-[85vh] md:max-w-[500px] md:rounded-2xl md:shadow-2xl md:overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 border-b border-[var(--line)]">
          <div className="flex items-center justify-between px-5 pt-12 pb-3 md:pt-6">
            <button
              onClick={onClose}
              className="size-9 bg-[var(--cream-panel)] border border-[var(--line)] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0 shadow-[0_1px_3px_rgba(19,16,26,0.05)]"
            >
              <X className="w-4 h-4 text-[var(--ink)]" />
            </button>
            <span style={{ fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", fontWeight: 600, color: "var(--muted-text)" }}>
              {groupType === "church" ? "Church Chat" : "New Chat"}
            </span>
          </div>
          <div className="px-5 pb-5">
            <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "32px", fontWeight: 400, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.05, margin: 0 }}>
              {groupType === "church" ? "New Church Chat" : "New Chat"}
            </h1>
            <p style={{ fontSize: "13px", color: "var(--muted-text)", marginTop: "6px" }}>
              {isDM ? `Starting a conversation with ${selectedMembers[0]?.name.split(" ")[0]}.` : "Select people to start a conversation."}
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-xl bg-[var(--plum)]/8 px-4 py-3 text-[13px] text-[var(--plum)] font-medium">
              {error}
            </div>
          )}

          {/* Chat name — adapts to selection state */}
          {noMembers && (
            // No members selected: show traditional name input (needed for church chats)
            <div className="bg-[var(--cream-panel)] rounded-2xl border border-[var(--line)] shadow-[0_1px_3px_rgba(19,16,26,0.04)] px-4 pt-4 pb-4">
              <label className="text-[10px] font-semibold text-[var(--muted-text)] tracking-wider uppercase block mb-2">Chat Name</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={groupType === "church" ? "e.g. Freshman Bible Study" : "e.g. Prayer Group"}
                className="w-full text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none bg-transparent"
                style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "18px", letterSpacing: "-0.01em", lineHeight: "1.4" }}
              />
            </div>
          )}

          {isGroup && (
            // 2+ members: show auto-name with optional edit link
            <div className="bg-[var(--cream-panel)] rounded-2xl border border-[var(--line)] shadow-[0_1px_3px_rgba(19,16,26,0.04)] px-4 pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold text-[var(--muted-text)] tracking-wider uppercase">Chat Name</label>
                <button
                  type="button"
                  onClick={() => { setShowNameEdit((v) => !v); if (!showNameEdit) setCustomName("") }}
                  className="text-[11px] font-semibold text-[var(--muted-text)] hover:text-[var(--plum)] transition-colors"
                >
                  {showNameEdit ? "Use default" : "Edit name"}
                </button>
              </div>
              {showNameEdit ? (
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={defaultName}
                  autoFocus
                  className="w-full text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none bg-transparent"
                  style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "18px", letterSpacing: "-0.01em", lineHeight: "1.4" }}
                />
              ) : (
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "18px", letterSpacing: "-0.01em", lineHeight: "1.4", color: "var(--ink)", margin: 0 }}>
                  {effectiveName}
                </p>
              )}
            </div>
          )}

          {/* Member search */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--muted-text)" }}>Add Members</label>
              {selectedMembers.length > 0 && (
                <span className="text-[12px] text-[var(--plum)] font-semibold">{selectedMembers.length} selected</span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-text)]/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--cream-panel)] text-[13px] placeholder:text-[var(--faint)] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--plum)]/20 border border-[var(--line)] focus:border-[var(--plum)]/30 transition-all shadow-[0_1px_2px_rgba(19,16,26,0.04)]"
              />
            </div>

            {/* Selected chips */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    className="flex items-center gap-1.5 bg-[var(--plum)] text-white px-3 py-1.5 rounded-full text-[12px] font-semibold hover:bg-[var(--plum-2)] transition-colors"
                  >
                    {m.name.split(" ")[0]}
                    <X className="w-3 h-3 opacity-70" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--cream-panel)] overflow-hidden shadow-[0_1px_3px_rgba(19,16,26,0.04)]">
              {filtered.length === 0 ? (
                <p className="text-center text-[13px] text-[var(--muted-text)]/50 py-8">No members found</p>
              ) : (
                filtered.map((member, idx) => {
                  const isSelected = selectedIds.has(member.id)
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleMember(member.id)}
                      className={`flex items-center gap-3 px-4 py-3 transition-all text-left ${
                        idx > 0 ? "border-t border-[#F2EDE8]" : ""
                      } ${isSelected ? "bg-[var(--plum)]/[0.04]" : "hover:bg-[#FAFAF8]"}`}
                    >
                      <MonogramChip
                        initials={getInitials(member.name)}
                        avatarUrl={member.avatar_url}
                        className="w-9 h-9 font-bold text-[11px] shadow-sm"
                        style={{ fontFamily: "var(--font-instrument-serif)" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[var(--ink)]">{member.name}</p>
                        {member.graduation_year && (
                          <p className="text-[11px] text-[var(--muted-text)]">Class of {member.graduation_year}</p>
                        )}
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected ? "bg-[var(--plum)] border-[var(--plum)]" : "border-[#D4CFCF]"
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Create button */}
        <div className="flex-shrink-0 bg-[var(--cream-panel)] border-t border-[var(--line)] px-5 py-4">
          <button
            onClick={handleCreate}
            disabled={creating || !effectiveName.trim()}
            className="w-full bg-[var(--plum)] hover:bg-[var(--plum-2)] disabled:opacity-50 text-white font-bold py-4 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px] tracking-wide"
          >
            {creating ? "Creating…" : isDM ? `Message ${selectedMembers[0]?.name.split(" ")[0]}` : `Create Chat${selectedMembers.length > 0 ? ` · ${selectedMembers.length + 1} members` : ""}`}
          </button>
        </div>

      </div>
    </div>
  )
}

export function ChatSettings({ groupId, groupName, groupType, groupArchived = false, userId, userName, ministryId, ministryName, userRole, onBack, onNameChange, onClose }: ChatSettingsProps) {
  const supabase = createClient()
  const [members, setMembers] = useState<GroupMember[]>([])
  const [displayGroupName, setDisplayGroupName] = useState(groupName)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(groupName)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [searchAdd, setSearchAdd] = useState("")
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([])
  const [muted, setMuted] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<"archive" | "unarchive" | "delete" | null>(null)
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null)
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)
  const [mobileRevealMemberId, setMobileRevealMemberId] = useState<string | null>(null)
  // Portal-safe mount flag for the destructive-action confirm dialog (rendered to
  // document.body so a transformed content-enter ancestor can't trap position:fixed).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isAdminOrLeader = ["admin", "leader", "deacon", "elder"].includes(userRole.toLowerCase())
  const isDM = groupType === "dm"
  const isMy = groupType === "my"
  const isChurch = groupType === "church"
  // The ministry-wide central chat is identified by the naming convention used in
  // auto-chats.ts (`${ministryName} Chat`). It must never be renamed, archived, or
  // deleted — renaming it would silently break the auto-enroll trigger.
  const isCentralChat = isChurch && groupName === `${ministryName} Chat`
  const canManage = (isChurch && isAdminOrLeader) || isMy
  const canLeave = isMy || isDM
  const canArchive = isChurch && isAdminOrLeader && !groupArchived && !isCentralChat
  const canUnarchive = isChurch && isAdminOrLeader && groupArchived
  const canDelete = isChurch && isAdminOrLeader && !isCentralChat

  // SWR-cached settings load — members + this user's mute/pin prefs. Pure fetcher;
  // local state is populated via the effect below so re-opening a chat paints from cache.
  const { data: settingsData, mutate: mutateSettings } = useSWR(
    groupId ? ["group-settings", groupId] : null,
    async () => {
      const [{ data }, { data: prefData }] = await Promise.all([
        supabase
          .from("group_members")
          .select("user_id, profiles!user_id(name, role, graduation_year, avatar_url)")
          .eq("group_id", groupId),
        supabase
          .from("group_members")
          .select("muted, pinned")
          .eq("group_id", groupId)
          .eq("user_id", userId)
          .maybeSingle(),
      ])
      const mapped: GroupMember[] = (data ?? []).map((m: {
        user_id: string
        profiles: { name: string; role: string; graduation_year: number | null; avatar_url: string | null } | { name: string; role: string; graduation_year: number | null; avatar_url: string | null }[] | null
      }) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
        return {
          user_id: m.user_id,
          name: p?.name ?? "Unknown",
          role: p?.role ?? "",
          graduation_year: p?.graduation_year ?? null,
          avatar_url: p?.avatar_url ?? null,
        }
      })
      return { members: mapped, pref: (prefData as { muted: boolean | null; pinned: boolean | null } | null) ?? null }
    }
  )
  const loading = !settingsData

  useEffect(() => {
    if (!settingsData) return
    // Seed locally-editable state from the SWR cache. Autosave keeps DB and local
    // state in lockstep, so there is no separate "saved" snapshot to track.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMembers(settingsData.members)
    setMuted(settingsData.pref?.muted ?? false)
    setPinned(settingsData.pref?.pinned ?? false)
  }, [settingsData])

  async function loadAllProfiles() {
    const existingIds = new Set(members.map((m) => m.user_id))
    const { data } = await supabase
      .from("profiles")
      .select("id, name, role, graduation_year, email, about_me, bible_verse, prayer_request, pray_for_me, avatar_url")
      .eq("ministry_id", ministryId)
      .order("name")
    setAllProfiles((data ?? []).filter((p: Profile) => !existingIds.has(p.id)))
  }

  async function handleRename() {
    if (isCentralChat) { setRenaming(false); return }
    const trimmed = newName.trim()
    if (!trimmed || trimmed === displayGroupName) { setRenaming(false); return }
    setSaving(true)
    const { error: err } = await supabase.from("groups").update({ name: trimmed }).eq("id", groupId).eq("ministry_id", ministryId)
    if (!err) {
      setDisplayGroupName(trimmed)
      onNameChange(trimmed)
      await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `Chat renamed to "${trimmed}"`, message_type: "system" })
    }
    setSaving(false)
    setRenaming(false)
  }

  // ── Autosave: every pref toggle / member change persists immediately
  //    (optimistic update + rollback on failure). No Save/Discard step. ──
  async function handleToggleMuted() {
    const next = !muted
    setMuted(next)
    const { error: err } = await supabase.from("group_members").update({ muted: next }).eq("group_id", groupId).eq("user_id", userId)
    if (err) { setMuted(!next); return }
    mutateSettings((cur) => cur ? { ...cur, pref: { muted: next, pinned: cur.pref?.pinned ?? pinned } } : cur, { revalidate: false })
  }

  async function handleTogglePinned() {
    const next = !pinned
    setPinned(next)
    const { error: err } = await supabase.from("group_members").update({ pinned: next }).eq("group_id", groupId).eq("user_id", userId)
    if (err) { setPinned(!next); return }
    mutateSettings((cur) => cur ? { ...cur, pref: { muted: cur.pref?.muted ?? muted, pinned: next } } : cur, { revalidate: false })
  }

  async function handleRemoveMember(memberId: string) {
    const removed = members.find((m) => m.user_id === memberId)
    const snapshot = members
    setMembers((prev) => prev.filter((m) => m.user_id !== memberId))
    setConfirmRemoveMemberId(null)
    setMobileRevealMemberId(null)
    const { error: err } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", memberId)
    if (err) { setMembers(snapshot); return }
    await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `${userName.split(" ")[0]} removed ${removed?.name.split(" ")[0] ?? "someone"}`, message_type: "system" })
    await syncSmallGroupFromChatAction({ chatGroupId: groupId, addUserIds: [], removeUserIds: [memberId] })
    mutateSettings((cur) => cur ? { ...cur, members: cur.members.filter((m) => m.user_id !== memberId) } : cur, { revalidate: false })
  }

  async function handleAddMembers() {
    if (selectedToAdd.length === 0) return
    const toAdd = allProfiles
      .filter((p) => selectedToAdd.includes(p.id))
      .map((p) => ({ user_id: p.id, name: p.name, role: p.role, graduation_year: p.graduation_year ?? null, avatar_url: p.avatar_url ?? null }))
    if (toAdd.length === 0) return
    setError(null)
    // Optimistic (Convention #4): reflect the new members + return to settings immediately.
    setMembers((prev) => [...prev, ...toAdd])
    setSelectedToAdd([])
    setSearchAdd("")
    setShowAddMembers(false)
    const { error: err } = await supabase.from("group_members").insert(toAdd.map((m) => ({ group_id: groupId, user_id: m.user_id })))
    if (err) {
      setError(err.message)
      setMembers((prev) => prev.filter((m) => !toAdd.some((a) => a.user_id === m.user_id))) // rollback
      return
    }
    // One aggregated system message (not one per person) — each insert fans out over realtime to every member.
    const addedLabel = toAdd.length === 1 ? toAdd[0].name.split(" ")[0] : `${toAdd.length} people`
    await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `${userName.split(" ")[0]} added ${addedLabel}`, message_type: "system" })
    await syncSmallGroupFromChatAction({ chatGroupId: groupId, addUserIds: toAdd.map((m) => m.user_id), removeUserIds: [] })
    mutateSettings()
  }

  async function handleLeave() {
    await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `${userName.split(" ")[0]} left`, message_type: "system" })
    await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId)
    onClose()
  }

  async function handleArchive() {
    const { error: err } = await supabase.from("groups").update({ archived: true }).eq("id", groupId).eq("ministry_id", ministryId)
    if (!err) onClose()
  }

  async function handleUnarchive() {
    const { error: err } = await supabase.from("groups").update({ archived: false }).eq("id", groupId).eq("ministry_id", ministryId)
    if (!err) onClose()
  }

  async function handleDelete() {
    const { error: err } = await deleteGroup(groupId)
    if (!err) onClose()
  }

  const filteredProfiles = allProfiles.filter((p) =>
    p.name.toLowerCase().includes(searchAdd.toLowerCase())
  )
  const typeLabel = isDM ? "Direct message" : isChurch ? "Church chat" : "Group chat"

  // Body-swap + extend-crumbs: a SINGLE SubpageShell renders either the settings
  // body or the add-members body; the trail lengthens rather than nesting a shell.
  const crumbs: Crumb[] = showAddMembers
    ? [{ label: displayGroupName, onClick: onBack }, { label: "Settings", onClick: () => { setShowAddMembers(false); setSearchAdd(""); setSelectedToAdd([]) } }, { label: "Add members" }]
    : [{ label: displayGroupName, onClick: onBack }, { label: "Settings" }]

  function roleBadge(role: string, size: "sm" | "md") {
    const r = role.toLowerCase()
    const isAdminTier = ["admin", "leader", "deacon", "elder"].includes(r)
    const isVisitor = r === "visitor"
    return (
      <span style={{
        fontSize: size === "sm" ? 9 : 11, fontWeight: 600,
        padding: size === "sm" ? "2px 6px" : "3px 10px", borderRadius: 999,
        background: isAdminTier ? "color-mix(in srgb, var(--plum) 8%, transparent)" : isVisitor ? "var(--cream)" : "var(--ivory)",
        color: isAdminTier ? "var(--plum)" : "var(--muted-text)",
        border: isVisitor ? "1px solid var(--line-2)" : "1px solid transparent",
        letterSpacing: "0.04em", textTransform: "uppercase",
      }}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    )
  }

  return (
    <SubpageShell title={showAddMembers ? "Add members" : "Settings"} crumbs={crumbs} width="full">
      {error && (
        <div className="rounded-xl px-4 py-3 mb-4 text-[13px] font-medium" style={{ background: "color-mix(in srgb, var(--plum) 8%, transparent)", color: "var(--plum)" }}>
          {error}
        </div>
      )}

      {showAddMembers ? (
        /* ── Add-members body (body-swap; single shell) ── */
        <div className="md:pt-7">
          {/* Title is owned by SubpageShell ("Add members"); no hand-rolled header (§4.18). */}
          <p className="mb-5" style={{ fontSize: 15, color: "var(--body)" }}>Select people from your ministry to add to this chat.</p>
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted-text)" }} />
            <input
              type="text"
              placeholder="Search members…"
              value={searchAdd}
              onChange={(e) => setSearchAdd(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-xl text-[13px] focus:outline-none border transition-all"
              style={{ background: "var(--cream)", borderColor: "var(--line)", color: "var(--ink)" }}
            />
          </div>
          {filteredProfiles.length === 0 ? (
            <div className="flex items-center justify-center h-24">
              <p className="text-[13px]" style={{ color: "var(--muted-text)" }}>No members to add</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredProfiles.map((profile) => {
                const selected = selectedToAdd.includes(profile.id)
                return (
                  <button
                    key={profile.id}
                    onClick={() => setSelectedToAdd((prev) => selected ? prev.filter((id) => id !== profile.id) : [...prev, profile.id])}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left"
                    style={{ background: selected ? "color-mix(in srgb, var(--plum) 6%, transparent)" : "var(--cream)", borderColor: selected ? "color-mix(in srgb, var(--plum) 20%, transparent)" : "var(--line)" }}
                  >
                    <MonogramChip initials={getInitials(profile.name)} avatarUrl={profile.avatar_url} className="w-9 h-9 font-bold text-[10px]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: "var(--ink)" }}>{profile.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {profile.role && roleBadge(profile.role, "sm")}
                        {profile.graduation_year && <span className="text-[11px]" style={{ color: "var(--muted-text)" }}>Class of {profile.graduation_year}</span>}
                      </div>
                    </div>
                    <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all" style={{ background: selected ? "var(--plum)" : "transparent", borderColor: selected ? "var(--plum)" : "var(--line-2)" }}>
                      {selected && <Check className="w-3 h-3" style={{ color: "var(--cream)" }} />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          {selectedToAdd.length > 0 && (
            <div className="py-4 pb-8 md:pb-5 mt-5" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px]" style={{ color: "var(--body)", margin: 0 }}>
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{selectedToAdd.length}</span> {selectedToAdd.length === 1 ? "person" : "people"} selected
                </p>
                <ContentActionButton label={saving ? "Adding…" : `Add ${selectedToAdd.length} ${selectedToAdd.length === 1 ? "member" : "members"}`} onClick={handleAddMembers} disabled={saving} />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Settings body ── */
        <>
        {/* Mobile (SubpageShell title is desktop-only, so mobile keeps its own header) */}
        <div className="md:hidden">
          <div className="flex items-center gap-4 mb-6" style={{ paddingTop: 4 }}>
            <MonogramChip initials={getInitials(displayGroupName)} className="w-12 h-12 font-bold text-[14px]" />
            <div className="flex-1 min-w-0">
              {renaming ? (
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setRenaming(false); setNewName(displayGroupName) } }}
                  onBlur={handleRename}
                  className="text-[17px] font-bold bg-transparent outline-none border-none w-full"
                  style={{ color: "var(--ink)", borderBottom: "1px solid var(--line-2)", padding: 0 }}
                />
              ) : (
                <div className="group flex items-center gap-1.5" style={{ cursor: canManage && !isCentralChat ? "text" : "default" }} onClick={canManage && !isCentralChat ? () => { setRenaming(true); setNewName(displayGroupName) } : undefined}>
                  <h2 className="text-[17px] font-bold truncate" style={{ color: "var(--ink)" }}>{displayGroupName}</h2>
                  {canManage && !isCentralChat && <Pencil style={{ width: 12, height: 12, color: "var(--muted-text)", flexShrink: 0 }} />}
                </div>
              )}
              <p className="text-[12px] mt-0.5" style={{ color: "var(--muted-text)" }}>{typeLabel} · {members.length} member{members.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "var(--ink)" }}>Members</span>
            {canManage && (
              <button onClick={() => { setShowAddMembers(true); loadAllProfiles() }} className="text-[12px] font-semibold" style={{ color: "var(--plum)" }}>+ Add</button>
            )}
          </div>
          {loading ? <Spinner /> : (
            <div className="flex flex-col gap-1.5 mb-6">
              {members.map((member) => {
                const isConfirming = confirmRemoveMemberId === member.user_id
                const isRevealed = mobileRevealMemberId === member.user_id
                return (
                  <div
                    key={member.user_id}
                    className="rounded-xl border p-3.5 flex items-center gap-3"
                    style={{ background: isConfirming ? "#FDF0F0" : "var(--cream)", borderColor: "var(--line)", transition: "background 0.1s" }}
                    onClick={() => { if (canManage && member.user_id !== userId && !isConfirming) setMobileRevealMemberId((id) => id === member.user_id ? null : member.user_id) }}
                  >
                    <MonogramChip initials={getInitials(member.name)} avatarUrl={member.avatar_url} className="w-9 h-9 font-bold text-[10px]" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[13px] font-semibold truncate" style={{ color: "var(--ink)" }}>{member.name}</p>
                        {member.user_id === userId && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: "color-mix(in srgb, var(--plum) 8%, transparent)", color: "var(--plum)" }}>You</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {member.role && roleBadge(member.role, "sm")}
                        {member.graduation_year && <span className="text-[11px]" style={{ color: "var(--muted-text)" }}>Class of {member.graduation_year}</span>}
                      </div>
                    </div>
                    {canManage && member.user_id !== userId && (
                      isConfirming ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                          <button onClick={(e) => { e.stopPropagation(); handleRemoveMember(member.user_id) }} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--danger)" }}><Check className="w-4 h-4" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setConfirmRemoveMemberId(null) }} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--muted-text)" }}><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmRemoveMemberId(member.user_id); setMobileRevealMemberId(null) }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, color: "var(--muted-text)", opacity: isRevealed ? 1 : 0, transition: "opacity 0.15s", pointerEvents: isRevealed ? "auto" : "none" }}
                        >
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {isChurch && canManage && (
            <p className="mb-6" style={{ fontSize: 11, color: "var(--muted-text)", lineHeight: 1.5 }}>Member changes sync to the small group home page if this chat is linked to a group.</p>
          )}
          {isCentralChat && (
            <p className="text-[12px] mb-6" style={{ color: "var(--muted-text)", lineHeight: 1.5 }}>Your ministry&apos;s main chat. Everyone is automatically a member — it can&apos;t be renamed, archived, or deleted.</p>
          )}
          {(canArchive || canUnarchive || canLeave || canDelete) && (
            <div className="flex flex-col gap-3 pb-4">
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--danger)", margin: 0 }}>Danger zone</p>
              {canArchive && <button onClick={() => setConfirmAction("archive")} className="w-full py-3.5 rounded-xl font-semibold text-[13px] border" style={{ background: "var(--cream)", color: "var(--body)", borderColor: "var(--line)" }}>Archive chat</button>}
              {canUnarchive && <button onClick={() => setConfirmAction("unarchive")} className="w-full py-3.5 rounded-xl font-semibold text-[13px] border" style={{ background: "var(--cream)", color: "var(--body)", borderColor: "var(--line)" }}>Unarchive chat</button>}
              {canLeave && <button onClick={handleLeave} className="w-full py-3.5 rounded-xl font-semibold text-[13px] border" style={{ background: "var(--cream)", color: "var(--body)", borderColor: "var(--line)" }}>Leave chat</button>}
              {canDelete && <button onClick={() => setConfirmAction("delete")} className="w-full py-3.5 rounded-xl font-semibold text-[13px]" style={{ background: "transparent", color: "var(--danger)", border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)" }}>Delete chat</button>}
            </div>
          )}
        </div>

        {/* Desktop */}
        <div className="hidden md:block" style={{ paddingTop: 28 }}>
          {loading ? <Spinner /> : (
            <>
            {/* Hero strip — chat identity + inline rename (page title "Settings" is
                supplied by SubpageShell, so this name stays ≤ PageTitle scale). */}
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 32 }}>
              <MonogramChip initials={getInitials(displayGroupName)} className="w-[52px] h-[52px] font-bold text-[16px]" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 4 }}>{typeLabel}</p>
                {renaming ? (
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setRenaming(false); setNewName(displayGroupName) } }}
                    onBlur={handleRename}
                    style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 25, color: "var(--ink)", lineHeight: 1.1, background: "transparent", border: "none", borderBottom: "1px solid var(--line-2)", outline: "none", padding: 0 }}
                  />
                ) : (
                  <div className="group flex items-center gap-2" style={{ cursor: canManage && !isCentralChat ? "text" : "default" }} onClick={canManage && !isCentralChat ? () => { setRenaming(true); setNewName(displayGroupName) } : undefined}>
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 25, color: "var(--ink)", lineHeight: 1.1 }}>{displayGroupName}</p>
                    {canManage && !isCentralChat && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 13, height: 13, color: "var(--muted-text)", flexShrink: 0, marginTop: 6 }} />}
                  </div>
                )}
                <p style={{ color: "var(--body)", fontSize: 14, marginTop: 6 }}>{members.length} {members.length === 1 ? "member" : "members"}</p>
              </div>
            </div>

            {/* Preferences — autosaved on toggle */}
            <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 12 }}>Preferences</p>
            <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden", marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--line-3)" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 500 }}>Mute notifications</p>
                  <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 2 }}>Stay in the chat. Just stop the buzz.</p>
                </div>
                <div onClick={handleToggleMuted} style={{ width: 38, height: 22, borderRadius: 999, background: muted ? "var(--plum)" : "var(--line)", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" }}>
                  <div style={{ position: "absolute", top: 2, ...(muted ? { right: 2 } : { left: 2 }), width: 18, height: 18, borderRadius: 999, background: "var(--cream)" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", padding: "16px 20px" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 500 }}>Pin to top of chats</p>
                  <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 2 }}>Keeps it above the fold.</p>
                </div>
                <div onClick={handleTogglePinned} style={{ width: 38, height: 22, borderRadius: 999, background: pinned ? "var(--plum)" : "var(--line)", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" }}>
                  <div style={{ position: "absolute", top: 2, ...(pinned ? { right: 2 } : { left: 2 }), width: 18, height: 18, borderRadius: 999, background: "var(--cream)" }} />
                </div>
              </div>
            </div>

            {/* Members — Add lives in the ContentHeader action slot (§3.2) */}
            <div style={{ marginBottom: 12 }}>
              <ContentHeader
                label="Members"
                action={canManage ? (
                  <ContentActionButton variant="ghost" icon={<Plus style={{ width: 14, height: 14 }} />} label="Add members" onClick={() => { setShowAddMembers(true); loadAllProfiles() }} />
                ) : undefined}
              />
            </div>
            <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden" }}>
              {members.map((member, i) => {
                const isConfirming = confirmRemoveMemberId === member.user_id
                const isHovered = hoveredMemberId === member.user_id
                return (
                  <div
                    key={member.user_id}
                    onMouseEnter={() => setHoveredMemberId(member.user_id)}
                    onMouseLeave={() => setHoveredMemberId(null)}
                    style={{ display: "grid", gridTemplateColumns: "40px 1fr auto auto", alignItems: "center", gap: 14, padding: "15px 20px", borderBottom: i < members.length - 1 ? "1px solid var(--line-3)" : "none", background: isConfirming ? "#FDF0F0" : "transparent", transition: "background 0.1s" }}
                  >
                    <MonogramChip initials={getInitials(member.name)} avatarUrl={member.avatar_url} className="w-10 h-10 font-bold text-[11px]" />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <p style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>{member.name}</p>
                        {member.user_id === userId && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--cream)", color: "var(--muted-text)", letterSpacing: "0.06em", textTransform: "uppercase" }}>You</span>}
                      </div>
                      {member.graduation_year && <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 2 }}>Class of {member.graduation_year}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {member.role && roleBadge(member.role, "md")}
                    </div>
                    {canManage && member.user_id !== userId ? (
                      isConfirming ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <button onClick={() => handleRemoveMember(member.user_id)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--danger)" }}><Check style={{ width: 14, height: 14 }} /></button>
                          <button onClick={() => setConfirmRemoveMemberId(null)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--muted-text)" }}><X style={{ width: 14, height: 14 }} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmRemoveMemberId(member.user_id)} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--muted-text)", opacity: isHovered ? 1 : 0, transition: "opacity 0.15s" }}><X style={{ width: 14, height: 14 }} /></button>
                      )
                    ) : <span />}
                  </div>
                )
              })}
            </div>
            {isChurch && canManage && (
              <p style={{ fontSize: 11, color: "var(--muted-text)", marginTop: 10, lineHeight: 1.5 }}>Member changes sync to the small group home page if this chat is linked to a group.</p>
            )}

            {isCentralChat && (
              <p className="text-[12px]" style={{ color: "var(--muted-text)", lineHeight: 1.5, marginTop: 28 }}>Your ministry&apos;s main chat. Everyone is automatically a member — it can&apos;t be renamed, archived, or deleted.</p>
            )}
            {(canArchive || canUnarchive || canLeave || canDelete) && (
              <div style={{ marginTop: 36 }}>
                <p style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--danger)", margin: "0 0 12px" }}>Danger zone</p>
                <div style={{ height: 1, background: "var(--line)", marginBottom: 16 }} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {canArchive && <button onClick={() => setConfirmAction("archive")} style={{ height: 36, padding: "0 18px", background: "transparent", border: "1px solid var(--line)", borderRadius: "var(--r-chip)", color: "var(--body)", fontSize: 14, cursor: "pointer" }}>Archive chat</button>}
                  {canUnarchive && <button onClick={() => setConfirmAction("unarchive")} style={{ height: 36, padding: "0 18px", background: "transparent", border: "1px solid var(--line)", borderRadius: "var(--r-chip)", color: "var(--body)", fontSize: 14, cursor: "pointer" }}>Unarchive chat</button>}
                  {canLeave && <button onClick={handleLeave} style={{ height: 36, padding: "0 18px", background: "transparent", border: "1px solid var(--line)", borderRadius: "var(--r-chip)", color: "var(--body)", fontSize: 14, cursor: "pointer" }}>Leave chat</button>}
                  {canDelete && <button onClick={() => setConfirmAction("delete")} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 18px", background: "transparent", border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", borderRadius: "var(--r-chip)", color: "var(--danger)", fontSize: 14, cursor: "pointer" }}><Trash2 style={{ width: 14, height: 14 }} /> Delete chat</button>}
                </div>
              </div>
            )}
            </>
          )}
        </div>
        </>
      )}

      {/* Destructive-action confirm — top-layer portal (transform-safe), matching
          the team-settings migration's delete dialog. */}
      {mounted && confirmAction && createPortal(
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center animate-backdrop-in"
          style={{ background: "rgba(20,16,26,0.32)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmAction(null) }}
        >
          <div className="animate-dialog-in" style={{ width: 420, maxWidth: "calc(100vw - 32px)", background: "var(--cream)", border: "1px solid var(--line-2)", borderRadius: 18, boxShadow: "0 30px 80px rgba(20,16,26,0.18)", overflow: "hidden" }}>
            <div style={{ padding: "26px 26px 20px" }}>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 8px" }}>{confirmAction === "delete" ? "Danger zone" : "Confirm"}</p>
              <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, fontWeight: 400, color: "var(--ink)", lineHeight: 1.15, margin: "0 0 10px" }}>
                {confirmAction === "archive" ? "Archive this chat?" : confirmAction === "unarchive" ? "Unarchive this chat?" : "Delete this chat?"}
              </h2>
              <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.5, margin: 0 }}>
                {confirmAction === "archive" ? "Members won't be able to send new messages." : confirmAction === "unarchive" ? "Members will be able to send messages again." : "This chat and all its messages will be permanently removed. This can't be undone."}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, padding: "0 26px 24px", justifyContent: "flex-end" }}>
              <CentralButton variant="secondary" size="md" onClick={() => setConfirmAction(null)}>Cancel</CentralButton>
              <CentralButton
                variant={confirmAction === "unarchive" ? "primary" : "danger-solid"}
                size="md"
                onClick={() => { const a = confirmAction; setConfirmAction(null); if (a === "archive") handleArchive(); else if (a === "unarchive") handleUnarchive(); else handleDelete() }}
              >
                {confirmAction === "archive" ? "Archive" : confirmAction === "unarchive" ? "Unarchive" : "Delete"}
              </CentralButton>
            </div>
          </div>
        </div>,
        document.body
      )}
    </SubpageShell>
  )
}

// Shared message select — used by the initial newest-50 load and the load-older
// keyset page so both build identical enriched Message rows.
const MESSAGE_SELECT = "id, group_id, sender_id, content, created_at, reply_to_id, message_type, is_edited, deleted, attachment_url, attachment_type, attachment_name, attachment_size, poll_id, profiles!sender_id(name, avatar_url), reply_to:reply_to_id(id, content, attachment_type, attachment_name, profiles!sender_id(name))"

// Two adjacent messages render as one visual group when they're from the same
// sender within a minute (never for system/poll rows).
const sameMinute = (a: Message, b: Message) =>
  a.message_type !== "system" && b.message_type !== "system" &&
  a.message_type !== "poll" && b.message_type !== "poll" &&
  a.sender_id === b.sender_id &&
  Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 60000

export function ChatScreen({ groupId, groupName, userId, userName, ministryId, ministryName, userRole, onClose, onRead, onNameChange, inline = false }: ChatScreenProps) {
  const supabase = createClient()
  const { mutate: mutateGlobal } = useSWRConfig()

  // Optimistic chat-list patch for the sender's OWN message: move this group to the
  // top, refresh its preview/timestamp to now, never add an unread (the sender is
  // reading it). Patches the SAME shared key the sidebar reads, so the row jumps
  // instantly with no round-trip. The home-app realtime refetch later reconciles
  // from get_chat_list (and re-forces this open group to 0).
  const bumpChatListForOwnSend = useCallback((previewText: string) => {
    mutateGlobal(
      ["chat-list", userId, ministryId],
      (cur: ChatGroup[] | undefined) => {
        if (!cur) return cur
        const idx = cur.findIndex((g) => g.id === groupId)
        if (idx === -1) return cur
        const moved: ChatGroup = {
          ...cur[idx],
          last_message: previewText,
          last_sender: userName,
          last_message_time: new Date().toISOString(),
          unread_count: cur[idx].unread_count, // own send adds no unread
        }
        return [moved, ...cur.filter((g) => g.id !== groupId)]
      },
      { revalidate: false },
    )
  }, [mutateGlobal, userId, ministryId, groupId, userName])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [displayName, setDisplayName] = useState(groupName)
  // Re-seed the header name whenever the groupName prop changes (chat switch through
  // a path that reuses this instance, or the async name backfill in home-app). The
  // rename flow still calls setDisplayName directly; this only mirrors the prop.
  useEffect(() => { setDisplayName(groupName) }, [groupName])
  const [groupType, setGroupType] = useState("")
  const [groupArchived, setGroupArchived] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({})
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null)
  const [fullReactionPickerFor, setFullReactionPickerFor] = useState<string | null>(null)
  const [contextMenuFor, setContextMenuFor] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [editOriginalText, setEditOriginalText] = useState("")
  const [forwardingMsg, setForwardingMsg] = useState<Message | null>(null)
  const [forwardGroups, setForwardGroups] = useState<{ id: string; name: string }[]>([])
  const [forwardSentTo, setForwardSentTo] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; avatarUrl: string | null }>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const profilesCache = useRef<Record<string, string>>({ [userId]: userName })
  const avatarCache = useRef<Record<string, string | null>>({})
  const messagesRef = useRef<Message[]>([])
  const reactionsRef = useRef<Record<string, Reaction[]>>({})
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)
  const [memberReadMap, setMemberReadMap] = useState<Record<string, { name: string; lastReadAt: string | null; avatarUrl: string | null }>>({})
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const myTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchMatchIndex, setSearchMatchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null)
  const [pinnedMessage, setPinnedMessage] = useState<{ id: string; content: string; sender_name: string; attachment_url?: string | null; attachment_type?: string | null; attachment_name?: string | null } | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // SWR-cached group roster — the SINGLE source for @mention names, member count,
  // and (small-room) seed read state. Read-only lookup, pure fetcher. Replaces the
  // old @mention-only join AND the standalone loadMemberReadStates fetch.
  const { data: rosterData } = useSWR(
    groupId ? ["chat-roster", groupId] : null,
    async () => {
      const { data } = await supabase
        .from("group_members")
        .select("user_id, last_read_at, profiles!user_id(name, avatar_url)")
        .eq("group_id", groupId)
      return (data ?? [])
        .map((m: { user_id: string; last_read_at: string | null; profiles: { name: string; avatar_url: string | null } | { name: string; avatar_url: string | null }[] | null }) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          return p ? { id: m.user_id, name: p.name, avatarUrl: p.avatar_url ?? null, lastReadAt: m.last_read_at ?? null } : null
        })
        .filter((m): m is { id: string; name: string; avatarUrl: string | null; lastReadAt: string | null } => m !== null)
    }
  )
  const roster = useMemo(() => rosterData ?? [], [rosterData])
  const rosterLoaded = rosterData !== undefined
  const mentionMembers = useMemo(() => roster.filter(m => m.id !== userId), [roster, userId])
  const memberCount = roster.length
  // Threshold switch (Brian's product decision): rooms ≥30 members drop the live
  // per-member read-receipt fan-out (the O(members²) source) for an on-demand
  // "Seen by N" pill; <30 keep today's live per-member receipts exactly.
  const isLargeRoom = memberCount >= 30
  // Polls
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [pollsData, setPollsData] = useState<Record<string, { question: string; options: string[] }>>({})
  const [pollVotes, setPollVotes] = useState<Record<string, number>>({}) // poll_id → option_index user voted (-1 = none)
  const [pollCounts, setPollCounts] = useState<Record<string, number[]>>({}) // poll_id → counts per option
  const [changingVotePollIds, setChangingVotePollIds] = useState<Set<string>>(new Set())
  const [votingPollId, setVotingPollId] = useState<string | null>(null)
  const [pendingVoteOption, setPendingVoteOption] = useState<number | "unvote" | undefined>(undefined)
  const [pollMenuFor, setPollMenuFor] = useState<string | null>(null)
  const [pollVoters, setPollVoters] = useState<Record<string, { option_index: number; user_id: string; name: string; avatar_url: string | null }[]>>({})
  const [votersPollId, setVotersPollId] = useState<string | null>(null)
  const prevMsgCountRef = useRef(0)
  const suppressScrollRef = useRef(false)
  // Upward (older-message) pagination — keyset cursor is the oldest loaded message.
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [hasMore, setHasMore] = useState(true)
  const loadingOlderRef = useRef(false)
  const lastTypingSentRef = useRef(0)
  // On-demand "Seen by N" (large rooms only): point-in-time, never live.
  const [seenByCount, setSeenByCount] = useState<number | null>(null)
  const [seenByOpen, setSeenByOpen] = useState(false)
  const [seenByList, setSeenByList] = useState<{ name: string; avatarUrl: string | null }[] | null>(null)
  // Departed members — show "left" indicator on their messages.
  // SWR-cached ministry-scoped lookup, pure fetcher; derived to a Set below.
  const { data: departuresData } = useSWR(
    ministryId ? ["ministry-departures", ministryId] : null,
    async () => {
      const { data } = await supabase
        .from("ministry_departures")
        .select("user_id")
        .eq("ministry_id", ministryId)
      return (data ?? []).map((d: { user_id: string }) => d.user_id)
    }
  )
  const departedIds = useMemo(() => new Set(departuresData ?? []), [departuresData])
  // SWR-cached group meta — type/archived/pinned_message_id. Pure fetcher; local
  // state (incl. the pinned-message lookup) is populated via the effect below.
  // pinned_message_id is mutated by pin/unpin handlers, which sync this cache.
  const { data: groupMeta, mutate: mutateGroupMeta } = useSWR(
    groupId ? ["group-meta", groupId] : null,
    async () => {
      const { data } = await supabase
        .from("groups")
        .select("type, archived, pinned_message_id")
        .eq("id", groupId)
        .single()
      return (data as { type: string; archived: boolean | null; pinned_message_id: string | null } | null) ?? null
    }
  )
  // Chat moderation config — ministry-scoped, SWR-cached. Falls back to defaults
  // (disabled) until loaded, so existing chat behavior is preserved.
  const { data: modSettings } = useSWR(
    ministryId ? ["moderation-settings", ministryId] : null,
    async () => {
      const { data } = await supabase.from("ministries").select("moderation_settings").eq("id", ministryId).maybeSingle()
      return { ...MODERATION_DEFAULTS, ...(data?.moderation_settings ?? {}) } as ModerationSettings
    }
  )
  // Room scope context (mirrors the settings' isCentralChat / group-type logic).
  const modIsChurch = groupType === "church"
  const modIsPersonal = groupType === "my" || groupType === "dm"
  const modIsMinistryDefault = modIsChurch && groupName === `${ministryName} Chat`
  // Transient "your message was filtered" banner; auto-dismisses.
  const [moderationWarning, setModerationWarning] = useState<string | null>(null)
  useEffect(() => {
    if (!moderationWarning) return
    const t = setTimeout(() => setModerationWarning(null), 4000)
    return () => clearTimeout(t)
  }, [moderationWarning])

  // Link previews
  const [linkPreviews, setLinkPreviews] = useState<Record<string, LinkPreviewData>>({})

  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase().trim()
    return messages
      .filter(m => !m.deleted && m.content.toLowerCase().includes(q))
      .map(m => m.id)
  }, [messages, searchQuery])

  const isAdminOrLeader = ["admin", "leader", "deacon", "elder"].includes(userRole.toLowerCase())
  const canPin = !groupArchived && (isAdminOrLeader || groupType !== "church")

  // @mention member list is loaded via useSWR above (see rosterData/mentionMembers).
  // The @mention dropdown, GIF picker, and input state now live in <Composer>.

  // Fetch link previews for URLs found in messages
  useEffect(() => {
    const urlRe = /https?:\/\/[^\s<>"']+/gi
    const toFetch: string[] = []
    for (const msg of messages) {
      if (!msg.content || msg.message_type === "system" || msg.message_type === "poll") continue
      const found = msg.content.match(urlRe)
      if (!found) continue
      for (const url of found) {
        if (!linkPreviews[url]) toFetch.push(url)
      }
    }
    if (toFetch.length === 0) return
    // Mark as loading to prevent duplicate fetches
    setLinkPreviews(prev => {
      const next = { ...prev }
      for (const url of toFetch) if (!next[url]) next[url] = { title: null, description: null, image: null, hostname: new URL(url).hostname.replace(/^www\./, ""), url }
      return next
    })
    for (const url of toFetch) {
      fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && !d.error) setLinkPreviews(prev => ({ ...prev, [url]: d })) })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  // Group consecutive vote receipt system messages within 2 minutes into one row
  const processedMessages = useMemo((): ProcessedMessage[] => {
    const result: ProcessedMessage[] = []
    const skip = new Set<string>()
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (skip.has(msg.id)) continue
      const isVoteR = msg.message_type === "system" && / voted for "/.test(msg.content)
      if (!isVoteR) { result.push(msg); continue }
      const group = [msg]
      for (let j = i + 1; j < messages.length; j++) {
        const next = messages[j]
        if (next.message_type === "system" && / voted for "/.test(next.content) &&
            Math.abs(new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) < 120000) {
          group.push(next)
          skip.add(next.id)
        } else break
      }
      const voters = group.map(m => m.content.split(' voted for "')[0])
      result.push({ ...msg, _voteGroup: voters })
    }
    return result
  }, [messages])

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" })
  }, [])

  const scrollToMessage = useCallback((id: string) => {
    messageRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  // Registers each row's root element so search / reply-jump / pinned-banner
  // scrollIntoView keep working. Stable identity — safe for the memoized rows.
  const registerMessageRef = useCallback((id: string, el: HTMLDivElement | null) => {
    messageRefs.current[id] = el
  }, [])

  // Convention #7: < 400ms tap = emoji picker, ≥ 400ms long-press = context menu.
  // Timer + fired flag stay here in ChatScreen; rows call these with their msg.
  const handlePointerDown = useCallback((msg: Message) => {
    if (msg.deleted) return
    longPressFiredRef.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFiredRef.current = true
      longPressTimer.current = null
      setContextMenuFor(msg.id)
    }, 400)
  }, [])

  const handlePointerUp = useCallback((msg: Message) => {
    if (msg.deleted) return
    if (longPressTimer.current !== null) {
      // Timer still pending — this is a short tap
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
      if (msg.attachment_url) {
        // Attachment: short tap opens it (image → lightbox, file → new tab)
        if (msg.attachment_type?.startsWith("image/")) {
          setLightboxUrl(msg.attachment_url)
        } else {
          window.open(msg.attachment_url, "_blank", "noopener,noreferrer")
        }
      } else {
        // Text message: short tap opens the emoji picker
        setEmojiPickerFor((prev) => (prev === msg.id ? null : msg.id))
      }
    }
    // If timer already fired (long press), do nothing here
  }, [])

  const handlePointerCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleDeleteMessage = useCallback(async (msgId: string) => {
    setDeletingId(null)
    setContextMenuFor(null)
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, deleted: true, content: "", attachment_url: null, attachment_type: null, attachment_name: null, attachment_size: null } : m))
    setReactions((prev) => { const next = { ...prev }; delete next[msgId]; return next })
    await supabase.from("messages").update({ deleted: true, content: "", attachment_url: null, attachment_type: null, attachment_name: null, attachment_size: null }).eq("id", msgId).eq("sender_id", userId)
    await supabase.from("message_reactions").delete().eq("message_id", msgId)
  }, [supabase, userId])

  const handleDeletePoll = useCallback(async (msgId: string, pollId: string) => {
    setPollMenuFor(null)
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted: true, poll_id: null } : m))
    // Delete message before poll — messages.poll_id FK prevents deleting poll while message exists
    await supabase.from("poll_votes").delete().eq("poll_id", pollId)
    await supabase.from("messages").delete().eq("id", msgId)
    await supabase.from("polls").delete().eq("id", pollId)
  }, [supabase])

  // Edit state is read through a ref (synced below) so this callback stays
  // referentially stable while the user types in the edit textarea — otherwise
  // every edit keystroke would change onSaveEdit and re-render all rows.
  const editStateRef = useRef({ editText: "", editingId: null as string | null, editOriginalText: "" })
  useEffect(() => {
    editStateRef.current = { editText, editingId, editOriginalText }
  }, [editText, editingId, editOriginalText])

  const handleEditMessage = useCallback(async () => {
    const { editText: currentText, editingId: id, editOriginalText: originalText } = editStateRef.current
    const trimmed = currentText.trim()
    if (!trimmed || !id) return
    setEditingId(null)
    setEditText("")
    setEditOriginalText("")
    if (trimmed === originalText.trim()) return
    suppressScrollRef.current = true
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, content: trimmed, is_edited: true } : m))
    await supabase.from("messages").update({ content: trimmed, is_edited: true, edited_at: new Date().toISOString() }).eq("id", id).eq("sender_id", userId)
  }, [supabase, userId])

  const startEdit = useCallback((msg: Message) => {
    setContextMenuFor(null)
    setEditingId(msg.id)
    setEditText(msg.content)
    setEditOriginalText(msg.content)
  }, [])

  async function handleForward(targetGroupId: string) {
    if (!forwardingMsg) return
    setForwardSentTo(targetGroupId)
    await supabase.from("messages").insert({
      group_id: targetGroupId, sender_id: userId,
      content: forwardingMsg.content, message_type: "forwarded",
      attachment_url: forwardingMsg.attachment_url ?? null,
      attachment_type: forwardingMsg.attachment_type ?? null,
      attachment_name: forwardingMsg.attachment_name ?? null,
      attachment_size: forwardingMsg.attachment_size ?? null,
    })
    setTimeout(() => { setForwardingMsg(null); setForwardSentTo(null) }, 1000)
  }

  const openForwardSheet = useCallback(async (msg: Message) => {
    setForwardingMsg(msg)
    setContextMenuFor(null)
    setForwardSentTo(null)
    const { data } = await supabase.from("group_members").select("group_id, groups!group_id(id, name)").eq("user_id", userId)
    const groups = (data ?? [])
      .map((r: { group_id: string; groups: { id: string; name: string } | { id: string; name: string }[] | null }) => {
        const g = Array.isArray(r.groups) ? r.groups[0] : r.groups
        return g ? { id: g.id, name: g.name } : null
      })
      .filter((g): g is { id: string; name: string } => g !== null && g.id !== groupId)
    setForwardGroups(groups)
  }, [supabase, userId, groupId])

  const handlePin = useCallback(async (msgId: string) => {
    setContextMenuFor(null)
    // Read messages through the ref (kept in sync below) so this callback stays
    // referentially stable — reads are event-time-fresh.
    const msg = messagesRef.current.find(m => m.id === msgId)
    setPinnedMessageId(msgId)
    if (msg) setPinnedMessage({ id: msg.id, content: msg.content, sender_name: msg.sender_name, attachment_url: msg.attachment_url ?? null, attachment_type: msg.attachment_type ?? null, attachment_name: msg.attachment_name ?? null })
    await supabase.from("groups").update({ pinned_message_id: msgId }).eq("id", groupId).eq("ministry_id", ministryId)
    // Keep the SWR group-meta cache in sync so the pinned state survives re-open.
    mutateGroupMeta((cur) => cur ? { ...cur, pinned_message_id: msgId } : cur, { revalidate: false })
  }, [supabase, groupId, ministryId, mutateGroupMeta])

  const handleUnpin = useCallback(async () => {
    setPinnedMessageId(null)
    setPinnedMessage(null)
    await supabase.from("groups").update({ pinned_message_id: null }).eq("id", groupId).eq("ministry_id", ministryId)
    // Keep the SWR group-meta cache in sync so the pinned state survives re-open.
    mutateGroupMeta((cur) => cur ? { ...cur, pinned_message_id: null } : cur, { revalidate: false })
  }, [supabase, groupId, ministryId, mutateGroupMeta])

  // Opens the vote modal for a poll (row-level "Vote" / "Change vote" button).
  const openVoteSheet = useCallback((pollId: string, hasVoted: boolean) => {
    setPollMenuFor(null)
    setPendingVoteOption(undefined)
    if (hasVoted) setChangingVotePollIds(prev => new Set([...prev, pollId]))
    setVotingPollId(pollId)
  }, [])


  // ─── Phase 3 handlers ────────────────────────────────────────────────────

  async function loadPollsData(pollIds: string[]) {
    if (pollIds.length === 0) return
    const [{ data: pollsRows }, { data: votesRows }, { data: allVotesRows }] = await Promise.all([
      supabase.from("polls").select("id, question, options").in("id", pollIds),
      supabase.from("poll_votes").select("poll_id, option_index").in("poll_id", pollIds).eq("user_id", userId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase.from("poll_votes").select("poll_id, option_index, user_id, profiles!user_id(name, avatar_url)").in("poll_id", pollIds) as any,
    ])
    if (pollsRows) {
      const map: Record<string, { question: string; options: string[] }> = {}
      for (const p of pollsRows) map[p.id] = { question: p.question, options: p.options }
      setPollsData(prev => ({ ...prev, ...map }))
    }
    if (votesRows !== null) {
      const map: Record<string, number> = {}
      for (const v of votesRows) map[v.poll_id] = v.option_index
      setPollVotes(prev => {
        const next = { ...prev }
        for (const id of pollIds) {
          if (map[id] !== undefined) next[id] = map[id]
          else delete next[id]
        }
        return next
      })
    }
    if (allVotesRows) {
      const countMap: Record<string, number[]> = {}
      const voterMap: Record<string, { option_index: number; user_id: string; name: string; avatar_url: string | null }[]> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const v of allVotesRows as any[]) {
        if (!countMap[v.poll_id]) countMap[v.poll_id] = []
        while (countMap[v.poll_id].length <= v.option_index) countMap[v.poll_id].push(0)
        countMap[v.poll_id][v.option_index]++
        const p = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles
        if (!voterMap[v.poll_id]) voterMap[v.poll_id] = []
        voterMap[v.poll_id].push({ option_index: v.option_index, user_id: v.user_id, name: (p as { name: string } | null)?.name ?? "Unknown", avatar_url: (p as { avatar_url: string | null } | null)?.avatar_url ?? null })
      }
      setPollCounts(prev => ({ ...prev, ...countMap }))
      setPollVoters(prev => ({ ...prev, ...voterMap }))
    }
  }

  async function handleCreatePoll() {
    if (!pollQuestion.trim()) return
    const opts = pollOptions.filter(o => o.trim())
    if (opts.length < 2) return
    setShowPollCreator(false)

    const { data: pollRow } = await supabase.from("polls").insert({ group_id: groupId, question: pollQuestion.trim(), options: opts, created_by: userId }).select("id").single()
    if (!pollRow) return

    const optimisticId = `optimistic-poll-${Date.now()}`
    const now = new Date().toISOString()
    const optimisticMsg: Message = {
      id: optimisticId, group_id: groupId, sender_id: userId, content: "",
      created_at: now, sender_name: userName, reply_to_id: null,
      reply_to_content: null, reply_to_sender: null, message_type: "poll",
      poll_id: pollRow.id,
    }
    setMessages(prev => [...prev, optimisticMsg])
    setPollsData(prev => ({ ...prev, [pollRow.id]: { question: pollQuestion.trim(), options: opts } }))
    setPollCounts(prev => ({ ...prev, [pollRow.id]: opts.map(() => 0) }))

    const { data } = await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: "", message_type: "poll", poll_id: pollRow.id }).select("id").single()
    if (data) setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.id } : m))

    setPollQuestion("")
    setPollOptions(["", ""])
  }

  async function handleVote(pollId: string, optionIndex: number) {
    setChangingVotePollIds(prev => { const next = new Set(prev); next.delete(pollId); return next })

    const prev = pollVotes[pollId]
    const firstName = userName.split(" ")[0]

    // Clicking current selection → unvote
    if (prev === optionIndex) {
      setPollVotes(pv => { const next = { ...pv }; delete next[pollId]; return next })
      setPollCounts(pc => {
        const counts = [...(pc[pollId] ?? [])]
        counts[optionIndex] = Math.max(0, (counts[optionIndex] ?? 0) - 1)
        return { ...pc, [pollId]: counts }
      })
      setPollVoters(pv => ({ ...pv, [pollId]: (pv[pollId] ?? []).filter(v => v.user_id !== userId) }))
      await supabase.from("poll_votes").delete().eq("poll_id", pollId).eq("user_id", userId)
      await supabase.from("messages").insert({ group_id: groupId, sender_id: null, content: `${firstName} removed their vote`, message_type: "system" })
      loadPollsData([pollId])
      return
    }

    // Optimistic update
    setPollVotes(pv => ({ ...pv, [pollId]: optionIndex }))
    setPollCounts(pc => {
      const counts = [...(pc[pollId] ?? [])]
      const poll = pollsData[pollId]
      if (poll) while (counts.length < poll.options.length) counts.push(0)
      if (prev !== undefined && prev >= 0) counts[prev] = Math.max(0, (counts[prev] ?? 0) - 1)
      counts[optionIndex] = (counts[optionIndex] ?? 0) + 1
      return { ...pc, [pollId]: counts }
    })
    // Optimistic voter update
    setPollVoters(pv => {
      const voters = (pv[pollId] ?? []).filter(v => v.user_id !== userId)
      return { ...pv, [pollId]: [...voters, { option_index: optionIndex, user_id: userId, name: userName, avatar_url: null }] }
    })

    await supabase.from("poll_votes").upsert({ poll_id: pollId, user_id: userId, option_index: optionIndex }, { onConflict: "poll_id,user_id" })

    const optName = pollsData[pollId]?.options[optionIndex]
    if (optName) {
      await supabase.from("messages").insert({
        group_id: groupId, sender_id: null,
        content: `${firstName} voted for "${optName}"`,
        message_type: "system",
      })
    }
    loadPollsData([pollId])
  }

  // GIF send — optimistic insert stays in ChatScreen (owns messages); <Composer>
  // closes the picker itself after calling this. Stable for the memoized child.
  const handleSendGif = useCallback((fullUrl: string) => {
    if (!fullUrl) return
    const optimisticId = `optimistic-gif-${Date.now()}`
    const now = new Date().toISOString()
    const optimisticMsg: Message = {
      id: optimisticId, group_id: groupId, sender_id: userId, content: "",
      created_at: now, sender_name: userName, reply_to_id: null,
      reply_to_content: null, reply_to_sender: null, message_type: "user",
      attachment_url: fullUrl, attachment_type: "image/gif",
    }
    setMessages(prev => [...prev, optimisticMsg])
    supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: "", attachment_url: fullUrl, attachment_type: "image/gif" }).select("id").single()
      .then(({ data }) => { if (data) setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.id } : m)) })
  }, [supabase, groupId, userId, userName])

  // ─────────────────────────────────────────────────────────────────────────

  // Departed members are loaded via useSWR above (see departuresData/departedIds).

  // Populate group type + archived status + pinned message from the SWR group-meta
  // cache. The fetcher is pure; the secondary pinned-message lookup lives here.
  useEffect(() => {
    if (!groupMeta) return
    setGroupType(groupMeta.type)
    setGroupArchived(groupMeta.archived ?? false)
    if (groupMeta.pinned_message_id) {
      setPinnedMessageId(groupMeta.pinned_message_id)
      supabase
        .from("messages")
        .select("id, content, attachment_url, attachment_type, attachment_name, profiles!sender_id(name)")
        .eq("id", groupMeta.pinned_message_id)
        .maybeSingle()
        .then(({ data: pmsg }) => {
          if (pmsg) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = Array.isArray((pmsg as any).profiles) ? (pmsg as any).profiles[0] : (pmsg as any).profiles
            setPinnedMessage({ id: pmsg.id, content: pmsg.content, sender_name: (p as { name: string } | null)?.name ?? "Unknown", attachment_url: (pmsg as { attachment_url?: string | null }).attachment_url ?? null, attachment_type: (pmsg as { attachment_type?: string | null }).attachment_type ?? null, attachment_name: (pmsg as { attachment_name?: string | null }).attachment_name ?? null })
          }
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupMeta])

  // Seed member read state from the shared roster SWR (Part B3 consolidation — no
  // separate fetch). Small rooms (<30) get the live per-member map (self excluded);
  // large rooms leave it empty ({}) — the live receipt path is disabled there.
  useEffect(() => {
    if (!rosterLoaded) return
    if (isLargeRoom) { setMemberReadMap({}); return }
    const map: Record<string, { name: string; lastReadAt: string | null; avatarUrl: string | null }> = {}
    for (const m of roster) {
      if (m.id === userId) continue
      map[m.id] = { name: m.name, lastReadAt: m.lastReadAt, avatarUrl: m.avatarUrl }
    }
    setMemberReadMap(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, rosterLoaded, isLargeRoom, userId])

  // Realtime: update memberReadMap when other members mark messages read.
  // SMALL ROOMS ONLY. In large rooms (≥30) every member subscribing to every
  // member's read update is the O(members²) blow-up — so we never create this
  // channel there. Wait until the roster is known before deciding, and tear the
  // channel down if isLargeRoom flips true after a late roster load.
  useEffect(() => {
    if (!rosterLoaded || isLargeRoom) return
    const channel = supabase
      .channel(`read-receipts-${groupId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const updated = payload.new as { user_id: string; last_read_at: string | null }
          if (updated.user_id === userId) return
          setMemberReadMap((prev) => ({
            ...prev,
            [updated.user_id]: { ...prev[updated.user_id], lastReadAt: updated.last_read_at },
          }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId, rosterLoaded, isLargeRoom])

  // Typing indicator — broadcast channel
  useEffect(() => {
    const channel = supabase.channel(`typing-${groupId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { senderId, name, avatarUrl, isTyping } = payload as { senderId: string; name: string; avatarUrl: string | null; isTyping: boolean }
        if (senderId === userId) return
        if (isTyping) {
          setTypingUsers(prev => ({ ...prev, [senderId]: { name, avatarUrl } }))
          if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId])
          typingTimeoutsRef.current[senderId] = setTimeout(() => {
            setTypingUsers(prev => { const next = { ...prev }; delete next[senderId]; return next })
          }, 3000)
        } else {
          if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId])
          setTypingUsers(prev => { const next = { ...prev }; delete next[senderId]; return next })
        }
      })
      .subscribe()
    typingChannelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      typingChannelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Mark messages as read on open (clears the badge). No unmount fire: the realtime
  // INSERT handler below already advances last_read_at = raw.created_at for every
  // message received while viewing, so live-received messages stay read without an
  // extra write on close (and without every close hitting group_members at scale).
  useEffect(() => {
    const markRead = () =>
      supabase
        .from("group_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .then(() => { if (onRead) onRead() })

    markRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Shared row→Message enrichment (initial load AND load-older). Side effect:
  // populates profilesCache/avatarCache. Otherwise a pure transform.
  const enrichRows = useCallback((rows: unknown[]): Message[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows as any[]).map((m: any) => {
      const isSystem = m.message_type === "system"
      const p = isSystem ? null : (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)
      const name = p?.name ?? (isSystem ? "" : "Unknown")
      const avatarUrl = p?.avatar_url ?? null
      if (m.sender_id) {
        profilesCache.current[m.sender_id] = name
        avatarCache.current[m.sender_id] = avatarUrl
      }

      const replyRaw = m.reply_to ?? null
      const replyProfile = replyRaw?.profiles
        ? (Array.isArray(replyRaw.profiles) ? replyRaw.profiles[0] : replyRaw.profiles)
        : null

      return {
        id: m.id, group_id: m.group_id, sender_id: m.sender_id,
        content: m.content, created_at: m.created_at, sender_name: name,
        sender_avatar_url: avatarUrl,
        reply_to_id: m.reply_to_id ?? null,
        reply_to_content: replyPreviewLabel(replyRaw?.content, replyRaw?.attachment_type, replyRaw?.attachment_name),
        reply_to_sender: (replyProfile as { name: string } | null)?.name ?? null,
        message_type: m.message_type ?? "user",
        is_edited: (m as { is_edited?: boolean }).is_edited ?? false,
        deleted: (m as { deleted?: boolean }).deleted ?? false,
        attachment_url: (m as { attachment_url?: string | null }).attachment_url ?? null,
        attachment_type: (m as { attachment_type?: string | null }).attachment_type ?? null,
        attachment_name: (m as { attachment_name?: string | null }).attachment_name ?? null,
        attachment_size: (m as { attachment_size?: number | null }).attachment_size ?? null,
        poll_id: (m as { poll_id?: string | null }).poll_id ?? null,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Merge a batch of reactions into the existing map (used by load-older).
  const mergeReactionsFor = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0) return
    const { data: rxData } = await supabase
      .from("message_reactions")
      .select("id, message_id, user_id, emoji")
      .in("message_id", messageIds)
    setReactions((prev) => {
      const rxMap: Record<string, Reaction[]> = { ...prev }
      for (const rx of ((rxData ?? []) as Reaction[])) {
        const list = rxMap[rx.message_id] ? [...rxMap[rx.message_id]] : []
        if (!list.find((r) => r.id === rx.id)) list.push(rx)
        rxMap[rx.message_id] = list
      }
      return rxMap
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Initial load = NEWEST 50 (fetched desc, reversed to ascending for render).
  useEffect(() => {
    async function loadMessages() {
      const { data } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(50)

      if (data) {
        const enriched = enrichRows([...data].reverse())
        setMessages(enriched)
        setHasMore(data.length === 50)

        // Load polls for any poll messages
        const pollIds = enriched.filter(m => m.poll_id).map(m => m.poll_id!)
        if (pollIds.length > 0) loadPollsData(pollIds)

        // Load all reactions for these messages in one query
        const messageIds = enriched.map((m) => m.id)
        if (messageIds.length > 0) {
          const { data: rxData } = await supabase
            .from("message_reactions")
            .select("id, message_id, user_id, emoji")
            .in("message_id", messageIds)
          const rxMap: Record<string, Reaction[]> = {}
          for (const rx of ((rxData ?? []) as Reaction[])) {
            if (!rxMap[rx.message_id]) rxMap[rx.message_id] = []
            rxMap[rx.message_id].push(rx)
          }
          setReactions(rxMap)
        }
      }
      setLoading(false)
    }
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Load-older: keyset page on scroll-up. Cursor = oldest loaded message's
  // created_at (.lt). Prepends, preserves scroll position, and pulls the new
  // page's polls + reactions. hasMore=false once a page returns <50 rows.
  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMore) return
    const oldest = messagesRef.current[0]
    if (!oldest) return
    loadingOlderRef.current = true

    const container = scrollContainerRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0
    const prevScrollTop = container?.scrollTop ?? 0

    const { data } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("group_id", groupId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(50)

    if (data && data.length > 0) {
      const enriched = enrichRows([...data].reverse())
      // Suppress the auto-scroll-to-bottom effect: prepending grows the list but
      // the view must stay put (scroll position is restored below).
      suppressScrollRef.current = true
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id))
        const toPrepend = enriched.filter((m) => !existing.has(m.id))
        return [...toPrepend, ...prev]
      })

      const pollIds = enriched.filter(m => m.poll_id).map(m => m.poll_id!)
      if (pollIds.length > 0) loadPollsData(pollIds)
      mergeReactionsFor(enriched.map((m) => m.id))

      if (data.length < 50) setHasMore(false)

      // Restore scroll position after the prepended rows lay out.
      requestAnimationFrame(() => {
        const c = scrollContainerRef.current
        if (c) c.scrollTop = c.scrollHeight - prevScrollHeight + prevScrollTop
      })
    } else {
      setHasMore(false)
    }
    loadingOlderRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, hasMore, enrichRows, mergeReactionsFor])

  // Trigger load-older when the thread is scrolled near the top.
  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop < 120 && hasMore && !loadingOlderRef.current) loadOlder()
  }, [hasMore, loadOlder])

  // Keep messagesRef current so realtime callbacks can look up reply content
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Keep reactionsRef current so handleReact can stay referentially stable
  // (reads are event-time-fresh) without taking `reactions` as a dep.
  useEffect(() => {
    reactionsRef.current = reactions
  }, [reactions])

  // Scroll to bottom after initial load
  useEffect(() => {
    if (!loading) scrollToBottom(false)
  }, [loading, scrollToBottom])

  // Realtime subscription for new messages from others
  useEffect(() => {
    const channel = supabase
      .channel(`group-messages-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const raw = payload.new as { id: string; group_id: string; sender_id: string | null; content: string; created_at: string; reply_to_id: string | null; message_type?: string; attachment_url?: string | null; attachment_type?: string | null; attachment_name?: string | null; attachment_size?: number | null; poll_id?: string | null }

          // System messages: just append directly for everyone
          if (raw.message_type === "system") {
            setMessages((prev) => {
              if (prev.find(m => m.id === raw.id)) return prev
              return [...prev, { id: raw.id, group_id: raw.group_id, sender_id: raw.sender_id, content: raw.content, created_at: raw.created_at, sender_name: "", sender_avatar_url: null, reply_to_id: null, reply_to_content: null, reply_to_sender: null, message_type: "system" }]
            })
            // Reload poll data if someone else voted
            if (raw.content.includes(' voted for "') && raw.sender_id !== userId) {
              const pollIds = messagesRef.current.filter(m => m.poll_id).map(m => m.poll_id!)
              if (pollIds.length > 0) loadPollsData(pollIds)
            }
            return
          }

          // Skip own user messages — handled optimistically
          if (raw.sender_id === userId) return

          let senderName = profilesCache.current[raw.sender_id!]
          if (!senderName) {
            const { data: prof } = await supabase.from("profiles").select("name").eq("id", raw.sender_id).single()
            senderName = prof?.name ?? "Unknown"
            profilesCache.current[raw.sender_id!] = senderName
          }

          // Resolve reply content from local cache or a quick fetch
          let replyToContent: string | null = null
          let replyToSender: string | null = null
          if (raw.reply_to_id) {
            const cached = messagesRef.current.find((m) => m.id === raw.reply_to_id)
            if (cached) {
              replyToContent = replyPreviewLabel(cached.content, cached.attachment_type, cached.attachment_name)
              replyToSender = cached.sender_name
            } else {
              const { data: rMsg } = await supabase
                .from("messages")
                .select("content, attachment_type, attachment_name, profiles!sender_id(name)")
                .eq("id", raw.reply_to_id)
                .single()
              if (rMsg) {
                replyToContent = replyPreviewLabel(rMsg.content, rMsg.attachment_type, rMsg.attachment_name)
                const rp = Array.isArray(rMsg.profiles) ? rMsg.profiles[0] : rMsg.profiles
                replyToSender = (rp as { name: string } | null)?.name ?? null
              }
            }
          }

          const newMsg = {
            ...raw,
            sender_name: senderName,
            sender_avatar_url: raw.sender_id ? (avatarCache.current[raw.sender_id] ?? null) : null,
            reply_to_id: raw.reply_to_id ?? null,
            reply_to_content: replyToContent,
            reply_to_sender: replyToSender,
            message_type: raw.message_type ?? "user",
            attachment_url: raw.attachment_url ?? null,
            attachment_type: raw.attachment_type ?? null,
            attachment_name: raw.attachment_name ?? null,
            attachment_size: raw.attachment_size ?? null,
            poll_id: raw.poll_id ?? null,
          }
          setMessages((prev) => [...prev, newMsg])
          if (raw.poll_id) loadPollsData([raw.poll_id])

          // Keep last_read_at current as messages arrive so the badge is
          // already cleared in the DB by the time the user navigates back.
          supabase
            .from("group_members")
            .update({ last_read_at: raw.created_at })
            .eq("group_id", groupId)
            .eq("user_id", userId)
            .then()
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const next = payload.new as { id: string; deleted?: boolean; content?: string; attachment_url?: string | null; attachment_type?: string | null; attachment_name?: string | null; attachment_size?: number | null; is_edited?: boolean; edited_at?: string | null }
          setMessages((prev) => prev.map((m) => m.id === next.id
            ? { ...m, deleted: next.deleted ?? m.deleted, content: next.content ?? m.content,
                attachment_url: next.attachment_url ?? null, attachment_type: next.attachment_type ?? null,
                attachment_name: next.attachment_name ?? null, attachment_size: next.attachment_size ?? null,
                is_edited: next.is_edited ?? m.is_edited, edited_at: next.edited_at ?? m.edited_at }
            : m))
          if (next.deleted) {
            setReactions((prev) => { const r = { ...prev }; delete r[next.id]; return r })
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Realtime subscription for reaction inserts and deletes
  useEffect(() => {
    const channel = supabase
      .channel(`reactions-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const rx = payload.new as Reaction
          // The channel receives ALL message_reactions (the table has no group_id
          // to filter on), so ignore reactions for messages not currently loaded in
          // THIS chat — otherwise every reaction in every visible chat re-renders us
          // and grows the map with entries for unloaded messages. Reactions for
          // messages loaded later (scroll-up) are fetched fresh by mergeReactionsFor.
          if (!messagesRef.current.some((m) => m.id === rx.message_id)) return
          setReactions((prev) => {
            const list = prev[rx.message_id] ?? []
            // Replace optimistic temp entry if present, otherwise append
            const tempIdx = list.findIndex(
              (r) => r.user_id === rx.user_id && r.emoji === rx.emoji && r.id.startsWith("temp-")
            )
            if (tempIdx >= 0) {
              const updated = [...list]
              updated[tempIdx] = rx
              return { ...prev, [rx.message_id]: updated }
            }
            if (list.find((r) => r.id === rx.id)) return prev
            return { ...prev, [rx.message_id]: [...list, rx] }
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const rx = payload.old as Reaction
          if (!rx.message_id) return
          // Same scoping as the INSERT handler: skip reactions for messages not
          // loaded here (avoids re-renders + empty map entries for other chats).
          if (!messagesRef.current.some((m) => m.id === rx.message_id)) return
          setReactions((prev) => ({
            ...prev,
            [rx.message_id]: (prev[rx.message_id] ?? []).filter((r) => r.id !== rx.id),
          }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Auto-scroll only when messages are added, not on deletions/edits
  useEffect(() => {
    if (!searchMode && !suppressScrollRef.current && messages.length > prevMsgCountRef.current) scrollToBottom()
    suppressScrollRef.current = false
    prevMsgCountRef.current = messages.length
  }, [messages, scrollToBottom, searchMode])

  // Scroll to the current search match
  useEffect(() => {
    if (searchMatches.length === 0) return
    const matchId = searchMatches[searchMatchIndex]
    if (matchId) messageRefs.current[matchId]?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [searchMatchIndex, searchMatches])

  // Throttled typing broadcast — the realtime channel lives here in ChatScreen;
  // <Composer> calls this on every input change. Stable for the memoized child.
  const onTyping = useCallback((val: string) => {
    if (typingChannelRef.current && val.trim()) {
      // Throttle the isTyping:true SEND to at most ~1/sec while held — every keystroke
      // firing a broadcast is needless fan-out at scale. The 2500ms stop-typing reset
      // timer still refreshes on every keystroke.
      if (Date.now() - lastTypingSentRef.current >= 1000) {
        lastTypingSentRef.current = Date.now()
        typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: true } })
      }
      if (myTypingTimeoutRef.current) clearTimeout(myTypingTimeoutRef.current)
      myTypingTimeoutRef.current = setTimeout(() => {
        typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: false } })
      }, 2500)
    }
  }, [userId, userName])

  const onClearReply = useCallback(() => setReplyingTo(null), [])
  const onSetPollOpen = useCallback((open: boolean) => setShowPollCreator(open), [])

  // Optimistic send (Convention #4) stays here — <Composer> clears its own input +
  // attachment locally, then hands { content, attachment, replyTo } up. Stable for
  // the memoized child: reads everything from the payload + refs/stable deps.
  const handleSend = useCallback(async ({ content, attachment, replyTo }: { content: string; attachment: File | null; replyTo: Message | null }) => {
    if (!content && !attachment) return

    // Moderation gate — runs before anything is sent. When enabled AND in-scope
    // for this room, flag words per the ministry's rules. On a flag: record an
    // offense (fire-and-forget), surface the warning banner, and either block the
    // send (block mode) or substitute the softened/censored text.
    const applyModeration = (raw: string): { text: string; blocked: boolean } => {
      if (
        modSettings?.enabled && raw.trim() &&
        scopeApplies(modSettings.scope, { isChurch: modIsChurch, isPersonal: modIsPersonal, isMinistryDefault: modIsMinistryDefault })
      ) {
        const { cleaned, flaggedCount } = moderateText(raw, { strictness: modSettings.strictness, behavior: modSettings.behavior })
        if (flaggedCount > 0) {
          void recordChatOffense(groupId, raw)
          setModerationWarning("Your message was filtered for language against ministry guidelines. Repeated flags are reported to admins.")
          if (modSettings.behavior === "block") return { text: raw, blocked: true }
          return { text: cleaned, blocked: false }
        }
      }
      return { text: raw, blocked: false }
    }
    const contentMod = content ? applyModeration(content) : { text: "", blocked: false }
    // Text-only + block mode → refuse to send outright.
    if (!attachment && contentMod.blocked) return

    // Clear own typing status
    if (myTypingTimeoutRef.current) clearTimeout(myTypingTimeoutRef.current)
    typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: false } })

    setSending(true)
    const replyTarget = replyTo
    setReplyingTo(null)

    // Attachment message — no caption embedded; caption sent as separate message below
    if (attachment) {
      setUploading(true)
      const ext = attachment.name.split(".").pop() ?? "bin"
      const path = `${groupId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data: storageData, error } = await supabase.storage
        .from("chat-attachments")
        .upload(path, attachment, { cacheControl: "3600", upsert: false })
      if (!error && storageData) {
        const { data: { publicUrl } } = supabase.storage.from("chat-attachments").getPublicUrl(path)
        const optimisticId = `optimistic-att-${Date.now()}`
        const optimisticMsg: Message = {
          id: optimisticId, group_id: groupId, sender_id: userId,
          content: "", created_at: new Date().toISOString(), sender_name: userName,
          reply_to_id: replyTarget?.id ?? null, reply_to_content: replyTarget ? replyPreviewLabel(replyTarget.content, replyTarget.attachment_type, replyTarget.attachment_name) : null,
          reply_to_sender: replyTarget?.sender_name ?? null,
          message_type: "user", attachment_url: publicUrl,
          attachment_type: attachment.type, attachment_name: attachment.name, attachment_size: attachment.size,
        }
        // Block mode on a flagged caption → send the attachment with NO caption.
        const captionText = contentMod.blocked ? "" : contentMod.text
        setMessages(prev => [...prev, optimisticMsg])
        bumpChatListForOwnSend(captionText || attachment.name)
        const { data } = await supabase.from("messages").insert({
          group_id: groupId, sender_id: userId, content: "",
          reply_to_id: replyTarget?.id ?? null,
          attachment_url: publicUrl, attachment_type: attachment.type,
          attachment_name: attachment.name, attachment_size: attachment.size,
        }).select("id").single()
        if (data) setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.id } : m))

        // Send caption as a separate plain text message immediately after
        if (captionText) {
          const captionOptimisticId = `optimistic-cap-${Date.now()}`
          const captionMsg: Message = {
            id: captionOptimisticId, group_id: groupId, sender_id: userId,
            content: captionText, created_at: new Date().toISOString(), sender_name: userName,
            reply_to_id: null, reply_to_content: null, reply_to_sender: null,
            message_type: "user", attachment_url: null,
            attachment_type: null, attachment_name: null, attachment_size: null,
          }
          setMessages(prev => [...prev, captionMsg])
          const { data: capData } = await supabase.from("messages").insert({
            group_id: groupId, sender_id: userId, content: captionText,
          }).select("id").single()
          if (capData) setMessages(prev => prev.map(m => m.id === captionOptimisticId ? { ...m, id: capData.id } : m))
        }
      }
      setUploading(false)
      setSending(false)
      return
    }

    // Text-only message — send the moderated text (softened/censored, or the
    // original when nothing was flagged; block mode already returned above).
    const sendText = contentMod.text
    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: Message = {
      id: optimisticId, group_id: groupId, sender_id: userId, content: sendText,
      created_at: new Date().toISOString(), sender_name: userName,
      reply_to_id: replyTarget?.id ?? null,
      reply_to_content: replyTarget ? replyPreviewLabel(replyTarget.content, replyTarget.attachment_type, replyTarget.attachment_name) : null,
      reply_to_sender: replyTarget?.sender_name ?? null,
    }
    setMessages((prev) => [...prev, optimisticMsg])
    bumpChatListForOwnSend(sendText)

    const { data, error } = await supabase
      .from("messages")
      .insert({ group_id: groupId, sender_id: userId, content: sendText, reply_to_id: replyTarget?.id ?? null })
      .select("id")
      .single()

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
    } else if (data) {
      setMessages((prev) => prev.map((m) => m.id === optimisticId ? { ...m, id: data.id } : m))
    }
    setSending(false)
  }, [supabase, groupId, userId, userName, bumpChatListForOwnSend, modSettings, modIsChurch, modIsPersonal, modIsMinistryDefault])

  // For each own message: which other members have it as their most-recently-read own message.
  // Reuses the PRIOR array reference for any message whose receipts didn't change, so
  // memoized own-message rows don't re-render when an unrelated message/read event
  // rebuilds the map.
  const prevReadReceiptMapRef = useRef<Record<string, { name: string; avatarUrl: string | null }[]>>({})
  const readReceiptMap = useMemo(() => {
    const map: Record<string, { name: string; avatarUrl: string | null }[]> = {}
    // Large rooms don't do live per-member receipts — skip the members×messages walk.
    if (!isLargeRoom) {
      const ownMsgs = messages.filter((m) => m.sender_id === userId)
      if (ownMsgs.length > 0) {
        for (const { name, lastReadAt, avatarUrl } of Object.values(memberReadMap)) {
          if (!lastReadAt) continue
          let target: Message | null = null
          for (const m of ownMsgs) {
            if (m.created_at <= lastReadAt) target = m
            else break
          }
          if (target) {
            if (!map[target.id]) map[target.id] = []
            map[target.id].push({ name, avatarUrl })
          }
        }
      }
    }
    // Reconcile against the previous map: reuse the old array ref when the
    // receipts for a message are unchanged (cheap signature comparison).
    const prev = prevReadReceiptMapRef.current
    const signature = (arr: { name: string; avatarUrl: string | null }[]) =>
      arr.map((r) => r.name + " " + (r.avatarUrl ?? "")).join("")
    for (const id of Object.keys(map)) {
      const prevArr = prev[id]
      if (prevArr && signature(prevArr) === signature(map[id])) map[id] = prevArr
    }
    prevReadReceiptMapRef.current = map
    return map
  }, [messages, memberReadMap, userId, isLargeRoom])

  // Large-room "Seen by N": the user's own most-recent (non-system) message.
  const latestOwnMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === userId && messages[i].message_type !== "system") return messages[i]
    }
    return null
  }, [messages, userId])

  // Fetch the aggregate count ONCE per latest-own-message (large rooms only). A new
  // own message → new id → refetch. Point-in-time; never auto-refreshed live.
  useEffect(() => {
    if (!isLargeRoom || !latestOwnMsg) { setSeenByCount(null); return }
    setSeenByOpen(false)
    setSeenByList(null)
    let cancelled = false
    supabase
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .neq("user_id", userId)
      .gte("last_read_at", latestOwnMsg.created_at)
      .then(({ count }) => { if (!cancelled) setSeenByCount(count ?? 0) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLargeRoom, latestOwnMsg?.id, groupId, userId])

  // Expand/collapse the reader list — fetched on demand the first time it's opened.
  // Passed only to the latest-own row (others receive undefined), so its changing
  // identity never breaks the memo for the rest of the list.
  const toggleSeenBy = useCallback(async () => {
    if (!latestOwnMsg) return
    if (seenByOpen) { setSeenByOpen(false); return }
    setSeenByOpen(true)
    if (seenByList === null) {
      const { data } = await supabase
        .from("group_members")
        .select("user_id, last_read_at, profiles!user_id(name, avatar_url)")
        .eq("group_id", groupId)
        .neq("user_id", userId)
        .gte("last_read_at", latestOwnMsg.created_at)
        .order("last_read_at", { ascending: false })
        .limit(50)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = (data ?? []).map((m: any) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
        return { name: (p as { name: string } | null)?.name ?? "?", avatarUrl: (p as { avatar_url: string | null } | null)?.avatar_url ?? null }
      })
      setSeenByList(list)
    }
  }, [latestOwnMsg, seenByOpen, seenByList, supabase, groupId, userId])

  function openSearch() {
    setSearchMode(true)
    setSearchQuery("")
    setSearchMatchIndex(0)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  function closeSearch() {
    setSearchMode(false)
    setSearchQuery("")
    setSearchMatchIndex(0)
  }

  function goToNextMatch() {
    if (searchMatches.length === 0) return
    setSearchMatchIndex(i => (i + 1) % searchMatches.length)
  }

  function goToPrevMatch() {
    if (searchMatches.length === 0) return
    setSearchMatchIndex(i => (i - 1 + searchMatches.length) % searchMatches.length)
  }

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    setEmojiPickerFor(null)
    // Read reactions through the ref (synced above) so this callback stays
    // referentially stable — reads are event-time-fresh.
    const existing = (reactionsRef.current[messageId] ?? []).find(
      (r) => r.user_id === userId && r.emoji === emoji
    )
    if (existing) {
      // Optimistic remove
      setReactions((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).filter((r) => r.id !== existing.id),
      }))
      await supabase.from("message_reactions").delete().eq("id", existing.id)
    } else {
      // Optimistic add
      const tempId = `temp-${Date.now()}`
      setReactions((prev) => ({
        ...prev,
        [messageId]: [
          ...(prev[messageId] ?? []),
          { id: tempId, message_id: messageId, user_id: userId, emoji },
        ],
      }))
      const { data } = await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: userId, emoji })
        .select("id")
        .single()
      if (data) {
        setReactions((prev) => ({
          ...prev,
          [messageId]: (prev[messageId] ?? []).map((r) =>
            r.id === tempId ? { ...r, id: data.id } : r
          ),
        }))
      }
    }
  }, [supabase, userId])

  // O(1) per-row search-match lookup for the memoized rows.
  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches])

  // Per-message resolved link preview — each row receives ONE object (or
  // undefined) instead of the whole linkPreviews map, so an unrelated preview
  // resolving doesn't re-render every row.
  const previewByMsgId = useMemo(() => {
    const map: Record<string, LinkPreviewData | undefined> = {}
    for (const msg of processedMessages) {
      if (!msg.content || msg.message_type === "system" || msg.message_type === "poll") continue
      const urls = msg.content.match(/https?:\/\/[^\s<>"']+/gi) ?? []
      const preview = urls.map((u) => linkPreviews[u]).find((p) => p && p.title)
      if (preview) map[msg.id] = preview
    }
    return map
  }, [processedMessages, linkPreviews])

  // Header member summary — derived from the roster SWR (not memberReadMap, which is
  // empty in large rooms). Self first, then everyone else, to match prior ordering.
  const memberFirstNames = useMemo(() => {
    const self = roster.filter(m => m.id === userId).map(m => m.name.split(" ")[0])
    const others = roster.filter(m => m.id !== userId).map(m => m.name.split(" ")[0])
    return [...self, ...others]
  }, [roster, userId])

  // Settings is now an in-content subpage (SubpageShell), not a portal sibling.
  // Early-return it so it REPLACES the chat in the same slot: on desktop it fills
  // the inline content area (shell breadcrumb is the back); off desktop the chat is
  // a full-screen overlay, so the settings inherit the same fixed frame (mobile
  // back row comes from SubpageShell). onClose closes the whole chat unchanged.
  if (showSettings) {
    const settingsEl = (
      <ChatSettings
        groupId={groupId}
        groupName={displayName}
        groupType={groupType}
        groupArchived={groupArchived}
        userId={userId}
        userName={userName}
        ministryId={ministryId}
        ministryName={ministryName}
        userRole={userRole}
        onBack={() => setShowSettings(false)}
        onNameChange={(name) => { setDisplayName(name); onNameChange?.(name) }}
        onClose={() => { setShowSettings(false); onClose() }}
      />
    )
    return inline ? settingsEl : (
      <div className="fixed inset-0 z-[110] overflow-y-auto pt-12 md:pt-0 md:left-[var(--shell-offset)]" style={{ background: "var(--cream)" }}>
        {settingsEl}
      </div>
    )
  }

  return (
    <>
    <AnimateIn animate={!inline} className={inline ? "flex flex-col h-full bg-[var(--cream)] w-full" : "fixed inset-0 z-[100] bg-[var(--cream-panel)] flex flex-col md:left-[var(--shell-offset)]"}>
    <div className={inline ? "w-full h-full flex flex-col" : "max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none"}>

      {/* ── Top bar ── */}
      <div className={`flex-shrink-0 flex items-center gap-3 px-4 md:px-6 ${inline ? "py-3 md:pt-5 md:pb-3" : "pt-12 pb-3 md:py-3.5 border-b border-[var(--line)]"} bg-[var(--cream)]`}>
        {searchMode ? (
          <>
            {/* Search bar mode */}
            <button
              onClick={closeSearch}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}
            >
              <X size={14} />
            </button>
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchMatchIndex(0) }}
              onKeyDown={e => {
                if (e.key === "Escape") closeSearch()
                else if (e.key === "Enter") { e.preventDefault(); goToNextMatch() }
                else if (e.key === "ArrowDown") { e.preventDefault(); goToNextMatch() }
                else if (e.key === "ArrowUp") { e.preventDefault(); goToPrevMatch() }
              }}
              placeholder="Search messages…"
              className="flex-1 bg-transparent outline-none text-[14px] text-[var(--ink)] placeholder:text-[var(--faint)] min-w-0"
            />
            {searchQuery.trim() && (
              <span style={{ fontSize: "12px", color: "var(--muted-text)", whiteSpace: "nowrap", flexShrink: 0 }}>
                {searchMatches.length === 0 ? "No results" : `${searchMatchIndex + 1} / ${searchMatches.length}`}
              </span>
            )}
            {searchMatches.length > 0 && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={goToPrevMatch} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                  <ChevronUp size={12} />
                </button>
                <button onClick={goToNextMatch} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                  <ChevronDown size={12} />
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {!inline && (
              <button
                onClick={onClose}
                className="flex-shrink-0 -ml-1 p-1 hover:bg-[#F2EDE0] rounded-lg transition-colors md:hidden"
              >
                <ArrowLeft className="w-5 h-5 text-[var(--ink)]" />
              </button>
            )}
            {/* Group avatar */}
            <MonogramChip
              initials={getInitials(displayName)}
              className="w-8 h-8"
              style={{ fontFamily: "var(--serif)", fontSize: 13 }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate leading-none" style={{ fontFamily: "var(--serif)", fontSize: "16px", color: "var(--ink)", letterSpacing: "-0.01em" }}>{displayName}</h2>
                <div className="hidden md:flex items-center flex-shrink-0">
                  {memberFirstNames.slice(0, 4).map((name, i) => (
                    <span
                      key={i}
                      style={{
                        width: 16, height: 16, borderRadius: 99,
                        background: "var(--plum)",
                        color: "var(--cream-panel)", fontSize: 9, fontWeight: 600,
                        display: "inline-grid", placeItems: "center",
                        marginLeft: i ? -4 : 0,
                        border: "1.5px solid var(--cream-panel)",
                        flexShrink: 0,
                      }}
                    >{name.charAt(0).toUpperCase()}</span>
                  ))}
                </div>
                <p className="hidden md:block text-[12px] text-[var(--muted-text)] truncate">
                  {memberCount} member{memberCount !== 1 ? "s" : ""} · {memberFirstNames.slice(0, 8).join(", ")}
                </p>
              </div>
              <p className="md:hidden text-[12px] text-[var(--muted-text)] mt-0.5">
                {memberCount} member{memberCount !== 1 ? "s" : ""}
              </p>
            </div>
            {/* Desktop action buttons — Search + User only */}
            <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
              <button onClick={openSearch} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <Search size={14} />
              </button>
              <button onClick={() => setShowSettings(true)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <User size={14} />
              </button>
            </div>
            {/* Mobile: search + settings */}
            <div className="flex items-center gap-1 flex-shrink-0 md:hidden">
              <button onClick={openSearch} className="p-1.5 hover:bg-[#F2EDE0] rounded-lg transition-colors">
                <Search className="w-4 h-4 text-[var(--muted-text)]" />
              </button>
              <button onClick={() => setShowSettings(true)} className="p-1 hover:bg-[#F2EDE0] rounded-lg transition-colors">
                <Settings className="w-5 h-5 text-[var(--muted-text)]" />
              </button>
            </div>
          </>
        )}
      </div>
      {inline && <div className="hidden md:block"><InsetHairline style={{ margin: "0 16px" }} /></div>}

      {/* ── Pinned message banner ── */}
      {pinnedMessage && (
        <div
          className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--cream-2)] px-4 py-2 flex items-center gap-2.5 cursor-pointer"
          onClick={() => scrollToMessage(pinnedMessage.id)}
        >
          <Pin className="w-3.5 h-3.5 text-[var(--plum)] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-[var(--plum)]">{pinnedMessage.sender_name}</p>
            <p className="text-[12px] text-[var(--body)] truncate">
              {replyPreviewLabel(pinnedMessage.content, pinnedMessage.attachment_type, pinnedMessage.attachment_name)}
            </p>
          </div>
          {canPin && (
            <button
              onClick={(e) => { e.stopPropagation(); handleUnpin() }}
              className="flex-shrink-0 p-1 text-[var(--faint)] hover:text-[var(--body)] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ── Messages area ── */}
      <div ref={scrollContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
        {loading ? (
          <Spinner />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-[14px] font-semibold text-[var(--ink)]/40">No messages yet</p>
              <p className="text-[12px] text-[var(--muted-text)]/40 mt-1">Say hello! 👋</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {processedMessages.map((msg, i) => {
              // Cheap neighbor-derivations only — all row rendering lives in the
              // memoized <MessageRow/> (app/home/tabs/message-row.tsx).
              const isOwn = msg.sender_id === userId
              const prevMsg = i > 0 ? processedMessages[i - 1] : null
              const nextMsg = i < processedMessages.length - 1 ? processedMessages[i + 1] : null
              const isFirstInGroup = !prevMsg || !sameMinute(msg, prevMsg)
              const isLastInGroup = !nextMsg || !sameMinute(msg, nextMsg)
              const showDateSep = !prevMsg || new Date(prevMsg.created_at).toDateString() !== new Date(msg.created_at).toDateString()
              const isLatestOwn = latestOwnMsg?.id === msg.id
              return (
                <MessageRow
                  key={msg.id}
                  msg={msg}
                  isOwn={isOwn}
                  isFirstMessage={i === 0}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                  showDateSep={showDateSep}
                  showGroupGap={isFirstInGroup && i > 0 && !showDateSep}
                  senderDeparted={!!(msg.sender_id && departedIds.has(msg.sender_id))}
                  userId={userId}
                  canPin={canPin}
                  isAdminOrLeader={isAdminOrLeader}
                  isEmojiPickerOpen={emojiPickerFor === msg.id}
                  isFullPickerOpen={fullReactionPickerFor === msg.id}
                  isContextMenuOpen={contextMenuFor === msg.id}
                  isDeleting={deletingId === msg.id}
                  isEditing={editingId === msg.id}
                  isPollMenuOpen={pollMenuFor === msg.id}
                  isPinned={pinnedMessageId === msg.id}
                  editText={editingId === msg.id ? editText : undefined}
                  highlightQuery={searchMode && searchQuery.trim() && searchMatchSet.has(msg.id) ? searchQuery : undefined}
                  isActiveSearchMatch={searchMatches[searchMatchIndex] === msg.id}
                  reactions={reactions[msg.id]}
                  linkPreview={previewByMsgId[msg.id]}
                  readReceipts={readReceiptMap[msg.id]}
                  poll={msg.poll_id ? pollsData[msg.poll_id] : undefined}
                  pollUserVote={msg.poll_id ? pollVotes[msg.poll_id] : undefined}
                  pollCounts={msg.poll_id ? pollCounts[msg.poll_id] : undefined}
                  isChangingVote={msg.poll_id ? changingVotePollIds.has(msg.poll_id) : false}
                  isLargeRoom={isLargeRoom}
                  isLatestOwn={isLatestOwn}
                  seenByCount={isLatestOwn ? seenByCount : null}
                  seenByOpen={isLatestOwn ? seenByOpen : false}
                  seenByList={isLatestOwn ? seenByList : null}
                  onToggleSeenBy={isLatestOwn ? toggleSeenBy : undefined}
                  registerMessageRef={registerMessageRef}
                  onPointerDown={handlePointerDown}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onReact={handleReact}
                  onDeleteMessage={handleDeleteMessage}
                  onDeletePoll={handleDeletePoll}
                  onSaveEdit={handleEditMessage}
                  onStartEdit={startEdit}
                  onForward={openForwardSheet}
                  onPin={handlePin}
                  onUnpin={handleUnpin}
                  onScrollToMessage={scrollToMessage}
                  onOpenVoteSheet={openVoteSheet}
                  setEmojiPickerFor={setEmojiPickerFor}
                  setFullReactionPickerFor={setFullReactionPickerFor}
                  setContextMenuFor={setContextMenuFor}
                  setDeletingId={setDeletingId}
                  setEditingId={setEditingId}
                  setEditText={setEditText}
                  setReplyingTo={setReplyingTo}
                  setPollMenuFor={setPollMenuFor}
                />
              )
            })}

            {/* Typing indicators */}
            {Object.entries(typingUsers).slice(0, 3).map(([uid, { name, avatarUrl }]) => (
              <div key={uid} className="flex items-center gap-2 mt-3">
                <MonogramChip initials={name.charAt(0).toUpperCase()} avatarUrl={avatarUrl || undefined} className="w-7 h-7 text-[11px] font-bold" />
                <div className="bg-[var(--cream-panel)] border border-[var(--line)] rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
                <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "12px", color: "var(--muted-text)" }}>{name} is typing…</span>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {moderationWarning && (
        <div className="flex-shrink-0 mx-4 mb-2 rounded-xl bg-[var(--plum)]/8 px-4 py-2.5 text-[13px] text-[var(--plum)] font-medium">
          {moderationWarning}
        </div>
      )}

      <Composer
        groupArchived={groupArchived}
        displayName={displayName}
        mentionMembers={mentionMembers}
        replyingTo={replyingTo}
        sending={sending}
        uploading={uploading}
        pollActive={showPollCreator}
        onSend={handleSend}
        onSendGif={handleSendGif}
        onTyping={onTyping}
        onClearReply={onClearReply}
        onSetPollOpen={onSetPollOpen}
      />

      {/* Overlay to dismiss message-row emoji / context menu / poll menu. The
          composer's own GIF + emoji pickers render their dismiss overlay in <Composer>. */}
      {(emojiPickerFor || contextMenuFor || fullReactionPickerFor || pollMenuFor) && (
        <div
          className="fixed inset-0 z-[155] md:left-[var(--shell-offset)]"
          onPointerDown={() => { setEmojiPickerFor(null); setContextMenuFor(null); setFullReactionPickerFor(null); setPollMenuFor(null) }}
        />
      )}

      {/* Vote modal */}
      {votingPollId && (() => {
        const vPoll = pollsData[votingPollId]
        const vUserVote = pollVotes[votingPollId]
        const vCounts = pollCounts[votingPollId] ?? []
        const vTotal = vCounts.reduce((s, c) => s + c, 0)
        const vVoters = pollVoters[votingPollId] ?? []
        const closeFn = () => { setVotingPollId(null); setPendingVoteOption(undefined); setChangingVotePollIds(prev => { const n = new Set(prev); n.delete(votingPollId); return n }) }
        // displaySelection: what the user currently has highlighted in the modal (before confirming)
        const displaySelection: number | undefined = pendingVoteOption === "unvote" ? undefined : pendingVoteOption !== undefined ? pendingVoteOption : vUserVote
        const hasPending = pendingVoteOption !== undefined
        const confirmLabel = pendingVoteOption === "unvote" ? "Remove vote" : vUserVote !== undefined ? "Change vote" : "Submit vote"
        return (
          <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/40" onClick={closeFn}>
            <div className="w-full max-w-[390px] md:max-w-[440px] bg-[var(--cream-panel)] rounded-t-2xl md:rounded-2xl shadow-2xl border border-[var(--line)] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center px-5 pt-5 pb-3 border-b border-[#F0EDE6] flex-shrink-0">
                <div className="flex-1">
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "var(--ink)" }}>Poll</p>
                  {vPoll && <p className="text-[11px] text-[var(--muted-text)] mt-0.5">{vTotal} vote{vTotal !== 1 ? "s" : ""}</p>}
                </div>
                {vTotal > 0 && (
                  <button
                    onClick={() => { setVotersPollId(votingPollId); closeFn() }}
                    className="text-[12px] font-semibold text-[var(--plum)] hover:opacity-70 transition-opacity mr-3"
                  >
                    See all votes
                  </button>
                )}
                <button onClick={closeFn} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--body-bg)] transition-colors">
                  <X className="w-4 h-4 text-[var(--body)]" />
                </button>
              </div>
              {vPoll ? (
                <>
                  <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
                    <p className="text-[15px] font-bold text-[var(--ink)] leading-snug mb-2">{vPoll.question}</p>
                    {vPoll.options.map((opt, oi) => {
                      const count = vCounts[oi] ?? 0
                      const pct = vTotal > 0 ? Math.round((count / vTotal) * 100) : 0
                      const isSelected = displaySelection === oi
                      const optVoters = vVoters.filter(v => v.option_index === oi).slice(0, 3)
                      return (
                        <button
                          key={oi}
                          onClick={() => {
                            if (isSelected) {
                              // Clicking highlighted option: unvote if it was original, revert if it was a pending change
                              if (oi === vUserVote) setPendingVoteOption("unvote")
                              else setPendingVoteOption(undefined)
                            } else {
                              setPendingVoteOption(oi)
                            }
                          }}
                          className="w-full text-left px-4 py-3.5 rounded-xl border transition-all active:scale-[0.98]"
                          style={{ borderColor: isSelected ? "var(--plum)" : "var(--line)", background: isSelected ? "rgba(62,21,64,0.05)" : "var(--cream-panel)" }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${isSelected ? "border-[var(--plum)] bg-[var(--plum)]" : "border-[#D8D3C8]"}`}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <span className={`text-[14px] font-semibold truncate ${isSelected ? "text-[var(--plum)]" : "text-[var(--ink)]"}`}>{opt}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {optVoters.length > 0 && (
                                <div className="flex items-center">
                                  {optVoters.map((v, vi) => (
                                    <MonogramChip
                                      key={v.user_id}
                                      initials={v.name.charAt(0).toUpperCase()}
                                      avatarUrl={v.avatar_url}
                                      className={`w-5 h-5 border border-white${vi > 0 ? " -ml-1.5" : ""}`}
                                      style={{ fontSize: 7, fontWeight: 700 }}
                                    />
                                  ))}
                                  {count > 3 && (
                                    <div className="-ml-1.5 w-5 h-5 rounded-full bg-[var(--line)] border border-white flex items-center justify-center flex-shrink-0">
                                      <span style={{ fontSize: 7, fontWeight: 700, color: "var(--body)" }}>+{count - 3}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              <span className={`text-[12px] font-semibold ${isSelected ? "text-[var(--plum)]" : "text-[var(--muted-text)]"}`}>{count > 0 ? `${pct}%` : ""}</span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[#F0EDE6] overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: vTotal > 0 ? `${pct}%` : "0%", background: isSelected ? "var(--plum)" : "#C4BDB8" }} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {/* Confirm footer — only shown when user has made a selection */}
                  <div className="px-5 pb-5 pt-3 border-t border-[#F0EDE6] flex-shrink-0 flex gap-2">
                    <button
                      onClick={closeFn}
                      className="flex-1 py-2.5 rounded-xl border border-[var(--line)] text-[13px] font-semibold text-[var(--body)] hover:bg-[var(--body-bg)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!hasPending}
                      onClick={async () => {
                        if (pendingVoteOption === "unvote") {
                          await handleVote(votingPollId, vUserVote!)
                        } else if (pendingVoteOption !== undefined) {
                          await handleVote(votingPollId, pendingVoteOption)
                        }
                        closeFn()
                      }}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
                      style={{ background: hasPending ? "var(--plum)" : "var(--line)", color: hasPending ? "var(--cream-on-dark)" : "var(--muted-text)", cursor: hasPending ? "pointer" : "default" }}
                    >
                      {hasPending ? confirmLabel : "Select an option"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center py-10">
                  <div className="w-5 h-5 border-2 border-[var(--plum)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Voters breakdown modal */}
      {votersPollId && (() => {
        const vPoll = pollsData[votersPollId]
        const vVoters = pollVoters[votersPollId] ?? []
        return (
          <div className="fixed inset-0 z-[210] flex items-end md:items-center justify-center bg-black/40" onClick={() => setVotersPollId(null)}>
            <div className="w-full max-w-[390px] md:max-w-[440px] bg-[var(--cream-panel)] rounded-t-2xl md:rounded-2xl shadow-2xl border border-[var(--line)] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center px-5 pt-5 pb-3 border-b border-[#F0EDE6] flex-shrink-0">
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "var(--ink)", flex: 1 }}>Votes</p>
                <button onClick={() => setVotersPollId(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--body-bg)] transition-colors">
                  <X className="w-4 h-4 text-[var(--body)]" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
                {vPoll ? vPoll.options.map((opt, oi) => {
                  const optVoters = vVoters.filter(v => v.option_index === oi)
                  if (optVoters.length === 0) return null
                  return (
                    <div key={oi}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[13px] font-semibold text-[var(--ink)]">{opt}</p>
                        <span className="text-[11px] text-[var(--muted-text)] font-medium">{optVoters.length} vote{optVoters.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {optVoters.map(v => (
                          <div key={v.user_id} className="flex items-center gap-2.5">
                            <MonogramChip
                              initials={v.name.charAt(0).toUpperCase()}
                              avatarUrl={v.avatar_url}
                              className="w-7 h-7"
                              style={{ fontSize: 10, fontWeight: 700 }}
                            />
                            <span className="text-[13px] text-[var(--ink)]">{v.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-[var(--plum)] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Poll creator modal */}
      {showPollCreator && !groupArchived && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowPollCreator(false)}>
          <div className="w-full max-w-[390px] md:max-w-[440px] bg-[var(--cream-panel)] rounded-t-2xl md:rounded-2xl shadow-2xl border border-[var(--line)] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#F0EEF8]">
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "var(--ink)" }}>Create a poll</p>
              <button onClick={() => setShowPollCreator(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--body-bg)] transition-colors">
                <X className="w-4 h-4 text-[var(--body)]" />
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--muted-text)] uppercase tracking-wide mb-1.5 block">Question</label>
                <input
                  autoFocus
                  value={pollQuestion}
                  onChange={e => setPollQuestion(e.target.value)}
                  placeholder="Ask something…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--cream-panel)] text-[14px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:border-[var(--plum)]/40 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--muted-text)] uppercase tracking-wide mb-1.5 block">Options</label>
                <div className="flex flex-col gap-2">
                  {pollOptions.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        value={opt}
                        onChange={e => setPollOptions(prev => { const next = [...prev]; next[oi] = e.target.value; return next })}
                        placeholder={`Option ${oi + 1}`}
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--cream-panel)] text-[14px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:border-[var(--plum)]/40 transition-colors"
                      />
                      {pollOptions.length > 2 && (
                        <button onClick={() => setPollOptions(prev => prev.filter((_, i) => i !== oi))} className="text-[var(--faint)] hover:text-[var(--body)] transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 5 && (
                    <button
                      onClick={() => setPollOptions(prev => [...prev, ""])}
                      className="flex items-center gap-1.5 text-[13px] text-[var(--plum)] font-medium hover:opacity-70 transition-opacity self-start mt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add option
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={handleCreatePoll}
                disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                className="w-full bg-[var(--plum)] hover:bg-[var(--plum-2)] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors text-[14px]"
              >
                Create poll
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward sheet */}
      {forwardingMsg && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center" onClick={() => setForwardingMsg(null)}>
          <div className="w-full max-w-[390px] md:max-w-[420px] bg-[var(--cream-panel)] rounded-t-2xl md:rounded-2xl shadow-2xl border border-[var(--line)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#F0EEF8]">
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "var(--ink)" }}>Forward to</p>
              <button onClick={() => setForwardingMsg(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--body-bg)] transition-colors">
                <X className="w-4 h-4 text-[var(--body)]" />
              </button>
            </div>
            <div className="px-3 py-2 max-h-[50vh] overflow-y-auto">
              {forwardGroups.length === 0 ? (
                <p className="text-[13px] text-[var(--muted-text)] px-3 py-4">No other chats available.</p>
              ) : (
                forwardGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleForward(g.id)}
                    className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-[var(--cream-panel)] active:bg-[#F3EDE6] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <MonogramChip initials={g.name.charAt(0).toUpperCase()} className="w-9 h-9 text-[12px] font-semibold" />
                      <span className="text-[14px] font-medium text-[var(--ink)]">{g.name}</span>
                    </div>
                    {forwardSentTo === g.id ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Forward className="w-4 h-4 text-[var(--faint)]" />
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="px-5 py-3 border-t border-[#F0EEF8]">
              <p className="text-[11px] text-[var(--muted-text)] truncate">"{replyPreviewLabel(forwardingMsg.content, forwardingMsg.attachment_type, forwardingMsg.attachment_name).slice(0, 60)}{forwardingMsg.content.length > 60 ? "…" : ""}"</p>
            </div>
          </div>
        </div>
      )}
    </div>
    </AnimateIn>

    {/* Image lightbox */}
    {lightboxUrl && (
      <div
        className="fixed inset-0 z-[300] bg-black/92 flex items-center justify-center"
        onClick={() => setLightboxUrl(null)}
      >
        <button
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[var(--cream-panel)]/10 flex items-center justify-center text-white hover:bg-[var(--cream-panel)]/20 transition-colors"
          onClick={() => setLightboxUrl(null)}
        >
          <X className="w-5 h-5" />
        </button>
        <img
          src={lightboxUrl}
          alt="Full size"
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
    </>
  )
}

export function ChatsTab({ userId, userProfile, userRole, ministryId, ministryName, onOpenChat, onTotalUnreadChange, refreshKey, onOpenDirectory, activeGroupId, canCreateChurchChat, fallbackChats }: ChatsTabProps) {
  const { setParam } = useNavState()
  const [subTab, setSubTab] = useState<"church" | "my">(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("chats") : null
    return (p === "church" || p === "my") ? p : "church"
  })
  const [showCreateChat, setShowCreateChat] = useState<"my" | "church" | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")

  const isAdminOrLeader = ["admin", "leader", "deacon", "elder"].includes(userRole.toLowerCase())

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
  // Treat "errored with no usable data" as still-loading so a poisoned/failed
  // fetch shows the spinner, never the "No chats" empty state. If stale data
  // exists (keepPreviousData), fall through and render it (stale > empty).
  const loading = isLoading || (!!error && allGroups.length === 0)

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
      const total = data.filter((g) => !g.archived).reduce((s, g) => s + g.unread_count, 0)
      onTotalUnreadChange(total)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const rawActive = subTab === "church" ? churchChats : myChats
  const active = search.trim()
    ? rawActive.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    : rawActive
  const showPlusButton = subTab === "my" || (subTab === "church" && canCreateChurchChat)

  const monoStyle = MONO_STYLE

  return (
    <div className="pb-2 md:pb-0 md:h-full md:flex md:flex-col">
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

      {/* Desktop full-width tab bar */}
      <div className="hidden md:flex flex-shrink-0">
        {(["church", "my"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setSubTab(t)
              setSearch("")
              setParam("chats", t === "church" ? null : t)
            }}
            style={{
              flex: 1, padding: "14px 0", fontSize: "14px", fontWeight: 600,
              color: subTab === t ? "var(--ink)" : "var(--muted-text)",
              background: "transparent", border: "none",
              borderBottom: `2px solid ${subTab === t ? "var(--plum)" : "transparent"}`,
              cursor: "pointer", transition: "color 0.15s",
            }}
          >
            {t === "church" ? "Church Chats" : "My Chats"}
          </button>
        ))}
      </div>

      <div className="px-5 pt-14 pb-2 md:pt-2 md:px-0 md:flex-1 md:overflow-y-auto">
      {/* Mobile header */}
      <div className="flex items-center justify-between mb-6 md:hidden">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <path d="M70 28 A32 32 0 1 0 70 72" stroke="var(--plum)" strokeWidth="8" strokeLinecap="round" />
            <circle cx="50" cy="50" r="6" fill="var(--plum)" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </div>
        <button
          onClick={onOpenDirectory}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F0EEF8] transition-colors"
          aria-label="Directory"
        >
          <Users className="w-5 h-5 text-[var(--plum)]" />
        </button>
      </div>

      {/* Sub-tab switcher — mobile only (underline tabs per DESIGN_SYSTEM §4.2; matches the desktop tab bar above) */}
      <div className="flex mb-5 md:hidden" style={{ borderBottom: "1px solid var(--line)" }}>
        {(["church", "my"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setSubTab(t)
              setSearch("")
              setParam("chats", t === "church" ? null : t)
            }}
            style={{
              flex: 1, padding: "12px 0", fontSize: "13px",
              fontWeight: subTab === t ? 600 : 400,
              color: subTab === t ? "var(--ink)" : "var(--muted-text)",
              background: "transparent", border: "none",
              borderBottom: `2px solid ${subTab === t ? "var(--plum)" : "transparent"}`,
              marginBottom: -1, cursor: "pointer", transition: "color 0.15s",
            }}
          >
            {t === "church" ? "Church Chats" : "My Chats"}
          </button>
        ))}
      </div>

      {/* Search bar — mobile only (desktop has one in the panel header above) */}
      <div className="relative mb-4 md:hidden">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-text)]/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chats…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--cream-panel)] text-[13px] placeholder:text-[var(--faint)] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--plum)]/20 border border-[#EFEFEF] focus:border-[var(--plum)]/30 transition-all"
        />
      </div>

      {/* Section header with + button */}
      <div className="flex items-center justify-between mb-3 md:px-4">
        <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "26px", color: "var(--ink)", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, margin: 0 }}
          className="md:hidden">
          {subTab === "church" ? "Church chats" : "My chats"}
        </h3>
        {/* Desktop mono section label */}
        <p className="hidden md:block mb-1" style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)" }}>
          {subTab === "church" ? `Church · ${churchChats.length}` : `Direct · ${myChats.length}`}
        </p>
        {showPlusButton && (
          <button
            onClick={() => setShowCreateChat(subTab)}
            className="size-8 rounded-xl bg-[var(--cream-panel)] border border-[var(--line)] flex items-center justify-center hover:bg-[#F2EDE0] active:scale-95 transition-all md:size-7 md:rounded-lg"
          >
            <Plus className="w-4 h-4 text-[var(--plum)] md:w-3.5 md:h-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : active.length === 0 && !(subTab === "church" && archivedChurchChats.length > 0) ? (
        <EmptyState
          icon={<Users className="w-7 h-7" />}
          title={search.trim() ? "No chats found" : subTab === "church" ? "No church chats" : "No personal chats"}
          subtitle={
            search.trim()
              ? `No chats match "${search.trim()}"`
              : subTab === "church"
              ? "You haven't been added to any church chats yet"
              : "Tap + to start a new chat"
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5 md:gap-0">
          {active.map((group, i) => (
            <ChatGroupCard key={group.id} group={group} onClick={() => handleOpenChat(group.id, group.name)} isActive={activeGroupId === group.id} />
          ))}

          {/* Archived section (Church Chats only) */}
          {subTab === "church" && archivedChurchChats.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowArchived((s) => !s)}
                className="w-full flex items-center justify-between py-3 px-1 md:px-4"
              >
                <span className="text-[11px] font-bold text-[var(--muted-text)]/40 uppercase tracking-wider">
                  Archived · {archivedChurchChats.length}
                </span>
                <ChevronDown className={`w-4 h-4 text-[var(--muted-text)]/30 transition-transform duration-200 ${showArchived ? "rotate-180" : ""}`} />
              </button>
              {showArchived && (
                <div className="flex flex-col gap-2.5">
                  {archivedChurchChats.map((group) => (
                    <div key={group.id} className="opacity-50">
                      <ChatGroupCard group={group} onClick={() => handleOpenChat(group.id, group.name)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showCreateChat && (
        <CreateChatScreen
          userId={userId}
          userName={userProfile.name}
          ministryId={ministryId}
          groupType={showCreateChat}
          onClose={() => setShowCreateChat(null)}
          onCreated={(group) => {
            const newGroup: ChatGroup = {
              id: group.id,
              name: group.name,
              type: showCreateChat!,
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
      </div>{/* end inner scroll div */}

    </div>
  )
}

export function ChatGroupCard({ group, onClick, isActive }: { group: ChatGroup; onClick: () => void; isActive?: boolean }) {
  const firstInitial = group.name.charAt(0)

  return (
    <button onClick={onClick} className="w-full text-left group">
      {/* Mobile style */}
      <div className="md:hidden bg-[var(--cream-panel)] border border-[var(--line)] rounded-[18px] p-4 hover:bg-[#F5F0E8] transition-colors">
        <div className="flex items-center gap-3.5">
          <MonogramChip
            initials={firstInitial}
            className="w-12 h-12 flex-shrink-0"
            style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400 }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[15px] font-semibold text-[var(--ink)] truncate pr-2">{group.name}</h3>
              {group.last_message_time && <span className="text-[11px] text-[var(--muted-text)] flex-shrink-0">{formatRelativeTime(group.last_message_time)}</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-[var(--body)] truncate">
                {group.last_message
                  ? group.last_sender ? <><span className="font-semibold text-[var(--body)]">{group.last_sender}:</span> {group.last_message}</> : group.last_message
                  : <span className="italic text-[var(--muted-text)]">No messages yet</span>}
              </p>
              {group.unread_count > 0 && (
                <span className="w-6 h-6 bg-[#C9A34B] rounded-full text-[11px] font-bold text-[var(--ink)] flex items-center justify-center flex-shrink-0">{group.unread_count}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop panel item — proportioned for 220px context panel */}
      <div
        className="hidden md:flex items-center gap-2.5 px-2.5 py-2 transition-colors duration-100"
        style={{
          borderLeft: isActive ? "2px solid var(--plum)" : "2px solid transparent",
          background: isActive ? "var(--ivory)" : undefined,
          borderRadius: isActive ? "var(--r-callout)" : undefined,
          margin: "0 4px",
        }}
        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--cream-3)" }}
        onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "" }}
      >
        <MonogramChip
          initials={firstInitial}
          className="flex-shrink-0"
          style={{ width: 38, height: 38, fontFamily: "var(--serif)", fontSize: "16px" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
            <p className="text-[13px] truncate leading-tight" style={{ color: "var(--ink)", fontWeight: group.unread_count ? 600 : 500, flex: 1, minWidth: 0 }}>
              {group.name}
            </p>
            {group.last_message_time && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.04em", color: "var(--faint)", flexShrink: 0 }}>
                {formatRelativeTime(group.last_message_time)}
              </span>
            )}
          </div>
          <p className="text-[11.5px] truncate leading-tight" style={{ color: group.unread_count ? "var(--body)" : "var(--muted-text)" }}>
            {group.last_message
              ? (group.last_sender ? `${group.last_sender}: ${group.last_message}` : group.last_message)
              : <span style={{ fontStyle: "italic" }}>No messages yet</span>}
          </p>
        </div>
        {group.unread_count > 0 && (
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
  userId: string
  ministryId: string
  activeGroupId?: string | null
  onOpenChat: (id: string, name: string, type?: string) => void
  refreshKey: number
  canCreateChurchChat: boolean
  userProfile: Profile
  userRole: string
  fallbackChats?: ChatGroup[]
}

export function ChatListPanel({ userId, ministryId, activeGroupId, onOpenChat, refreshKey, canCreateChurchChat, userProfile, userRole, fallbackChats }: ChatListPanelProps) {
  const { setParam } = useNavState()
  const [subTab, setSubTab] = useState<"church" | "my">(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("chats") : null
    return (p === "church" || p === "my") ? p : "church"
  })
  const [showCreateChat, setShowCreateChat] = useState<"my" | "church" | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")

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
  // Treat "errored with no usable data" as still-loading so a poisoned/failed
  // fetch shows the spinner, never the "No chats" empty state. Stale data
  // (keepPreviousData) falls through and renders (stale > empty).
  const loading = isLoading || (!!error && allGroups.length === 0)

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
  const showPlusButton = subTab === "my" || (subTab === "church" && canCreateChurchChat)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search — matches DirectoryMemberListPanel */}
      <div className="px-3 py-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--muted-text)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats"
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-[12.5px] placeholder:text-[var(--muted-text)] focus:outline-none focus:ring-2 focus:ring-[var(--plum)]/20"
            style={{ background: "var(--cream)", borderColor: "var(--line-2)", color: "var(--ink)" }}
          />
        </div>
      </div>

      {/* Church / My tab strip */}
      <div className="px-3 flex-shrink-0">
        <div className="flex" style={{ borderBottom: "1px solid var(--line)" }}>
          {(["church", "my"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setSubTab(t)
                setSearch("")
                setParam("chats", t === "church" ? null : t)
              }}
              style={{
                flex: 1,
                padding: "9px 0",
                fontSize: "11px",
                fontWeight: 600,
                color: subTab === t ? "var(--ink)" : "var(--muted-text)",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${subTab === t ? "var(--plum)" : "transparent"}`,
                marginBottom: -1,
                cursor: "pointer",
                fontFamily: "var(--sans)",
              }}
            >
              {t === "church" ? "Church" : "My Chats"}
            </button>
          ))}
        </div>
      </div>

      {/* Count + plus button */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2 flex-shrink-0">
        <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)" }}>
          {subTab === "church" ? `Church · ${churchChats.length}` : `Direct · ${myChats.length}`}
        </p>
        {showPlusButton && (
          <button
            onClick={() => setShowCreateChat(subTab)}
            style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-text)", borderRadius: "var(--r-pill)", padding: 0 }}
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-2 pt-2"><Spinner /></div>
        ) : active.length === 0 && !(subTab === "church" && archivedChurchChats.length > 0) ? (
          <p style={{ fontSize: 12, color: "var(--muted-text)", padding: "8px 12px", fontFamily: "var(--sans)" }}>
            {search.trim() ? "No results" : subTab === "church" ? "No church chats" : "No personal chats"}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 pt-1">
              {active.map((group) => (
                <ChatGroupCard key={group.id} group={group} onClick={() => handleOpenChatPanel(group.id, group.name)} isActive={activeGroupId === group.id} />
              ))}
            </div>
            {subTab === "church" && archivedChurchChats.length > 0 && (
              <div>
                <button
                  onClick={() => setShowArchived(s => !s)}
                  className="w-full flex items-center justify-between px-4 py-2"
                >
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)" }}>
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

      {showCreateChat && (
        <CreateChatScreen
          userId={userId}
          userName={userProfile.name}
          ministryId={ministryId}
          groupType={showCreateChat}
          onClose={() => setShowCreateChat(null)}
          onCreated={(group) => {
            const newGroup: ChatGroup = {
              id: group.id,
              name: group.name,
              type: showCreateChat!,
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
