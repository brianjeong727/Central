"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, ChevronRight, ChevronDown, ChevronUp, X, Check, ArrowLeft, Send, Settings, MoreHorizontal, Trash2, CornerUpLeft, Plus, Users, Pencil, Info, Download, User, Smile, Forward, Paperclip, Pin, FileDown, BarChart2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { createGroup } from "@/app/actions/create-group"
import { deleteGroup } from "@/app/actions/chat"
import { syncSmallGroupFromChatAction } from "@/app/actions/auto-chats"
import { Spinner, EmptyState, AnimateIn } from "../components/shared"
import { MonogramChip } from "@/components/central"
import { getInitials, formatRelativeTime, formatMessageTime, REACTION_EMOJIS } from "../utils"
import Picker from "@emoji-mart/react"
import data from "@emoji-mart/data"
import type { CreateChatScreenProps, ChatSettingsProps, ChatScreenProps, ChatsTabProps, ChatGroup, GroupMember, Message, Reaction, Profile } from "../types"
import { InsetHairline } from "@/components/central/hairline"

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
    <div className="fixed inset-0 z-[60] bg-[#FBF8F2] flex flex-col md:bg-black/20 md:backdrop-blur-sm md:items-center md:justify-center">
      <div className="flex flex-col w-full h-full bg-[#FBF8F2] md:h-auto md:max-h-[85vh] md:max-w-[500px] md:rounded-2xl md:shadow-2xl md:overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 border-b border-[#ECE8DE]">
          <div className="flex items-center justify-between px-5 pt-12 pb-3 md:pt-6">
            <button
              onClick={onClose}
              className="size-9 bg-white border border-[#ECE8DE] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0 shadow-[0_1px_3px_rgba(19,16,26,0.05)]"
            >
              <X className="w-4 h-4 text-[#13101A]" />
            </button>
            <span style={{ fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", fontWeight: 600, color: "#8A8497" }}>
              {groupType === "church" ? "Church Chat" : "New Chat"}
            </span>
          </div>
          <div className="px-5 pb-5">
            <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "32px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", lineHeight: 1.05, margin: 0 }}>
              {groupType === "church" ? "New Church Chat" : "New Chat"}
            </h1>
            <p style={{ fontSize: "13px", color: "#8A8497", marginTop: "6px" }}>
              {isDM ? `Starting a conversation with ${selectedMembers[0]?.name.split(" ")[0]}.` : "Select people to start a conversation."}
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
              {error}
            </div>
          )}

          {/* Chat name — adapts to selection state */}
          {noMembers && (
            // No members selected: show traditional name input (needed for church chats)
            <div className="bg-white rounded-2xl border border-[#ECE8DE] shadow-[0_1px_3px_rgba(19,16,26,0.04)] px-4 pt-4 pb-4">
              <label className="text-[10px] font-semibold text-[#8A8497] tracking-wider uppercase block mb-2">Chat Name</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={groupType === "church" ? "e.g. Freshman Bible Study" : "e.g. Prayer Group"}
                className="w-full text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none bg-transparent"
                style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "18px", letterSpacing: "-0.01em", lineHeight: "1.4" }}
              />
            </div>
          )}

          {isGroup && (
            // 2+ members: show auto-name with optional edit link
            <div className="bg-white rounded-2xl border border-[#ECE8DE] shadow-[0_1px_3px_rgba(19,16,26,0.04)] px-4 pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold text-[#8A8497] tracking-wider uppercase">Chat Name</label>
                <button
                  type="button"
                  onClick={() => { setShowNameEdit((v) => !v); if (!showNameEdit) setCustomName("") }}
                  className="text-[11px] font-semibold text-[#8A8497] hover:text-[#3E1540] transition-colors"
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
                  className="w-full text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none bg-transparent"
                  style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "18px", letterSpacing: "-0.01em", lineHeight: "1.4" }}
                />
              ) : (
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "18px", letterSpacing: "-0.01em", lineHeight: "1.4", color: "#13101A", margin: 0 }}>
                  {effectiveName}
                </p>
              )}
            </div>
          )}

          {/* Member search */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "1.2px", textTransform: "uppercase", color: "#8A8497" }}>Add Members</label>
              {selectedMembers.length > 0 && (
                <span className="text-[12px] text-[#3E1540] font-semibold">{selectedMembers.length} selected</span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8497]/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white text-[13px] placeholder:text-[#C4C4C4] text-[#13101A] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 border border-[#ECE8DE] focus:border-[#3E1540]/30 transition-all shadow-[0_1px_2px_rgba(19,16,26,0.04)]"
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
                    className="flex items-center gap-1.5 bg-[#3E1540] text-white px-3 py-1.5 rounded-full text-[12px] font-semibold hover:bg-[#2D0F2E] transition-colors"
                  >
                    {m.name.split(" ")[0]}
                    <X className="w-3 h-3 opacity-70" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col rounded-2xl border border-[#ECE8DE] bg-white overflow-hidden shadow-[0_1px_3px_rgba(19,16,26,0.04)]">
              {filtered.length === 0 ? (
                <p className="text-center text-[13px] text-[#8A8497]/50 py-8">No members found</p>
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
                      } ${isSelected ? "bg-[#3E1540]/[0.04]" : "hover:bg-[#FAFAF8]"}`}
                    >
                      <MonogramChip
                        initials={getInitials(member.name)}
                        avatarUrl={member.avatar_url}
                        className="w-9 h-9 font-bold text-[11px] shadow-sm"
                        style={{ fontFamily: "var(--font-instrument-serif)" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#13101A]">{member.name}</p>
                        {member.graduation_year && (
                          <p className="text-[11px] text-[#8A8497]">Class of {member.graduation_year}</p>
                        )}
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected ? "bg-[#3E1540] border-[#3E1540]" : "border-[#D4CFCF]"
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
        <div className="flex-shrink-0 bg-[#FBF8F2] border-t border-[#ECE8DE] px-5 py-4">
          <button
            onClick={handleCreate}
            disabled={creating || !effectiveName.trim()}
            className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-bold py-4 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px] tracking-wide"
          >
            {creating ? "Creating…" : isDM ? `Message ${selectedMembers[0]?.name.split(" ")[0]}` : `Create Chat${selectedMembers.length > 0 ? ` · ${selectedMembers.length + 1} members` : ""}`}
          </button>
        </div>

      </div>
    </div>
  )
}

export function ChatSettings({ groupId, groupName, groupType, groupArchived = false, userId, userName, ministryId, userRole, onBack, onNameChange, onClose }: ChatSettingsProps) {
  const supabase = createClient()
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [displayGroupName, setDisplayGroupName] = useState(groupName)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(groupName)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [searchAdd, setSearchAdd] = useState("")
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([])
  const [pendingAddMembers, setPendingAddMembers] = useState<GroupMember[]>([])
  const [pendingRemoveIds, setPendingRemoveIds] = useState<Set<string>>(new Set())
  const [muted, setMuted] = useState(false)
  const [savedMuted, setSavedMuted] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [savedPinned, setSavedPinned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmAction, setConfirmAction] = useState<"archive" | "unarchive" | "delete" | null>(null)
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null)
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)
  const [mobileRevealMemberId, setMobileRevealMemberId] = useState<string | null>(null)

  const isAdminOrLeader = ["admin", "leader", "deacon", "elder"].includes(userRole.toLowerCase())
  const isDM = groupType === "dm"
  const isMy = groupType === "my"
  const isChurch = groupType === "church"
  const canManage = (isChurch && isAdminOrLeader) || isMy
  const canLeave = isMy || isDM
  const canArchive = isChurch && isAdminOrLeader && !groupArchived
  const canUnarchive = isChurch && isAdminOrLeader && groupArchived
  const canDelete = isChurch && isAdminOrLeader

  useEffect(() => {
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  async function loadMembers() {
    setLoading(true)
    const { data } = await supabase
      .from("group_members")
      .select("user_id, profiles!user_id(name, role, graduation_year, avatar_url)")
      .eq("group_id", groupId)

    if (data) {
      const mapped: GroupMember[] = data.map((m: {
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
      setMembers(mapped)
    }
    setLoading(false)
  }

  async function loadAllProfiles() {
    const existingIds = new Set([...members.map((m) => m.user_id), ...pendingAddMembers.map(m => m.user_id)])
    const { data } = await supabase
      .from("profiles")
      .select("id, name, role, graduation_year, email, about_me, bible_verse, prayer_request, pray_for_me, avatar_url")
      .eq("ministry_id", ministryId)
      .order("name")
    setAllProfiles((data ?? []).filter((p: Profile) => !existingIds.has(p.id)))
  }

  async function handleRename() {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === displayGroupName) { setRenaming(false); return }
    setSaving(true)
    const { error } = await supabase.from("groups").update({ name: trimmed }).eq("id", groupId).eq("ministry_id", ministryId)
    if (!error) {
      setDisplayGroupName(trimmed)
      onNameChange(trimmed)
      await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `Chat renamed to "${trimmed}"`, message_type: "system" })
    }
    setSaving(false)
    setRenaming(false)
  }

  function stageRemoveMember(memberId: string) {
    setPendingRemoveIds(prev => new Set([...prev, memberId]))
    setConfirmRemoveMemberId(null)
    setMobileRevealMemberId(null)
  }

  function unstageRemoveMember(memberId: string) {
    setPendingRemoveIds(prev => { const n = new Set(prev); n.delete(memberId); return n })
  }

  function stageAddMembers() {
    if (selectedToAdd.length === 0) return
    const toStage = allProfiles
      .filter(p => selectedToAdd.includes(p.id))
      .map(p => ({ user_id: p.id, name: p.name, role: p.role, graduation_year: p.graduation_year ?? null, avatar_url: p.avatar_url ?? null }))
    setPendingAddMembers(prev => {
      const existingIds = new Set([...members.map(m => m.user_id), ...prev.map(m => m.user_id)])
      return [...prev, ...toStage.filter(m => !existingIds.has(m.user_id))]
    })
    setSelectedToAdd([])
    setShowAddMembers(false)
    setSearchAdd("")
  }

  function unstagePendingAdd(memberId: string) {
    setPendingAddMembers(prev => prev.filter(m => m.user_id !== memberId))
  }

  const hasChanges = pendingAddMembers.length > 0 || pendingRemoveIds.size > 0 || muted !== savedMuted || pinned !== savedPinned

  async function handleSaveChanges() {
    setSaving(true)
    const actorFirstName = userName.split(" ")[0]
    const addUserIds = pendingAddMembers.map(m => m.user_id)
    const removeUserIds = [...pendingRemoveIds]
    if (removeUserIds.length > 0) {
      const removedNames = removeUserIds.map(id => members.find(m => m.user_id === id)?.name.split(" ")[0] ?? "Someone")
      await Promise.all(removeUserIds.map(id =>
        supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", id)
      ))
      setMembers(prev => prev.filter(m => !pendingRemoveIds.has(m.user_id)))
      setPendingRemoveIds(new Set())
      await Promise.all(removedNames.map(name =>
        supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `${actorFirstName} removed ${name}`, message_type: "system" })
      ))
    }
    if (pendingAddMembers.length > 0) {
      await supabase.from("group_members").insert(pendingAddMembers.map(m => ({ group_id: groupId, user_id: m.user_id })))
      setMembers(prev => [...prev, ...pendingAddMembers])
      await Promise.all(pendingAddMembers.map(m =>
        supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `${actorFirstName} added ${m.name.split(" ")[0]}`, message_type: "system" })
      ))
      setPendingAddMembers([])
    }
    await supabase.from("group_members").update({ muted, pinned }).eq("group_id", groupId).eq("user_id", userId)
    setSavedMuted(muted)
    setSavedPinned(pinned)
    // Sync member changes back to any linked small group
    if (addUserIds.length > 0 || removeUserIds.length > 0) {
      await syncSmallGroupFromChatAction({ chatGroupId: groupId, addUserIds, removeUserIds })
    }
    setSaving(false)
  }

  function handleDiscard() {
    setPendingRemoveIds(new Set())
    setPendingAddMembers([])
    setMuted(savedMuted)
    setPinned(savedPinned)
    setConfirmRemoveMemberId(null)
    setMobileRevealMemberId(null)
  }

  async function handleLeave() {
    await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `${userName.split(" ")[0]} left`, message_type: "system" })
    await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId)
    onClose()
  }

  async function handleArchive() {
    const { error } = await supabase.from("groups").update({ archived: true }).eq("id", groupId).eq("ministry_id", ministryId)
    if (!error) onClose()
  }

  async function handleUnarchive() {
    const { error } = await supabase.from("groups").update({ archived: false }).eq("id", groupId).eq("ministry_id", ministryId)
    if (!error) onClose()
  }

  async function handleDelete() {
    const { error } = await deleteGroup(groupId)
    if (!error) onClose()
  }

  const filteredProfiles = allProfiles.filter((p) =>
    p.name.toLowerCase().includes(searchAdd.toLowerCase())
  )

  if (showAddMembers) {
    return (
      <div className="fixed inset-0 z-[110] bg-[#FBF8F2] flex flex-col md:left-[var(--shell-offset)]">
      <div className="max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none">

        <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 md:pt-5 bg-white border-b border-[#ECE8DE]">
          <button
            onClick={() => { setShowAddMembers(false); setSearchAdd(""); setSelectedToAdd([]) }}
            className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-[#13101A]" />
          </button>
          <h2 className="flex-1 text-[15px] font-bold text-[#13101A] tracking-tight">Add Members</h2>
          {selectedToAdd.length > 0 && (
            <span className="text-[12px] font-semibold text-[#3E1540]">{selectedToAdd.length} selected</span>
          )}
        </div>

        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8497]/40" />
            <input
              type="text"
              placeholder="Search members…"
              value={searchAdd}
              onChange={(e) => setSearchAdd(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FBF8F2] text-[13px] placeholder:text-[#C4C4C4] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 border border-[#EFEFEF] focus:border-[#3E1540]/30 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {filteredProfiles.length === 0 ? (
            <div className="flex items-center justify-center h-24">
              <p className="text-[13px] text-[#8A8497]/40">No members to add</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredProfiles.map((profile) => {
                const selected = selectedToAdd.includes(profile.id)
                return (
                  <button
                    key={profile.id}
                    onClick={() => setSelectedToAdd((prev) =>
                      selected ? prev.filter((id) => id !== profile.id) : [...prev, profile.id]
                    )}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${
                      selected
                        ? "bg-[#3E1540]/6 border-[#3E1540]/20"
                        : "bg-white border-[#EFEFEF]"
                    }`}
                  >
                    <MonogramChip initials={getInitials(profile.name)} avatarUrl={profile.avatar_url} className="w-9 h-9 font-bold text-[10px]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#13101A] truncate">{profile.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {profile.role && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide border ${["admin","leader","deacon","elder"].includes(profile.role.toLowerCase()) ? "bg-[#3E1540] text-white border-[#3E1540]" : profile.role.toLowerCase() === "visitor" ? "bg-white text-[#8A8497] border-[#D8D3C8]" : "bg-[#F3EDE6] text-[#3E1540] border-transparent"}`}>
                            {profile.role}
                          </span>
                        )}
                        {profile.graduation_year && (
                          <span className="text-[11px] text-[#8A8497]/50">Class of {profile.graduation_year}</span>
                        )}
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      selected ? "bg-[#3E1540] border-[#3E1540]" : "border-muted-foreground/20"
                    }`}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 bg-white border-t border-[#ECE8DE] px-5 py-4">
          <button
            onClick={stageAddMembers}
            disabled={selectedToAdd.length === 0}
            className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-[14px] tracking-wide"
          >
            {selectedToAdd.length > 0
              ? `Add ${selectedToAdd.length} Member${selectedToAdd.length !== 1 ? "s" : ""}`
              : "Add Members"}
          </button>
        </div>
      </div>
      </div>
    )
  }

  const typeLabel = isDM ? "Direct message" : isChurch ? "Church chat" : "Group chat"

  return (
    <div className="fixed inset-0 z-[110] bg-[#FBF8F2] flex flex-col md:left-[var(--shell-offset)]">
    <div className="max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none">

      {/* ── Mobile header (hidden on desktop) ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 md:hidden bg-white border-b border-[#ECE8DE]">
        <button onClick={onBack} className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-[#13101A]" />
        </button>
        <h2 className="flex-1 text-[15px] font-bold text-[#13101A] tracking-tight">Chat Info</h2>
        {hasChanges && (
          <button onClick={handleSaveChanges} disabled={saving} style={{ height: 32, padding: "0 12px", background: "#2D0F2E", color: "#FBF8F2", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      {/* ── Desktop settings header ── */}
      <div className="hidden md:flex h-12 px-7 items-center gap-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--line)", background: "var(--cream)" }}>
        <div className="flex items-center gap-1.5 text-[12px]" style={{ flex: 1 }}>
          <span style={{ color: "var(--muted-text)" }}>Central</span>
          <span style={{ color: "var(--line-2)" }}>/</span>
          <span style={{ color: "var(--muted-text)" }}>Chats</span>
          <span style={{ color: "var(--line-2)" }}>/</span>
          <span style={{ color: "var(--muted-text)" }}>{displayGroupName}</span>
          <span style={{ color: "var(--line-2)" }}>/</span>
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>Info</span>
        </div>
        {hasChanges ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={handleDiscard} style={{ height: 34, padding: "0 14px", background: "transparent", border: "1px solid #ECE8DE", borderRadius: 8, color: "#5A5466", fontSize: 13, cursor: "pointer" }}>Discard</button>
            <button onClick={handleSaveChanges} disabled={saving} style={{ height: 34, padding: "0 20px", background: "#2D0F2E", color: "#FBF8F2", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        ) : (
          <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] hover:text-[#3E1540] transition-colors px-3 py-1.5 rounded-lg border border-[#ECE8DE] bg-white" style={{ color: "#8A8497" }}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Desktop: plum hero ── */}
        <div className="hidden md:block px-10 pt-8 pb-6">
          <div style={{
            background: "radial-gradient(circle at 90% 20%, rgba(246,244,239,0.12) 0%, transparent 40%), radial-gradient(circle at 8% 90%, rgba(246,244,239,0.08) 0%, transparent 35%), #3E1540",
            borderRadius: 20, padding: "28px 32px", position: "relative", overflow: "hidden",
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 24, alignItems: "center",
          }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(246,244,239,0.18) 1px, transparent 1.4px)", backgroundSize: "18px 18px", opacity: 0.35, pointerEvents: "none" }} />
            {/* Avatar */}
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ width: 72, height: 72, borderRadius: 999, background: "rgba(246,244,239,0.08)", border: "1px solid rgba(246,244,239,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-instrument-serif)", fontSize: 24, color: "#F6F4EF" }}>
                {getInitials(displayGroupName)}
              </div>
            </div>
            {/* Name + meta */}
            <div style={{ position: "relative", zIndex: 1 }}>
              <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(246,244,239,0.6)", marginBottom: 6 }}>{typeLabel}</p>
              {renaming ? (
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setRenaming(false); setNewName(displayGroupName) } }}
                  onBlur={handleRename}
                  style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, color: "#F6F4EF", lineHeight: 1.05, background: "transparent", border: "none", borderBottom: "1px solid rgba(246,244,239,0.4)", outline: "none", padding: 0 }}
                />
              ) : (
                <div
                  className="group flex items-center gap-2"
                  style={{ cursor: canManage ? "text" : "default" }}
                  onClick={canManage ? () => { setRenaming(true); setNewName(displayGroupName) } : undefined}
                >
                  <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, color: "#F6F4EF", lineHeight: 1.05 }}>{displayGroupName}</h2>
                  {canManage && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 13, height: 13, color: "rgba(246,244,239,0.6)", flexShrink: 0, marginTop: 4 }} />}
                </div>
              )}
              <p style={{ color: "rgba(246,244,239,0.65)", fontSize: 13, marginTop: 8 }}>
                {members.length} member{members.length !== 1 ? "s" : ""}
              </p>
            </div>
            {/* Action buttons */}
            {canManage && (
              <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => { setShowAddMembers(true); loadAllProfiles() }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "rgba(246,244,239,0.08)", border: "1px solid rgba(246,244,239,0.2)", borderRadius: 10, color: "#F6F4EF", fontSize: 13, cursor: "pointer" }}>
                  <Plus style={{ width: 13, height: 13 }} /> Add members
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Desktop: two-column body ── */}
        <div className="hidden md:grid px-10 pb-10 gap-6" style={{ gridTemplateColumns: "1.4fr 1fr" }}>

          {/* Members */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "#13101A", fontWeight: 400 }}>Members</h3>
              <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8497" }}>{members.length + pendingAddMembers.length - pendingRemoveIds.size} people</span>
            </div>
            {loading ? <Spinner /> : (() => {
              const allRows = [...members, ...pendingAddMembers]
              return (
              <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, overflow: "hidden" }}>
                {allRows.map((member, i) => {
                  const isPendingRemove = pendingRemoveIds.has(member.user_id)
                  const isPendingAdd = pendingAddMembers.some(m => m.user_id === member.user_id)
                  const isConfirming = confirmRemoveMemberId === member.user_id
                  const isHovered = hoveredMemberId === member.user_id
                  return (
                  <div key={member.user_id}
                    onMouseEnter={() => setHoveredMemberId(member.user_id)}
                    onMouseLeave={() => setHoveredMemberId(null)}
                    style={{
                      display: "grid", gridTemplateColumns: "40px 1fr auto auto",
                      alignItems: "center", gap: 14, padding: "15px 20px",
                      borderBottom: i < allRows.length - 1 ? "1px solid #ECE8DE" : "none",
                      background: isPendingRemove ? "#FDF0F0" : isConfirming ? "#FDF0F0" : isPendingAdd ? "rgba(62,21,64,0.03)" : "white",
                      transition: "background 0.1s",
                    }}>
                    <MonogramChip initials={getInitials(member.name)} avatarUrl={member.avatar_url} className="w-10 h-10 font-bold text-[11px]" />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <p style={{ fontSize: 14, color: isPendingRemove ? "#9F3030" : "#13101A", fontWeight: 500, textDecoration: isPendingRemove ? "line-through" : "none" }}>{member.name}</p>
                        {member.user_id === userId && (
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#FBF8F2", color: "#8A8497", letterSpacing: "0.06em", textTransform: "uppercase" }}>You</span>
                        )}
                        {isPendingRemove && <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", color: "#9F3030", background: "#FDF0F0", border: "1px solid #F0C8C8", borderRadius: 4, padding: "1px 5px" }}>REMOVING</span>}
                        {isPendingAdd && <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", color: "#3E1540", background: "rgba(62,21,64,0.06)", border: "1px solid rgba(62,21,64,0.15)", borderRadius: 4, padding: "1px 5px" }}>ADDING</span>}
                      </div>
                      {member.graduation_year && (
                        <p style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>Class of {member.graduation_year}</p>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {member.role && (
                        <span style={{
                          fontSize: 11, padding: "3px 10px", borderRadius: 999,
                          background: ["admin","leader","deacon","elder"].includes(member.role.toLowerCase()) ? "rgba(62,21,64,0.08)" : member.role.toLowerCase() === "visitor" ? "white" : "#FBF8F2",
                          color: ["admin","leader","deacon","elder"].includes(member.role.toLowerCase()) ? "#3E1540" : "#8A8497",
                          border: member.role.toLowerCase() === "visitor" ? "1px solid #D8D3C8" : "none",
                          letterSpacing: "0.04em", textTransform: "uppercase" as const,
                        }}>
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </span>
                      )}
                    </div>
                    {canManage && member.user_id !== userId && (
                      isPendingAdd ? (
                        <button onClick={() => unstagePendingAdd(member.user_id)} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: "#8A8497" }}>
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      ) : isPendingRemove ? (
                        <button onClick={() => unstageRemoveMember(member.user_id)} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: "#8A8497" }}>
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      ) : isConfirming ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <button onClick={() => stageRemoveMember(member.user_id)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#9F3030" }}>
                            <Check style={{ width: 14, height: 14 }} />
                          </button>
                          <button onClick={() => setConfirmRemoveMemberId(null)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#8A8497" }}>
                            <X style={{ width: 14, height: 14 }} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRemoveMemberId(member.user_id)}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: "#8A8497", opacity: isHovered ? 1 : 0, transition: "opacity 0.15s" }}
                        >
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      )
                    )}
                  </div>
                  )
                })}
                {canManage && (
                  <button onClick={() => { setShowAddMembers(true); loadAllProfiles() }} style={{ width: "100%", padding: "13px 20px", borderTop: "1px solid #ECE8DE", color: "#3E1540", fontSize: 13.5, display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                    <Plus style={{ width: 14, height: 14 }} /> Add members from directory
                  </button>
                )}
              </div>
              )
            })()}
            {isChurch && canManage && (
              <p style={{ fontSize: 11, color: "#8A8497", marginTop: 10, lineHeight: 1.5 }}>
                Member changes sync to the small group home page if this chat is linked to a group.
              </p>
            )}
          </div>

          {/* Preferences + Manage */}
          <div>
            {/* Preferences */}
            <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "#13101A", fontWeight: 400, marginBottom: 14 }}>Preferences</h3>
            <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #ECE8DE" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13.5, color: "#13101A", fontWeight: 500 }}>Mute notifications</p>
                  <p style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>Stay in the chat. Just stop the buzz.</p>
                </div>
                <div
                  onClick={() => setMuted(!muted)}
                  style={{ width: 38, height: 22, borderRadius: 999, background: muted ? "#3E1540" : "#ECE8DE", position: "relative", cursor: "pointer", flexShrink: 0 }}
                >
                  <div style={{ position: "absolute", top: 3, left: muted ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", padding: "16px 20px" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13.5, color: "#13101A", fontWeight: 500 }}>Pin to top of chats</p>
                  <p style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>Keeps it above the fold.</p>
                </div>
                <div
                  onClick={() => setPinned(!pinned)}
                  style={{ width: 38, height: 22, borderRadius: 999, background: pinned ? "#3E1540" : "#ECE8DE", position: "relative", cursor: "pointer", flexShrink: 0 }}
                >
                  <div style={{ position: "absolute", top: 3, left: pinned ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                </div>
              </div>
            </div>

            <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "#13101A", fontWeight: 400, marginBottom: 14 }}>Manage</h3>
            <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
              {canManage && (
                <button onClick={() => { setShowAddMembers(true); loadAllProfiles() }} style={{ width: "100%", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, background: "transparent", border: "none", borderBottom: "1px solid #ECE8DE", cursor: "pointer" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: "#FBF8F2", border: "1px solid #ECE8DE", display: "flex", alignItems: "center", justifyContent: "center", color: "#3E1540", flexShrink: 0 }}>
                    <Plus style={{ width: 13, height: 13 }} />
                  </div>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <p style={{ fontSize: 13.5, color: "#13101A", fontWeight: 500 }}>Add members</p>
                    <p style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>Invite from the directory</p>
                  </div>
                  <ChevronRight style={{ width: 14, height: 14, color: "#C4C4C4" }} />
                </button>
              )}
              <button style={{ width: "100%", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, background: "transparent", border: "none", cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "#FBF8F2", border: "1px solid #ECE8DE", display: "flex", alignItems: "center", justifyContent: "center", color: "#3E1540", flexShrink: 0 }}>
                  <Download style={{ width: 13, height: 13 }} />
                </div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <p style={{ fontSize: 13.5, color: "#13101A", fontWeight: 500 }}>Export transcript</p>
                  <p style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>Download as a text file</p>
                </div>
                <ChevronRight style={{ width: 14, height: 14, color: "#C4C4C4" }} />
              </button>
            </div>

            {/* Danger */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {canArchive && (
                <button onClick={() => setConfirmAction("archive")} style={{ width: "100%", padding: "11px 0", background: "white", color: "#5A5466", borderRadius: 12, fontSize: 13.5, fontWeight: 500, border: "1px solid #ECE8DE", cursor: "pointer" }}>
                  Archive chat
                </button>
              )}
              {canUnarchive && (
                <button onClick={() => setConfirmAction("unarchive")} style={{ width: "100%", padding: "11px 0", background: "white", color: "#5A5466", borderRadius: 12, fontSize: 13.5, fontWeight: 500, border: "1px solid #ECE8DE", cursor: "pointer" }}>
                  Unarchive chat
                </button>
              )}
              {canLeave && (
                <button onClick={handleLeave} style={{ width: "100%", padding: "11px 0", background: "transparent", color: "#B0413E", borderRadius: 12, fontSize: 13.5, fontWeight: 500, border: "none", cursor: "pointer" }}>
                  Leave conversation
                </button>
              )}
              {canDelete && (
                <button onClick={() => setConfirmAction("delete")} style={{ width: "100%", padding: "11px 0", background: "transparent", color: "#B0413E", borderRadius: 12, fontSize: 13.5, fontWeight: 500, border: "1px solid #FFD7D7", cursor: "pointer" }}>
                  Delete chat
                </button>
              )}
              {confirmAction && (
                <div style={{ background: "#FDF0F0", border: "1px solid #F0C8C8", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <p style={{ fontSize: 13, color: "#5A5466", flex: 1, margin: 0 }}>
                    {confirmAction === "archive" ? "Archive this chat? Members won't be able to send new messages." :
                     confirmAction === "unarchive" ? "Unarchive this chat and allow messages again?" :
                     "Delete this chat and all its messages? This cannot be undone."}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    <button onClick={() => setConfirmAction(null)} style={{ fontSize: 13, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Cancel</button>
                    <button
                      onClick={() => { if (confirmAction === "archive") handleArchive(); else if (confirmAction === "unarchive") handleUnarchive(); else handleDelete() }}
                      style={{ height: 32, padding: "0 14px", background: "#9F3030", color: "#FBF8F2", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}
                    >
                      {confirmAction === "archive" ? "Archive" : confirmAction === "unarchive" ? "Unarchive" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Mobile: original layout ── */}
        <div className="md:hidden">
          {/* CHAT INFO */}
          <div className="px-5 pt-6 pb-2">
            <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "20px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, marginBottom: "16px" }}>
              Chat info
            </h3>
            <div className="bg-white rounded-2xl border border-[#EFEFEF] p-5 mb-4 flex items-center gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <MonogramChip initials={getInitials(displayGroupName)} className="w-14 h-14 font-bold text-[16px] tracking-wide" />
              <div className="flex-1 min-w-0">
                {renaming ? (
                  <input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setRenaming(false); setNewName(displayGroupName) } }}
                    onBlur={handleRename}
                    className="text-[16px] font-bold text-[#13101A] tracking-tight bg-transparent outline-none border-none w-full"
                    style={{ borderBottom: "1px solid #E2DDCF", padding: 0 }}
                  />
                ) : (
                  <div
                    className="group flex items-center gap-1.5"
                    style={{ cursor: canManage ? "text" : "default" }}
                    onClick={canManage ? () => { setRenaming(true); setNewName(displayGroupName) } : undefined}
                  >
                    <h3 className="text-[16px] font-bold text-[#13101A] tracking-tight">{displayGroupName}</h3>
                    {canManage && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 12, height: 12, color: "#8A8497", flexShrink: 0 }} />}
                  </div>
                )}
                <p className="text-[12px] text-[#8A8497]/60 mt-0.5">{members.length + pendingAddMembers.length - pendingRemoveIds.size} member{members.length + pendingAddMembers.length - pendingRemoveIds.size !== 1 ? "s" : ""}</p>
              </div>
            </div>
            {loading ? <Spinner /> : (
              <div className="flex flex-col gap-2 mb-6">
                {[...members, ...pendingAddMembers].map((member) => {
                  const isPendingRemove = pendingRemoveIds.has(member.user_id)
                  const isPendingAdd = pendingAddMembers.some(m => m.user_id === member.user_id)
                  const isConfirming = confirmRemoveMemberId === member.user_id
                  const isRevealed = mobileRevealMemberId === member.user_id
                  return (
                  <div
                    key={member.user_id}
                    className="rounded-xl border border-[#EFEFEF] p-3.5 flex items-center gap-3"
                    style={{ background: isPendingRemove ? "#FDF0F0" : isConfirming ? "#FDF0F0" : isPendingAdd ? "rgba(62,21,64,0.03)" : "white", transition: "background 0.1s" }}
                    onClick={() => { if (canManage && member.user_id !== userId && !isConfirming && !isPendingRemove && !isPendingAdd) setMobileRevealMemberId(id => id === member.user_id ? null : member.user_id) }}
                  >
                    <MonogramChip initials={getInitials(member.name)} avatarUrl={member.avatar_url} className="w-9 h-9 font-bold text-[10px]" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`text-[13px] font-semibold truncate ${isPendingRemove ? "line-through text-[#9F3030]" : "text-[#13101A]"}`}>{member.name}</p>
                        {member.user_id === userId && <span className="text-[9px] bg-[#3E1540]/8 text-[#3E1540] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0">You</span>}
                        {isPendingRemove && <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", color: "#9F3030", background: "#FDF0F0", border: "1px solid #F0C8C8", borderRadius: 4, padding: "1px 5px" }}>REMOVING</span>}
                        {isPendingAdd && <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", color: "#3E1540", background: "rgba(62,21,64,0.06)", border: "1px solid rgba(62,21,64,0.15)", borderRadius: 4, padding: "1px 5px" }}>ADDING</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {member.role && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide border ${["admin","leader","deacon","elder"].includes(member.role.toLowerCase()) ? "bg-[#3E1540] text-white border-[#3E1540]" : member.role.toLowerCase() === "visitor" ? "bg-white text-[#8A8497] border-[#D8D3C8]" : "bg-[#F3EDE6] text-[#3E1540] border-transparent"}`}>{member.role}</span>}
                        {member.graduation_year && <span className="text-[11px] text-[#8A8497]/50">Class of {member.graduation_year}</span>}
                      </div>
                    </div>
                    {canManage && member.user_id !== userId && (
                      isPendingAdd ? (
                        <button onClick={e => { e.stopPropagation(); unstagePendingAdd(member.user_id) }} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, color: "#8A8497" }}>
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      ) : isPendingRemove ? (
                        <button onClick={e => { e.stopPropagation(); unstageRemoveMember(member.user_id) }} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, color: "#8A8497" }}>
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      ) : isConfirming ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                          <button onClick={e => { e.stopPropagation(); stageRemoveMember(member.user_id) }} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#9F3030" }}>
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); setConfirmRemoveMemberId(null) }} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#8A8497" }}>
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmRemoveMemberId(member.user_id); setMobileRevealMemberId(null) }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, color: "#8A8497", opacity: isRevealed ? 1 : 0, transition: "opacity 0.15s", pointerEvents: isRevealed ? "auto" : "none" }}
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
          </div>
          {isChurch && canManage && (
            <div className="px-5 pb-2">
              <p style={{ fontSize: 11, color: "#8A8497", lineHeight: 1.5 }}>
                Member changes sync to the small group home page if this chat is linked to a group.
              </p>
            </div>
          )}
          {canManage && (
            <div className="px-5 pb-4">
              <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "20px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, marginBottom: "16px" }}>Manage chat</h3>
              <div className="bg-white rounded-2xl border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
                <button onClick={() => { setShowAddMembers(true); loadAllProfiles() }} className="w-full p-4 flex items-center gap-3 hover:bg-[#FBF8F2] transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-[#F3EDE6] flex items-center justify-center flex-shrink-0"><Plus className="w-3.5 h-3.5 text-[#3E1540]" /></div>
                  <span className="flex-1 text-[14px] font-semibold text-[#13101A] text-left">Add Members</span>
                  <ChevronRight className="w-4 h-4 text-[#8A8497]/30" />
                </button>
              </div>
            </div>
          )}
          {(canArchive || canUnarchive || canLeave || canDelete) && (
            <div className="px-5 pb-10 flex flex-col gap-3">
              {canArchive && <button onClick={() => setConfirmAction("archive")} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-[#5A5466] font-semibold text-[13px] hover:bg-[#FBF8F2] transition-colors border border-[#ECE8DE]">Archive chat</button>}
              {canUnarchive && <button onClick={() => setConfirmAction("unarchive")} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-[#5A5466] font-semibold text-[13px] hover:bg-[#FBF8F2] transition-colors border border-[#ECE8DE]">Unarchive chat</button>}
              {canLeave && <button onClick={handleLeave} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-[#5A5466] font-semibold text-[13px] hover:bg-[#FBF8F2] transition-colors border border-[#ECE8DE]">Leave chat</button>}
              {canDelete && <button onClick={() => setConfirmAction("delete")} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-[#B0413E] font-semibold text-[13px] border border-red-200">Delete chat</button>}
              {confirmAction && (
                <div style={{ background: "#FDF0F0", border: "1px solid #F0C8C8", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <p style={{ fontSize: 13, color: "#5A5466", flex: 1, margin: 0 }}>
                    {confirmAction === "archive" ? "Archive this chat? Members won't be able to send new messages." :
                     confirmAction === "unarchive" ? "Unarchive this chat and allow messages again?" :
                     "Delete this chat and all its messages? This cannot be undone."}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    <button onClick={() => setConfirmAction(null)} style={{ fontSize: 13, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Cancel</button>
                    <button
                      onClick={() => { if (confirmAction === "archive") handleArchive(); else if (confirmAction === "unarchive") handleUnarchive(); else handleDelete() }}
                      style={{ height: 32, padding: "0 14px", background: "#9F3030", color: "#FBF8F2", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}
                    >
                      {confirmAction === "archive" ? "Archive" : confirmAction === "unarchive" ? "Unarchive" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
    </div>
  )
}

export function ChatScreen({ groupId, groupName, userId, userName, ministryId, userRole, onClose, onRead, onNameChange, inline = false }: ChatScreenProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState("")
  const [sending, setSending] = useState(false)
  const [displayName, setDisplayName] = useState(groupName)
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
  const [forwardingMsg, setForwardingMsg] = useState<Message | null>(null)
  const [forwardGroups, setForwardGroups] = useState<{ id: string; name: string }[]>([])
  const [forwardSentTo, setForwardSentTo] = useState<string | null>(null)
  const [showComposerEmojiPicker, setShowComposerEmojiPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; avatarUrl: string | null }>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const profilesCache = useRef<Record<string, string>>({ [userId]: userName })
  const avatarCache = useRef<Record<string, string | null>>({})
  const messagesRef = useRef<Message[]>([])
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
  const [pinnedMessage, setPinnedMessage] = useState<{ id: string; content: string; sender_name: string; attachment_url?: string | null; attachment_type?: string | null } | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingAttachment, setPendingAttachment] = useState<{ file: File; previewUrl: string } | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionMembers, setMentionMembers] = useState<{ id: string; name: string }[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  // GIFs
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [gifSearch, setGifSearch] = useState("")
  const [gifResults, setGifResults] = useState<{ id: string; previewUrl: string; fullUrl: string }[]>([])
  const [gifLoading, setGifLoading] = useState(false)
  const gifDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Departed members — show "left" indicator on their messages
  const [departedIds, setDepartedIds] = useState<Set<string>>(new Set())
  // Link previews
  const [linkPreviews, setLinkPreviews] = useState<Record<string, { title: string | null; description: string | null; image: string | null; hostname: string; url: string }>>({})

  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase().trim()
    return messages
      .filter(m => !m.deleted && m.content.toLowerCase().includes(q))
      .map(m => m.id)
  }, [messages, searchQuery])

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return mentionMembers.filter(m => m.name.split(" ")[0].toLowerCase().startsWith(q)).slice(0, 5)
  }, [mentionQuery, mentionMembers])

  const isAdminOrLeader = ["admin", "leader", "deacon", "elder"].includes(userRole.toLowerCase())
  const canPin = !groupArchived && (isAdminOrLeader || groupType !== "church")

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function renderMentions(content: string, isOwn: boolean): React.ReactNode {
    const parts = content.split(/(@\S+)/g)
    return <>{parts.map((part, i) =>
      part.startsWith("@")
        ? <span key={i} style={{ fontWeight: 700, color: isOwn ? "#F6C96A" : "#8B5E1A" }}>{part}</span>
        : part
    )}</>
  }

  // Load group members for @mention autocomplete
  useEffect(() => {
    async function loadGroupMembers() {
      const { data } = await supabase
        .from("group_members")
        .select("user_id, profiles!user_id(name)")
        .eq("group_id", groupId)
      if (data) {
        const members = data
          .map((m: { user_id: string; profiles: { name: string } | { name: string }[] | null }) => {
            const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
            return p ? { id: m.user_id, name: p.name } : null
          })
          .filter((m): m is { id: string; name: string } => m !== null && m.id !== userId)
        setMentionMembers(members)
      }
    }
    loadGroupMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Load trending GIFs when GIF picker opens
  useEffect(() => {
    if (!showGifPicker) return
    if (gifResults.length > 0) return
    handleGifSearch("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGifPicker])

  // Debounced GIF search
  useEffect(() => {
    if (!showGifPicker) return
    if (gifDebounceRef.current) clearTimeout(gifDebounceRef.current)
    gifDebounceRef.current = setTimeout(() => handleGifSearch(gifSearch), 400)
    return () => { if (gifDebounceRef.current) clearTimeout(gifDebounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gifSearch, showGifPicker])

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
  type PMsg = Message & { _voteGroup?: string[] }
  const processedMessages = useMemo((): PMsg[] => {
    const result: PMsg[] = []
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

  function scrollToMessage(id: string) {
    messageRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  function handlePointerDown(msg: Message) {
    if (msg.deleted) return
    longPressFiredRef.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFiredRef.current = true
      longPressTimer.current = null
      setContextMenuFor(msg.id)
    }, 400)
  }

  function handlePointerUp(msg: Message) {
    if (msg.deleted) return
    if (longPressTimer.current !== null) {
      // Timer still pending — this is a short tap, open emoji picker
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
      setEmojiPickerFor((prev) => (prev === msg.id ? null : msg.id))
    }
    // If timer already fired (long press), do nothing here
  }

  function handlePointerCancel() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  async function handleDeleteMessage(msgId: string) {
    setDeletingId(null)
    setContextMenuFor(null)
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, deleted: true, content: "" } : m))
    setReactions((prev) => { const next = { ...prev }; delete next[msgId]; return next })
    await supabase.from("messages").delete().eq("id", msgId).eq("sender_id", userId)
  }

  async function handleDeletePoll(msgId: string, pollId: string) {
    setPollMenuFor(null)
    setMessages(prev => prev.filter(m => m.id !== msgId))
    await supabase.from("poll_votes").delete().eq("poll_id", pollId)
    await supabase.from("polls").delete().eq("id", pollId)
    await supabase.from("messages").delete().eq("id", msgId)
  }

  async function handleEditMessage() {
    const trimmed = editText.trim()
    const id = editingId
    if (!trimmed || !id) return
    setEditingId(null)
    setEditText("")
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, content: trimmed, is_edited: true } : m))
    await supabase.from("messages").update({ content: trimmed, is_edited: true, edited_at: new Date().toISOString() }).eq("id", id).eq("sender_id", userId)
  }

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

  async function openForwardSheet(msg: Message) {
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
  }

  function stagePendingAttachment(file: File) {
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl)
    setPendingAttachment({ file, previewUrl: URL.createObjectURL(file) })
  }

  function clearPendingAttachment() {
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl)
    setPendingAttachment(null)
  }

  async function handlePin(msgId: string) {
    setContextMenuFor(null)
    const msg = messages.find(m => m.id === msgId)
    setPinnedMessageId(msgId)
    if (msg) setPinnedMessage({ id: msg.id, content: msg.content, sender_name: msg.sender_name, attachment_url: msg.attachment_url ?? null, attachment_type: msg.attachment_type ?? null })
    await supabase.from("groups").update({ pinned_message_id: msgId }).eq("id", groupId).eq("ministry_id", ministryId)
  }

  async function handleUnpin() {
    setPinnedMessageId(null)
    setPinnedMessage(null)
    await supabase.from("groups").update({ pinned_message_id: null }).eq("id", groupId).eq("ministry_id", ministryId)
  }

  function handleMentionSelect(name: string) {
    const firstName = name.split(" ")[0]
    const el = textareaRef.current
    const pos = el?.selectionStart ?? inputText.length
    const before = inputText.slice(0, pos)
    const after = inputText.slice(pos)
    const atIdx = before.lastIndexOf("@")
    const newText = before.slice(0, atIdx) + `@${firstName} ` + after
    setInputText(newText)
    setMentionQuery(null)
    requestAnimationFrame(() => el?.focus())
  }

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

  async function handleGifSearch(query: string) {
    setGifLoading(true)
    try {
      const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY
      const endpoint = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(query)}&limit=24&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=g`
      const res = await fetch(endpoint)
      const json = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setGifResults((json.data ?? []).map((g: any) => ({
        id: g.id,
        previewUrl: g.images?.fixed_height_small?.url ?? g.images?.preview_gif?.url ?? "",
        fullUrl: g.images?.original?.url ?? "",
      })))
    } catch { /* swallow */ }
    setGifLoading(false)
  }

  function handleSendGif(fullUrl: string) {
    setShowGifPicker(false)
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
  }

  // ─────────────────────────────────────────────────────────────────────────

  // Load departed members for this ministry — drives the "left" indicator
  useEffect(() => {
    supabase
      .from("ministry_departures")
      .select("user_id")
      .eq("ministry_id", ministryId)
      .then(({ data }) => {
        setDepartedIds(new Set((data ?? []).map((d: { user_id: string }) => d.user_id)))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Fetch group type + archived status + pinned message
  useEffect(() => {
    supabase
      .from("groups")
      .select("type, archived, pinned_message_id")
      .eq("id", groupId)
      .single()
      .then(async ({ data }) => {
        if (data) {
          setGroupType(data.type)
          setGroupArchived(data.archived ?? false)
          if (data.pinned_message_id) {
            setPinnedMessageId(data.pinned_message_id)
            const { data: pmsg } = await supabase
              .from("messages")
              .select("id, content, attachment_url, attachment_type, profiles!sender_id(name)")
              .eq("id", data.pinned_message_id)
              .maybeSingle()
            if (pmsg) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const p = Array.isArray((pmsg as any).profiles) ? (pmsg as any).profiles[0] : (pmsg as any).profiles
              setPinnedMessage({ id: pmsg.id, content: pmsg.content, sender_name: (p as { name: string } | null)?.name ?? "Unknown", attachment_url: (pmsg as { attachment_url?: string | null }).attachment_url ?? null, attachment_type: (pmsg as { attachment_type?: string | null }).attachment_type ?? null })
            }
          }
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Load other members' last_read_at for read receipts
  useEffect(() => {
    async function loadMemberReadStates() {
      const { data } = await supabase
        .from("group_members")
        .select("user_id, last_read_at, profiles!user_id(name, avatar_url)")
        .eq("group_id", groupId)
        .neq("user_id", userId)

      if (data) {
        const map: Record<string, { name: string; lastReadAt: string | null; avatarUrl: string | null }> = {}
        for (const m of data) {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          const prof = p as { name: string; avatar_url: string | null } | null
          map[m.user_id] = { name: prof?.name ?? "?", lastReadAt: m.last_read_at, avatarUrl: prof?.avatar_url ?? null }
        }
        setMemberReadMap(map)
      }
    }
    loadMemberReadStates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Realtime: update memberReadMap when other members mark messages read
  useEffect(() => {
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
  }, [groupId, userId])

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

  // Mark messages as read on open and again on close (clears badges for messages received while inside)
  useEffect(() => {
    const markRead = () =>
      supabase
        .from("group_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .then(() => { if (onRead) onRead() })

    markRead()
    return () => { markRead() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Load last 50 messages
  useEffect(() => {
    async function loadMessages() {
      const { data } = await supabase
        .from("messages")
        .select("id, group_id, sender_id, content, created_at, reply_to_id, message_type, is_edited, attachment_url, attachment_type, attachment_name, attachment_size, poll_id, profiles!sender_id(name, avatar_url), reply_to:reply_to_id(id, content, profiles!sender_id(name))")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(50)

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched: Message[] = data.map((m: any) => {
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
            reply_to_content: replyRaw?.content ?? null,
            reply_to_sender: (replyProfile as { name: string } | null)?.name ?? null,
            message_type: m.message_type ?? "user",
            is_edited: (m as { is_edited?: boolean }).is_edited ?? false,
            attachment_url: (m as { attachment_url?: string | null }).attachment_url ?? null,
            attachment_type: (m as { attachment_type?: string | null }).attachment_type ?? null,
            attachment_name: (m as { attachment_name?: string | null }).attachment_name ?? null,
            attachment_size: (m as { attachment_size?: number | null }).attachment_size ?? null,
            poll_id: (m as { poll_id?: string | null }).poll_id ?? null,
          }
        })
        setMessages(enriched)

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

  // Keep messagesRef current so realtime callbacks can look up reply content
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

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
              replyToContent = cached.content
              replyToSender = cached.sender_name
            } else {
              const { data: rMsg } = await supabase
                .from("messages")
                .select("content, profiles!sender_id(name)")
                .eq("id", raw.reply_to_id)
                .single()
              if (rMsg) {
                replyToContent = rMsg.content
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

  // Auto-scroll on new messages (suppressed while in search mode)
  useEffect(() => {
    if (!searchMode) scrollToBottom()
  }, [messages, scrollToBottom, searchMode])

  // Scroll to the current search match
  useEffect(() => {
    if (searchMatches.length === 0) return
    const matchId = searchMatches[searchMatchIndex]
    if (matchId) messageRefs.current[matchId]?.scrollIntoView({ behavior: "smooth", block: "center" })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMatchIndex, searchMatches])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInputText(val)
    // Auto-resize textarea to fit content
    const el = e.target
    el.style.height = "auto"
    el.style.height = el.scrollHeight + "px"
    // @mention detection
    const pos = e.target.selectionStart ?? val.length
    const before = val.slice(0, pos)
    const atMatch = before.match(/@(\w*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setMentionIndex(0)
    } else if (mentionQuery !== null) {
      setMentionQuery(null)
    }
    if (typingChannelRef.current && val.trim()) {
      typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: true } })
      if (myTypingTimeoutRef.current) clearTimeout(myTypingTimeoutRef.current)
      myTypingTimeoutRef.current = setTimeout(() => {
        typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: false } })
      }, 2500)
    }
  }

  async function handleSend() {
    const content = inputText.trim()
    const pa = pendingAttachment
    if (!content && !pa) return
    if (sending || groupArchived) return

    // Clear own typing status
    if (myTypingTimeoutRef.current) clearTimeout(myTypingTimeoutRef.current)
    typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: false } })

    setSending(true)
    setInputText("")
    setMentionQuery(null)
    setPendingAttachment(null)
    if (pa) URL.revokeObjectURL(pa.previewUrl)
    // Reset textarea height after clearing
    if (textareaRef.current) { textareaRef.current.style.height = "auto" }

    const replyTarget = replyingTo
    setReplyingTo(null)

    // Attachment message (with optional caption)
    if (pa) {
      setUploading(true)
      const ext = pa.file.name.split(".").pop() ?? "bin"
      const path = `${groupId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data: storageData, error } = await supabase.storage
        .from("chat-attachments")
        .upload(path, pa.file, { cacheControl: "3600", upsert: false })
      if (!error && storageData) {
        const { data: { publicUrl } } = supabase.storage.from("chat-attachments").getPublicUrl(path)
        const optimisticId = `optimistic-att-${Date.now()}`
        const optimisticMsg: Message = {
          id: optimisticId, group_id: groupId, sender_id: userId,
          content, created_at: new Date().toISOString(), sender_name: userName,
          reply_to_id: replyTarget?.id ?? null, reply_to_content: replyTarget?.content ?? null,
          reply_to_sender: replyTarget?.sender_name ?? null,
          message_type: "user", attachment_url: publicUrl,
          attachment_type: pa.file.type, attachment_name: pa.file.name, attachment_size: pa.file.size,
        }
        setMessages(prev => [...prev, optimisticMsg])
        const { data } = await supabase.from("messages").insert({
          group_id: groupId, sender_id: userId, content,
          reply_to_id: replyTarget?.id ?? null,
          attachment_url: publicUrl, attachment_type: pa.file.type,
          attachment_name: pa.file.name, attachment_size: pa.file.size,
        }).select("id").single()
        if (data) setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.id } : m))
      }
      setUploading(false)
      setSending(false)
      return
    }

    // Text-only message
    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: Message = {
      id: optimisticId, group_id: groupId, sender_id: userId, content,
      created_at: new Date().toISOString(), sender_name: userName,
      reply_to_id: replyTarget?.id ?? null,
      reply_to_content: replyTarget?.content ?? null,
      reply_to_sender: replyTarget?.sender_name ?? null,
    }
    setMessages((prev) => [...prev, optimisticMsg])

    const { data, error } = await supabase
      .from("messages")
      .insert({ group_id: groupId, sender_id: userId, content, reply_to_id: replyTarget?.id ?? null })
      .select("id")
      .single()

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
    } else if (data) {
      setMessages((prev) => prev.map((m) => m.id === optimisticId ? { ...m, id: data.id } : m))
    }
    setSending(false)
  }

  function insertEmojiAtCursor(native: string) {
    const el = textareaRef.current
    const start = el?.selectionStart ?? inputText.length
    const end = el?.selectionEnd ?? inputText.length
    const newText = inputText.slice(0, start) + native + inputText.slice(end)
    setInputText(newText)
    requestAnimationFrame(() => {
      if (el) {
        const pos = start + native.length
        el.selectionStart = pos
        el.selectionEnd = pos
        el.focus()
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionQuery !== null && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredMentions.length - 1)); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); handleMentionSelect(filteredMentions[mentionIndex].name); return }
      if (e.key === "Escape") { setMentionQuery(null); return }
    }
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr)
    const today = new Date()
    const isToday = date.toDateString() === today.toDateString()
    const month = date.toLocaleString("en-US", { month: "long" }).toUpperCase()
    const day = date.getDate()
    return isToday ? `TODAY · ${month} ${day}` : `${date.toLocaleString("en-US", { weekday: "short" }).toUpperCase()} · ${month} ${day}`
  }

  function groupedReactions(msgId: string) {
    const list = reactions[msgId] ?? []
    const map: Record<string, { count: number; userReacted: boolean }> = {}
    for (const rx of list) {
      if (!map[rx.emoji]) map[rx.emoji] = { count: 0, userReacted: false }
      map[rx.emoji].count++
      if (rx.user_id === userId) map[rx.emoji].userReacted = true
    }
    return Object.entries(map).map(([emoji, v]) => ({ emoji, ...v }))
  }

  // For each own message: which other members have it as their most-recently-read own message
  const readReceiptMap = useMemo(() => {
    const map: Record<string, { name: string; avatarUrl: string | null }[]> = {}
    const ownMsgs = messages.filter((m) => m.sender_id === userId)
    if (ownMsgs.length === 0) return map
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
    return map
  }, [messages, memberReadMap, userId])

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

  function highlightText(text: string, query: string, isCurrent: boolean): React.ReactNode {
    const q = query.toLowerCase().trim()
    if (!q) return text
    const lower = text.toLowerCase()
    const parts: React.ReactNode[] = []
    let i = 0
    let key = 0
    while (i < text.length) {
      const idx = lower.indexOf(q, i)
      if (idx === -1) { parts.push(text.slice(i)); break }
      if (idx > i) parts.push(text.slice(i, idx))
      parts.push(
        <mark key={key++} style={{ background: isCurrent ? "#D4A45C" : "rgba(212,164,92,0.45)", color: "#13101A", borderRadius: 2, padding: "0 1px" }}>
          {text.slice(idx, idx + q.length)}
        </mark>
      )
      i = idx + q.length
    }
    return <>{parts}</>
  }

  async function handleReact(messageId: string, emoji: string) {
    setEmojiPickerFor(null)
    const existing = (reactions[messageId] ?? []).find(
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
  }

  const memberCount = Object.keys(memberReadMap).length + 1
  const memberFirstNames = useMemo(() => {
    const others = Object.values(memberReadMap).map(m => m.name.split(" ")[0])
    return [userName.split(" ")[0], ...others]
  }, [memberReadMap, userName])

  return (
    <>
    <AnimateIn animate={!inline} className={inline ? "flex flex-col h-full bg-[var(--cream)] w-full" : "fixed inset-0 z-[100] bg-[#FBF8F2] flex flex-col md:left-[var(--shell-offset)]"}>
    <div className={inline ? "w-full h-full flex flex-col" : "max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none"}>

      {/* ── Top bar ── */}
      <div className={`flex-shrink-0 flex items-center gap-3 px-4 md:px-6 ${inline ? "py-3 md:pt-5 md:pb-3" : "pt-12 pb-3 md:py-3.5 border-b border-[#E8E2D2]"} bg-[var(--cream)]`}>
        {searchMode ? (
          <>
            {/* Search bar mode */}
            <button
              onClick={closeSearch}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}
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
              className="flex-1 bg-transparent outline-none text-[14px] text-[#13101A] placeholder:text-[#A09A8C] min-w-0"
            />
            {searchQuery.trim() && (
              <span style={{ fontSize: "12px", color: "#8A8497", whiteSpace: "nowrap", flexShrink: 0 }}>
                {searchMatches.length === 0 ? "No results" : `${searchMatchIndex + 1} / ${searchMatches.length}`}
              </span>
            )}
            {searchMatches.length > 0 && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={goToPrevMatch} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", cursor: "pointer", display: "grid", placeItems: "center" }}>
                  <ChevronUp size={12} />
                </button>
                <button onClick={goToNextMatch} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", cursor: "pointer", display: "grid", placeItems: "center" }}>
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
                <ArrowLeft className="w-5 h-5 text-[#13101A]" />
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
                <h2 className="truncate leading-none" style={{ fontFamily: "var(--serif)", fontSize: "16px", color: "#13101A", letterSpacing: "-0.01em" }}>{displayName}</h2>
                <div className="hidden md:flex items-center flex-shrink-0">
                  {memberFirstNames.slice(0, 4).map((name, i) => (
                    <span
                      key={i}
                      style={{
                        width: 16, height: 16, borderRadius: 99,
                        background: "var(--plum)",
                        color: "#FBF8F2", fontSize: 9, fontWeight: 600,
                        display: "inline-grid", placeItems: "center",
                        marginLeft: i ? -4 : 0,
                        border: "1.5px solid #FBF8F2",
                        flexShrink: 0,
                      }}
                    >{name.charAt(0).toUpperCase()}</span>
                  ))}
                </div>
                <p className="hidden md:block text-[12px] text-[#8A8497] truncate">
                  {memberCount} member{memberCount !== 1 ? "s" : ""} · {memberFirstNames.join(", ")}
                </p>
              </div>
              <p className="md:hidden text-[12px] text-[#8A8497] mt-0.5">
                {memberCount} member{memberCount !== 1 ? "s" : ""}
              </p>
            </div>
            {/* Desktop action buttons — Search + User only */}
            <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
              <button onClick={openSearch} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <Search size={14} />
              </button>
              <button onClick={() => setShowSettings(true)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <User size={14} />
              </button>
            </div>
            {/* Mobile: search + settings */}
            <div className="flex items-center gap-1 flex-shrink-0 md:hidden">
              <button onClick={openSearch} className="p-1.5 hover:bg-[#F2EDE0] rounded-lg transition-colors">
                <Search className="w-4 h-4 text-[#8A8497]" />
              </button>
              <button onClick={() => setShowSettings(true)} className="p-1 hover:bg-[#F2EDE0] rounded-lg transition-colors">
                <Settings className="w-5 h-5 text-[#8A8497]" />
              </button>
            </div>
          </>
        )}
      </div>
      {inline && <div className="hidden md:block"><InsetHairline style={{ margin: "0 16px" }} /></div>}

      {/* ── Pinned message banner ── */}
      {pinnedMessage && (
        <div
          className="flex-shrink-0 border-b border-[#E8E2D2] bg-[#F8F4EA] px-4 py-2 flex items-center gap-2.5 cursor-pointer"
          onClick={() => scrollToMessage(pinnedMessage.id)}
        >
          <Pin className="w-3.5 h-3.5 text-[#3E1540] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-[#3E1540]">{pinnedMessage.sender_name}</p>
            <p className="text-[12px] text-[#5A5466] truncate">
              {pinnedMessage.content || (pinnedMessage.attachment_type?.startsWith("image/") ? "📷 Photo" : "📎 Attachment")}
            </p>
          </div>
          {canPin && (
            <button
              onClick={(e) => { e.stopPropagation(); handleUnpin() }}
              className="flex-shrink-0 p-1 text-[#C4C4C4] hover:text-[#5A5466] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
        {loading ? (
          <Spinner />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-[14px] font-semibold text-[#13101A]/40">No messages yet</p>
              <p className="text-[12px] text-[#8A8497]/40 mt-1">Say hello! 👋</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {processedMessages.map((msg, i) => {
              const isOwn = msg.sender_id === userId
              const prevMsg = i > 0 ? processedMessages[i - 1] : null
              const nextMsg = i < processedMessages.length - 1 ? processedMessages[i + 1] : null

              const sameMinute = (a: Message, b: Message) =>
                a.message_type !== "system" && b.message_type !== "system" &&
                a.message_type !== "poll" && b.message_type !== "poll" &&
                a.sender_id === b.sender_id &&
                Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 60000

              const isFirstInGroup = !prevMsg || !sameMinute(msg, prevMsg)
              const isLastInGroup = !nextMsg || !sameMinute(msg, nextMsg)

              // Date separator
              const prevDate = prevMsg ? new Date(prevMsg.created_at).toDateString() : null
              const thisDate = new Date(msg.created_at).toDateString()
              const showDateSep = !prevMsg || prevDate !== thisDate

              const incomingRadius = isFirstInGroup && isLastInGroup
                ? "rounded-[14px] rounded-tl-[4px]"
                : isFirstInGroup
                  ? "rounded-[14px] rounded-tl-[4px] rounded-bl-[6px]"
                  : isLastInGroup
                    ? "rounded-[14px] rounded-tl-[6px]"
                    : "rounded-[14px] rounded-l-[6px]"
              const outgoingRadius = isFirstInGroup && isLastInGroup
                ? "rounded-[14px] rounded-tr-[4px]"
                : isFirstInGroup
                  ? "rounded-[14px] rounded-tr-[4px] rounded-br-[6px]"
                  : isLastInGroup
                    ? "rounded-[14px] rounded-tr-[6px]"
                    : "rounded-[14px] rounded-r-[6px]"

              const rxGroups = groupedReactions(msg.id)
              const groupGap = isFirstInGroup && i > 0 && !showDateSep ? "mt-3" : ""

              // Poll message — full-width card with vote buttons
              if (msg.message_type === "poll" && msg.poll_id) {
                const poll = pollsData[msg.poll_id]
                const userVote = pollVotes[msg.poll_id]
                const isChanging = changingVotePollIds.has(msg.poll_id)
                const counts = pollCounts[msg.poll_id] ?? []
                const totalVotes = counts.reduce((s, c) => s + c, 0)
                const hasVoted = userVote !== undefined && !isChanging

                return (
                  <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el }}>
                    {showDateSep && (
                      <div className="flex justify-center my-6">
                        <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "13px", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
                          {formatDateLabel(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col items-center mt-4 mb-1">
                      <div className="w-full max-w-[290px] bg-white border border-[#E8E2D2] rounded-2xl overflow-hidden shadow-sm">
                        {poll ? (
                          <>
                            {/* Card header */}
                            <div className="px-4 pt-4 pb-3 border-b border-[#F0EDE6] flex items-start gap-2">
                              <div className="flex-1 text-center">
                                <p className="text-[15px] font-bold text-[#13101A] leading-snug">{poll.question}</p>
                                <p className="text-[11px] text-[#8A8497] mt-0.5">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
                              </div>
                              {/* Delete button — visible to creator or admin/leader */}
                              {(msg.sender_id === userId || isAdminOrLeader) && (
                                <div className="relative flex-shrink-0 -mt-1 -mr-1">
                                  <button
                                    onClick={e => { e.stopPropagation(); setPollMenuFor(pollMenuFor === msg.id ? null : msg.id) }}
                                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#F0EDE6] transition-colors"
                                  >
                                    <MoreHorizontal className="w-3.5 h-3.5 text-[#8A8497]" />
                                  </button>
                                  {pollMenuFor === msg.id && (
                                    <div className="absolute right-0 top-8 z-10 bg-white rounded-xl border border-[#E8E2D2] shadow-lg overflow-hidden min-w-[130px]">
                                      <button
                                        onClick={() => handleDeletePoll(msg.id, msg.poll_id!)}
                                        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium text-red-500 hover:bg-[#FEF2F2] transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete poll
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {/* Preview — first 3 options, read-only */}
                            <div className="px-4 pt-3 pb-2 flex flex-col gap-2.5">
                              {poll.options.slice(0, 3).map((opt, oi) => {
                                const count = counts[oi] ?? 0
                                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
                                const isSelected = userVote === oi
                                return (
                                  <div key={oi}>
                                    <div className="flex items-center justify-between mb-1">
                                      {hasVoted ? (
                                        <>
                                          <span className={`text-[13px] font-semibold ${isSelected ? "text-[#3E1540]" : "text-[#13101A]"}`}>{opt}</span>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            {isSelected && <Check className="w-3 h-3 text-[#3E1540]" />}
                                            <span className={`text-[12px] font-semibold ${isSelected ? "text-[#3E1540]" : "text-[#8A8497]"}`}>{count}</span>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <div className="w-3.5 h-3.5 rounded-full border-2 border-[#D8D3C8] flex-shrink-0" />
                                          <span className="text-[13px] text-[#13101A]">{opt}</span>
                                        </div>
                                      )}
                                    </div>
                                    {hasVoted && (
                                      <div className="h-1.5 w-full rounded-full bg-[#F0EDE6] overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: isSelected ? "#3E1540" : "#C4BDB8" }} />
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                              {poll.options.length > 3 && (
                                <p className="text-[12px] text-[#8A8497] mt-0.5">and {poll.options.length - 3} more option{poll.options.length - 3 !== 1 ? "s" : ""}…</p>
                              )}
                            </div>
                            <div className="px-4 pb-4 pt-1">
                              <button
                                onClick={() => {
                                  setPollMenuFor(null)
                                  setPendingVoteOption(undefined)
                                  if (hasVoted) setChangingVotePollIds(prev => new Set([...prev, msg.poll_id!]))
                                  setVotingPollId(msg.poll_id!)
                                }}
                                className={`w-full py-2.5 rounded-xl transition-all text-[13px] font-semibold ${hasVoted ? "bg-[#F4F1E8] hover:bg-[#ECE8DE] text-[#5A5466]" : "bg-[#3E1540] hover:bg-[#2D0F2E] text-white"}`}
                              >
                                {hasVoted ? "Change vote" : "Vote"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="px-4 py-4 flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-[#3E1540] border-t-transparent rounded-full animate-spin" />
                            <span className="text-[13px] text-[#8A8497]">Loading poll…</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-[#B0A9A0] mt-1.5">{formatMessageTime(msg.created_at)}</p>
                    </div>
                  </div>
                )
              }

              // System message — centered event note, no bubble
              if (msg.message_type === "system") {
                const voteGroup = (msg as PMsg)._voteGroup
                let displayContent = msg.content
                if (voteGroup && voteGroup.length > 1) {
                  if (voteGroup.length <= 3) displayContent = `${voteGroup.join(", ")} voted in the poll`
                  else displayContent = `${voteGroup.slice(0, 2).join(", ")} and ${voteGroup.length - 2} others voted in the poll`
                }
                return (
                  <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el }}>
                    {showDateSep && (
                      <div className="flex justify-center my-6">
                        <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "13px", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
                          {formatDateLabel(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 my-2 px-1">
                      <div className="flex-1 h-px bg-[#E8E2D2]/70" />
                      <span style={{ fontSize: "12px", color: "#8A8497", fontStyle: "italic", whiteSpace: "nowrap", maxWidth: "72%" }} className="text-center select-none">
                        {displayContent}
                      </span>
                      <div className="flex-1 h-px bg-[#E8E2D2]/70" />
                    </div>
                  </div>
                )
              }

              return (
                <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el }}>
                  {/* Date separator */}
                  {showDateSep && (
                    <div className="flex justify-center my-6">
                      <span style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: "13px", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
                        {formatDateLabel(msg.created_at)}
                      </span>
                    </div>
                  )}

                  <div className={`flex flex-col relative ${isOwn ? "items-end" : "items-start"} ${groupGap}`}>
                    {/* Emoji picker */}
                    {emojiPickerFor === msg.id && (
                      <div
                        className={`absolute z-[160] ${i === 0 ? "top-[calc(100%-4px)]" : "bottom-[calc(100%-4px)]"} ${isOwn ? "right-0" : "left-0"}`}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-[#EFEFEF] px-3 py-2.5 flex gap-3 items-center">
                          {REACTION_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={(e) => { e.stopPropagation(); handleReact(msg.id, emoji) }}
                              onPointerDown={(e) => e.stopPropagation()}
                              onPointerUp={(e) => e.stopPropagation()}
                              className="text-[22px] hover:scale-125 active:scale-95 transition-transform"
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            onClick={(e) => { e.stopPropagation(); setEmojiPickerFor(null); setFullReactionPickerFor(msg.id) }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="w-7 h-7 rounded-full bg-[#F4F1E8] flex items-center justify-center text-[#5A5466] hover:bg-[#ECE8DE] transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {fullReactionPickerFor === msg.id && (
                          <div className={`absolute z-[161] ${i === 0 ? "top-[calc(100%+4px)]" : "bottom-[calc(100%+4px)]"} ${isOwn ? "right-0" : "left-0"}`} onPointerDown={(e) => e.stopPropagation()}>
                            <Picker data={data} onEmojiSelect={(e: { native: string }) => { handleReact(msg.id, e.native); setFullReactionPickerFor(null) }} theme="light" previewPosition="none" skinTonePosition="none" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Context menu */}
                    {contextMenuFor === msg.id && (
                      <div
                        className={`absolute z-[160] ${i === 0 ? "top-[calc(100%+4px)]" : "bottom-[calc(100%+4px)]"} ${isOwn ? "right-0" : "left-0"}`}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="bg-white rounded-2xl shadow-lg border border-[#EFEFEF] overflow-hidden min-w-[160px]">
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setContextMenuFor(null); setReplyingTo(msg) }}
                            className="w-full text-left px-4 py-3 text-[14px] text-[#13101A] flex items-center gap-2.5 hover:bg-[#FBF8F2] active:bg-[#F3EDE6] transition-colors border-b border-[#F3EDE6]"
                          >
                            <CornerUpLeft className="w-4 h-4 text-[#5A5466]" />
                            Reply
                          </button>
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); openForwardSheet(msg) }}
                            className="w-full text-left px-4 py-3 text-[14px] text-[#13101A] flex items-center gap-2.5 hover:bg-[#FBF8F2] active:bg-[#F3EDE6] transition-colors border-b border-[#F3EDE6]"
                          >
                            <Forward className="w-4 h-4 text-[#5A5466]" />
                            Forward
                          </button>
                          {!msg.deleted && canPin && (
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); pinnedMessageId === msg.id ? handleUnpin() : handlePin(msg.id) }}
                              className="w-full text-left px-4 py-3 text-[14px] text-[#13101A] flex items-center gap-2.5 hover:bg-[#FBF8F2] active:bg-[#F3EDE6] transition-colors border-b border-[#F3EDE6]"
                            >
                              <Pin className="w-4 h-4 text-[#5A5466]" />
                              {pinnedMessageId === msg.id ? "Unpin" : "Pin"}
                            </button>
                          )}
                          {isOwn && !msg.deleted && (
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); setContextMenuFor(null); setEditingId(msg.id); setEditText(msg.content) }}
                              className="w-full text-left px-4 py-3 text-[14px] text-[#13101A] flex items-center gap-2.5 hover:bg-[#FBF8F2] active:bg-[#F3EDE6] transition-colors border-b border-[#F3EDE6]"
                            >
                              <Pencil className="w-4 h-4 text-[#5A5466]" />
                              Edit
                            </button>
                          )}
                          {isOwn && (
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); setContextMenuFor(null); setDeletingId(msg.id) }}
                              className="w-full text-left px-4 py-3 text-[14px] text-red-500 flex items-center gap-2.5 hover:bg-red-50 active:bg-red-100 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Pinned indicator */}
                    {msg.id === pinnedMessageId && (
                      <div className={`flex items-center gap-1 mb-0.5 ${isOwn ? "justify-end pr-1" : "justify-start ml-9"}`}>
                        <Pin className="w-3 h-3 text-[#C9A34B]" />
                        <span className="text-[11px] text-[#C9A34B] font-medium">Pinned</span>
                      </div>
                    )}
                    {/* Forwarded indicator */}
                    {msg.message_type === "forwarded" && (
                      <div className={`flex items-center gap-1 mb-0.5 ${isOwn ? "justify-end pr-1" : "justify-start ml-9"}`}>
                        <Forward className="w-3 h-3 text-[#8A8497]" />
                        <span className="text-[11px] text-[#8A8497]">Forwarded</span>
                      </div>
                    )}
                    {!isOwn && isFirstInGroup && (
                      <div className="flex items-baseline gap-1.5 mb-1 ml-9">
                        <span className="text-[13px] font-semibold text-[#13101A]">{msg.sender_name || "Former Member"}</span>
                        {msg.sender_id && departedIds.has(msg.sender_id) && (
                          <span className="text-[11px] text-[#A09A8C] italic">· left the ministry</span>
                        )}
                        <span className="text-[12px] text-[#8A8497]">{formatMessageTime(msg.created_at)}</span>
                      </div>
                    )}

                    {/* Avatar + bubble row */}
                    <div className={`flex items-end gap-2 w-full ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                      {/* Avatar — shown for every incoming message */}
                      {!isOwn && (
                        <MonogramChip
                          initials={(msg.sender_name || "?").charAt(0).toUpperCase()}
                          avatarUrl={!(msg.sender_id && departedIds.has(msg.sender_id)) ? (msg.sender_avatar_url || undefined) : undefined}
                          className="w-7 h-7 text-[11px] font-bold"
                          style={{ alignSelf: "flex-end", opacity: (msg.sender_id && departedIds.has(msg.sender_id)) || !msg.sender_id ? 0.4 : 1 }}
                        />
                      )}

                      <div
                        title="Long-press for reply and reactions"
                        onPointerDown={() => handlePointerDown(msg)}
                        onPointerUp={() => handlePointerUp(msg)}
                        onPointerLeave={handlePointerCancel}
                        onPointerCancel={handlePointerCancel}
                        className={`max-w-[75%] text-[14px] leading-[1.4] select-none overflow-hidden ${
                          msg.deleted
                            ? isOwn
                              ? `bg-[#2D0F2E]/30 text-white/50 ${outgoingRadius} px-4 py-2`
                              : `bg-[#FBF8F2] border border-[#E8E2D2] text-[#8A8497] ${incomingRadius} px-4 py-2`
                            : isOwn
                              ? `bg-[#2D0F2E] text-[#F6F4EF] ${outgoingRadius}`
                              : `bg-[#FBF8F2] border border-[#E8E2D2] text-[#13101A] ${incomingRadius}`
                        } ${!msg.deleted && !msg.reply_to_id && !(msg.attachment_url && msg.attachment_type?.startsWith("image/")) ? "px-4 py-2.5" : ""}`}
                      >
                        {msg.deleted ? (
                          <span className="italic text-[13px]">Message deleted</span>
                        ) : (
                          <>
                            {msg.reply_to_id && msg.reply_to_content && (
                              <div className="px-3 pt-2.5 pb-0">
                                <button
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => scrollToMessage(msg.reply_to_id!)}
                                  className={`w-full text-left px-3 py-1.5 rounded-lg flex flex-col gap-0.5 ${
                                    isOwn
                                      ? "bg-white/10 border-l-[2px] border-[#F6F4EF]/50"
                                      : "bg-[#F1ECDE] border-l-[2px] border-[#3E1540]"
                                  }`}
                                >
                                  <span className={`text-[11px] font-semibold flex items-center gap-1 ${isOwn ? "text-white/90" : "text-[#3E1540]"}`}>
                                    <CornerUpLeft className="w-3 h-3" />
                                    {msg.reply_to_sender}
                                  </span>
                                  <span className={`text-[12px] truncate ${isOwn ? "text-white/70" : "text-[#8A8497]"}`}>
                                    {msg.reply_to_content.slice(0, 80)}
                                  </span>
                                </button>
                              </div>
                            )}
                            {editingId === msg.id ? (
                              <div className="px-3 py-2.5 flex flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
                                <textarea
                                  autoFocus
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditMessage() } else if (e.key === "Escape") { setEditingId(null) } }}
                                  className="w-full resize-none rounded-lg bg-white/10 text-inherit text-[14px] p-2 outline-none border border-white/20 min-h-[60px]"
                                  style={{ fontFamily: "inherit" }}
                                />
                                <div className="flex gap-2 justify-end">
                                  <button onClick={() => setEditingId(null)} className="text-[12px] opacity-60 hover:opacity-100 transition-opacity">Cancel</button>
                                  <button onClick={handleEditMessage} className="text-[12px] font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors">Save</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* Image attachment */}
                                {msg.attachment_url && msg.attachment_type?.startsWith("image/") && (
                                  <div
                                    className={msg.reply_to_id ? "mt-2 mb-0.5" : ""}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); setLightboxUrl(msg.attachment_url!) }}
                                  >
                                    <img
                                      src={msg.attachment_url}
                                      alt="Image"
                                      className="w-full max-h-[280px] object-cover cursor-pointer"
                                    />
                                  </div>
                                )}
                                {/* File attachment */}
                                {msg.attachment_url && msg.attachment_type && !msg.attachment_type.startsWith("image/") && (
                                  <a
                                    href={msg.attachment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2.5 hover:bg-black/5 transition-colors rounded-xl p-1"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isOwn ? "bg-white/10" : "bg-[#F1ECDE]"}`}>
                                      <FileDown className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[13px] font-medium truncate">{msg.attachment_name ?? "File"}</p>
                                      {msg.attachment_size != null && (
                                        <p className={`text-[11px] ${isOwn ? "text-white/50" : "text-[#8A8497]"}`}>{formatFileSize(msg.attachment_size)}</p>
                                      )}
                                    </div>
                                    <FileDown className={`w-4 h-4 flex-shrink-0 ${isOwn ? "text-white/40" : "text-[#C4C4C4]"}`} />
                                  </a>
                                )}
                                {/* Text content */}
                                {msg.content && (() => {
                                  const urlRe = /https?:\/\/[^\s<>"']+/gi
                                  const urls = msg.content.match(urlRe) ?? []
                                  const preview = urls.map(u => linkPreviews[u]).find(p => p && p.title)
                                  return (
                                    <>
                                      <div
                                        className={(msg.reply_to_id || msg.attachment_url) ? "px-4 pt-1.5 pb-2.5" : ""}
                                        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}
                                      >
                                        {searchMode && searchQuery.trim() && searchMatches.includes(msg.id)
                                          ? highlightText(msg.content, searchQuery, searchMatches[searchMatchIndex] === msg.id)
                                          : renderMentions(msg.content, isOwn)}
                                        {msg.is_edited && <span className="text-[10px] ml-1.5 opacity-50">edited</span>}
                                      </div>
                                      {preview && (
                                        <a
                                          href={preview.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onPointerDown={(e) => e.stopPropagation()}
                                          onClick={(e) => e.stopPropagation()}
                                          className={`block mx-3 mb-2 rounded-xl overflow-hidden border text-left transition-opacity hover:opacity-90 ${isOwn ? "border-white/20 bg-white/10" : "border-[#E8E2D2] bg-[#F4F1E8]"}`}
                                          style={{ textDecoration: "none" }}
                                        >
                                          {preview.image && (
                                            <img src={preview.image} alt="" className="w-full max-h-[120px] object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
                                          )}
                                          <div className="px-3 py-2">
                                            <p className={`text-[10px] font-medium uppercase tracking-wide mb-0.5 ${isOwn ? "text-white/50" : "text-[#8A8497]"}`}>{preview.hostname}</p>
                                            {preview.title && <p className={`text-[13px] font-semibold leading-snug ${isOwn ? "text-white" : "text-[#13101A]"}`}>{preview.title.slice(0, 80)}</p>}
                                            {preview.description && <p className={`text-[11px] mt-0.5 line-clamp-2 ${isOwn ? "text-white/60" : "text-[#5A5466]"}`}>{preview.description.slice(0, 120)}</p>}
                                          </div>
                                        </a>
                                      )}
                                    </>
                                  )
                                })()}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Reactions */}
                    {!msg.deleted && rxGroups.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "pr-1" : "pl-9"}`}>
                        {rxGroups.map(({ emoji, count, userReacted }) => (
                          <button
                            key={emoji}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => handleReact(msg.id, emoji)}
                            className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[12px] border transition-all active:scale-95 ${
                              userReacted
                                ? "bg-[#3E1540] border-[#3E1540]"
                                : "bg-white border-[#ECE8DE]"
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className={`text-[11px] font-medium ${userReacted ? "text-[#F6F4EF]" : "text-[#8A8497]"}`}>{count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Delete confirmation */}
                    {deletingId === msg.id && (
                      <div
                        className={`flex items-center gap-2 mt-1 px-1 ${isOwn ? "justify-end" : "justify-start"}`}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <span className="text-[12px] text-[#5A5466]">Delete this message?</span>
                        <button onClick={() => handleDeleteMessage(msg.id)} className="text-[12px] font-semibold text-red-500 hover:text-red-600 transition-colors">Delete</button>
                        <button onClick={() => setDeletingId(null)} className="text-[12px] text-[#8A8497] hover:text-[#5A5466] transition-colors">Cancel</button>
                      </div>
                    )}

                    {/* Timestamp + read receipts (own messages: every message; incoming: skip since time is in header) */}
                    {isOwn && (
                      <div className="flex items-center gap-1.5 mt-1 pr-1">
                        {(readReceiptMap[msg.id]?.length ?? 0) > 0 && (
                          <div className="flex items-center">
                            {readReceiptMap[msg.id].map(({ name, avatarUrl }, idx) => (
                              <MonogramChip
                                key={`${name}-${idx}`}
                                initials={name.charAt(0).toUpperCase()}
                                avatarUrl={avatarUrl || undefined}
                                title={`Read by ${name}`}
                                className={`w-4 h-4 border border-[#F1EDE6] text-[6px] font-bold${idx > 0 ? " -ml-1" : ""}`}
                              />
                            ))}
                          </div>
                        )}
                        <span className="text-[11px] text-[#B0A9A0]">{formatMessageTime(msg.created_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Typing indicators */}
            {Object.entries(typingUsers).slice(0, 3).map(([uid, { name, avatarUrl }]) => (
              <div key={uid} className="flex items-center gap-2 mt-3">
                <MonogramChip initials={name.charAt(0).toUpperCase()} avatarUrl={avatarUrl || undefined} className="w-7 h-7 text-[11px] font-bold" />
                <div className="bg-[#FBF8F2] border border-[#E8E2D2] rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
                <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "12px", color: "#8A8497" }}>{name} is typing…</span>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Reply preview bar ── */}
      {replyingTo && (
        <div className="flex-shrink-0 bg-[var(--cream)] px-4 py-2 flex items-start gap-3">
          <div className="flex-1 border-l-2 border-[#3E1540] pl-2.5 min-w-0">
            <p className="text-[11px] font-semibold text-[#3E1540] flex items-center gap-1 mb-0.5">
              <CornerUpLeft className="w-3 h-3 flex-shrink-0" />
              {replyingTo.sender_name}
            </p>
            <p className="text-[12px] text-[#8A8497] truncate">{replyingTo.content.slice(0, 60)}</p>
          </div>
          <button onClick={() => setReplyingTo(null)} className="flex-shrink-0 mt-0.5 text-[#C4C4C4] hover:text-[#5A5466] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Attachment preview bar ── */}
      {pendingAttachment && (
        <div className="flex-shrink-0 bg-[var(--cream)] px-4 py-3 flex items-center gap-3">
          {pendingAttachment.file.type.startsWith("image/") ? (
            <>
              <div className="relative flex-shrink-0">
                <img
                  src={pendingAttachment.previewUrl}
                  alt="Preview"
                  className="w-16 h-16 rounded-xl object-cover border border-[#E8E2D2]"
                />
                <button
                  onClick={clearPendingAttachment}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#13101A] flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
              <p className="text-[12px] text-[#8A8497] flex-1">Add a caption or press send</p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-xl bg-[#F4F1E8] border border-[#E8E2D2] flex items-center justify-center flex-shrink-0">
                <FileDown className="w-4 h-4 text-[#5A5466]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#13101A] truncate">{pendingAttachment.file.name}</p>
                <p className="text-[11px] text-[#8A8497]">{formatFileSize(pendingAttachment.file.size)}</p>
              </div>
              <button onClick={clearPendingAttachment} className="flex-shrink-0 text-[#C4C4C4] hover:text-[#5A5466] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* ── GIF Picker panel ── */}
      {showGifPicker && !groupArchived && (
        <div className="flex-shrink-0 bg-white border-t border-[#E8E2D2] z-[156] relative" style={{ height: 240 }}>
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-[#F0EDE6]">
            <input
              autoFocus
              value={gifSearch}
              onChange={e => setGifSearch(e.target.value)}
              placeholder="Search GIFs…"
              className="flex-1 text-[13px] bg-[#F4F1E8] rounded-xl px-3 py-2 focus:outline-none border border-[#E8E2D2] focus:border-[#3E1540]/30 placeholder:text-[#C4C4C4]"
            />
            <button onClick={() => setShowGifPicker(false)} className="text-[#C4C4C4] hover:text-[#5A5466] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto h-[188px]">
            {gifLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-5 h-5 border-2 border-[#3E1540] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : gifResults.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-[13px] text-[#8A8497]">No GIFs found</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1 p-1">
                {gifResults.map(gif => (
                  <button
                    key={gif.id}
                    onClick={() => handleSendGif(gif.fullUrl)}
                    className="relative aspect-square rounded-lg overflow-hidden bg-[#F4F1E8] hover:opacity-90 active:scale-95 transition-all"
                  >
                    <img src={gif.previewUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Input bar ── */}
      {groupArchived ? (
        <div className="flex-shrink-0 bg-[var(--cream)] px-4 py-3 flex items-center justify-center">
          <p className="text-[13px] text-[#8A8497]">This chat is archived</p>
        </div>
      ) : (
        <div className="flex-shrink-0 bg-[var(--cream)] px-4 py-3 md:px-10 md:py-3.5 relative">
          {/* @mention dropdown */}
          {mentionQuery !== null && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-4 mb-1 bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.14)] border border-[#ECE8DE] overflow-hidden min-w-[180px] z-10">
              {filteredMentions.map((member, idx) => (
                <button
                  key={member.id}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => handleMentionSelect(member.name)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${idx === mentionIndex ? "bg-[#F4F1E8]" : "hover:bg-[#FBF8F2]"} ${idx > 0 ? "border-t border-[#F0EDE6]" : ""}`}
                >
                  <MonogramChip initials={member.name.charAt(0).toUpperCase()} className="w-7 h-7 text-[11px] font-bold" />
                  <span className="text-[14px] font-medium text-[#13101A]">{member.name.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.txt,.xlsx,.pptx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) stagePendingAttachment(f); e.target.value = "" }}
            />
            {/* Left icons — outside the bubble */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-shrink-0 text-[#5A5466] hover:text-[#13101A] transition-colors disabled:opacity-40 mb-2"
              title="Attach file"
            >
              {uploading
                ? <div className="w-4 h-4 border-2 border-[#5A5466] border-t-transparent rounded-full animate-spin" />
                : <Paperclip className="w-4 h-4" />
              }
            </button>
            <button
              onClick={() => { setShowGifPicker(p => !p); setShowPollCreator(false) }}
              className={`flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-md border transition-colors mb-2 ${showGifPicker ? "bg-[#3E1540] text-white border-[#3E1540]" : "text-[#5A5466] border-[#E2DDCF] hover:border-[#3E1540]/30 hover:text-[#13101A]"}`}
              title="Send a GIF"
            >
              GIF
            </button>
            <button
              onClick={() => { setShowPollCreator(p => !p); setShowGifPicker(false) }}
              className={`flex-shrink-0 transition-colors mb-2 ${showPollCreator ? "text-[#3E1540]" : "text-[#5A5466] hover:text-[#13101A]"}`}
              title="Create a poll"
            >
              <BarChart2 className="w-4 h-4" />
            </button>
            {/* Textarea bubble — its own bordered component */}
            <div className="flex-1 border border-[#E2DDCF] rounded-2xl bg-[#F8F4EA] px-3 py-[9px]">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${displayName}`}
                rows={1}
                className="w-full resize-none bg-transparent text-[14px] text-[#13101A] placeholder:text-[#8A8497] focus:outline-none border-none max-h-36 overflow-y-auto block"
                style={{ lineHeight: "1.5", paddingTop: 0, paddingBottom: 0, height: "auto" }}
              />
            </div>
            {/* Right icons — outside the bubble */}
            <div className="relative mb-2">
              <button
                onClick={() => setShowComposerEmojiPicker(p => !p)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[#5A5466] hover:bg-[#E8E2D2] transition-colors"
              >
                <Smile className="w-4 h-4" />
              </button>
              {showComposerEmojiPicker && (
                <div className="absolute bottom-full right-0 mb-2 z-[160]">
                  <Picker
                    data={data}
                    onEmojiSelect={(emoji: { native: string }) => {
                      insertEmojiAtCursor(emoji.native)
                      setShowComposerEmojiPicker(false)
                    }}
                    theme="light"
                    previewPosition="none"
                    skinTonePosition="none"
                  />
                </div>
              )}
            </div>
            <button
              onClick={handleSend}
              disabled={(!inputText.trim() && !pendingAttachment) || sending}
              className="flex-shrink-0 flex items-center justify-center disabled:opacity-50 hover:bg-[#13101A] transition-all active:scale-95 bg-[#2D0F2E] mb-2"
              style={{ width: 34, height: 34, borderRadius: 10 }}
            >
              <Send className="w-4 h-4 text-white" style={{ transform: "rotate(-30deg)" }} />
            </button>
          </div>
          <div className="hidden md:flex justify-between mt-2 text-[11px] text-[#A09A8C]">
            <span>Press <span style={{ fontFamily: "ui-monospace,monospace" }}>↵</span> to send · <span style={{ fontFamily: "ui-monospace,monospace" }}>⇧↵</span> for new line</span>
            <span>End-to-end visible to {displayName} members</span>
          </div>
        </div>
      )}

      {/* Overlay to dismiss emoji / context menu / GIF picker */}
      {(emojiPickerFor || contextMenuFor || showComposerEmojiPicker || fullReactionPickerFor || showGifPicker || pollMenuFor) && (
        <div
          className="fixed inset-0 z-[155] md:left-[var(--shell-offset)]"
          onClick={() => { setEmojiPickerFor(null); setContextMenuFor(null); setShowComposerEmojiPicker(false); setFullReactionPickerFor(null); setShowGifPicker(false); setPollMenuFor(null) }}
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
            <div className="w-full max-w-[390px] md:max-w-[440px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl border border-[#E8E2D2] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center px-5 pt-5 pb-3 border-b border-[#F0EDE6] flex-shrink-0">
                <div className="flex-1">
                  <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A" }}>Poll</p>
                  {vPoll && <p className="text-[11px] text-[#8A8497] mt-0.5">{vTotal} vote{vTotal !== 1 ? "s" : ""}</p>}
                </div>
                {vTotal > 0 && (
                  <button
                    onClick={() => { setVotersPollId(votingPollId); closeFn() }}
                    className="text-[12px] font-semibold text-[#3E1540] hover:opacity-70 transition-opacity mr-3"
                  >
                    See all votes
                  </button>
                )}
                <button onClick={closeFn} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F4F1E8] transition-colors">
                  <X className="w-4 h-4 text-[#5A5466]" />
                </button>
              </div>
              {vPoll ? (
                <>
                  <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
                    <p className="text-[15px] font-bold text-[#13101A] leading-snug mb-2">{vPoll.question}</p>
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
                          style={{ borderColor: isSelected ? "#3E1540" : "#E8E2D2", background: isSelected ? "rgba(62,21,64,0.05)" : "#FBF8F2" }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${isSelected ? "border-[#3E1540] bg-[#3E1540]" : "border-[#D8D3C8]"}`}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <span className={`text-[14px] font-semibold truncate ${isSelected ? "text-[#3E1540]" : "text-[#13101A]"}`}>{opt}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {optVoters.length > 0 && (
                                <div className="flex items-center">
                                  {optVoters.map((v, vi) => (
                                    <div key={v.user_id} className={`w-5 h-5 rounded-full border border-white overflow-hidden flex-shrink-0${vi > 0 ? " -ml-1.5" : ""}`} style={{ background: "var(--plum)" }}>
                                      {v.avatar_url
                                        ? <img src={v.avatar_url} alt={v.name} className="w-full h-full object-cover" />
                                        : <span className="font-bold flex items-center justify-center h-full" style={{ fontSize: 7, color: "var(--cream)" }}>{v.name.charAt(0).toUpperCase()}</span>
                                      }
                                    </div>
                                  ))}
                                  {count > 3 && (
                                    <div className="-ml-1.5 w-5 h-5 rounded-full bg-[#E8E2D2] border border-white flex items-center justify-center flex-shrink-0">
                                      <span style={{ fontSize: 7, fontWeight: 700, color: "#5A5466" }}>+{count - 3}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              <span className={`text-[12px] font-semibold ${isSelected ? "text-[#3E1540]" : "text-[#8A8497]"}`}>{count > 0 ? `${pct}%` : ""}</span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[#F0EDE6] overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: vTotal > 0 ? `${pct}%` : "0%", background: isSelected ? "#3E1540" : "#C4BDB8" }} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {/* Confirm footer — only shown when user has made a selection */}
                  <div className="px-5 pb-5 pt-3 border-t border-[#F0EDE6] flex-shrink-0 flex gap-2">
                    <button
                      onClick={closeFn}
                      className="flex-1 py-2.5 rounded-xl border border-[#E8E2D2] text-[13px] font-semibold text-[#5A5466] hover:bg-[#F4F1E8] transition-colors"
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
                      style={{ background: hasPending ? "#3E1540" : "#E8E2D2", color: hasPending ? "#F6F4EF" : "#8A8497", cursor: hasPending ? "pointer" : "default" }}
                    >
                      {hasPending ? confirmLabel : "Select an option"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center py-10">
                  <div className="w-5 h-5 border-2 border-[#3E1540] border-t-transparent rounded-full animate-spin" />
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
            <div className="w-full max-w-[390px] md:max-w-[440px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl border border-[#E8E2D2] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center px-5 pt-5 pb-3 border-b border-[#F0EDE6] flex-shrink-0">
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A", flex: 1 }}>Votes</p>
                <button onClick={() => setVotersPollId(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F4F1E8] transition-colors">
                  <X className="w-4 h-4 text-[#5A5466]" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
                {vPoll ? vPoll.options.map((opt, oi) => {
                  const optVoters = vVoters.filter(v => v.option_index === oi)
                  if (optVoters.length === 0) return null
                  return (
                    <div key={oi}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[13px] font-semibold text-[#13101A]">{opt}</p>
                        <span className="text-[11px] text-[#8A8497] font-medium">{optVoters.length} vote{optVoters.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {optVoters.map(v => (
                          <div key={v.user_id} className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "var(--plum)" }}>
                              {v.avatar_url
                                ? <img src={v.avatar_url} alt={v.name} className="w-full h-full object-cover" />
                                : <span className="font-bold" style={{ fontSize: 10, color: "var(--cream)" }}>{v.name.charAt(0).toUpperCase()}</span>
                              }
                            </div>
                            <span className="text-[13px] text-[#13101A]">{v.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-[#3E1540] border-t-transparent rounded-full animate-spin" />
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
          <div className="w-full max-w-[390px] md:max-w-[440px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl border border-[#E8E2D2] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#F0EEF8]">
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A" }}>Create a poll</p>
              <button onClick={() => setShowPollCreator(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F4F1E8] transition-colors">
                <X className="w-4 h-4 text-[#5A5466]" />
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[#8A8497] uppercase tracking-wide mb-1.5 block">Question</label>
                <input
                  autoFocus
                  value={pollQuestion}
                  onChange={e => setPollQuestion(e.target.value)}
                  placeholder="Ask something…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E2D2] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:border-[#3E1540]/40 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#8A8497] uppercase tracking-wide mb-1.5 block">Options</label>
                <div className="flex flex-col gap-2">
                  {pollOptions.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        value={opt}
                        onChange={e => setPollOptions(prev => { const next = [...prev]; next[oi] = e.target.value; return next })}
                        placeholder={`Option ${oi + 1}`}
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#E8E2D2] bg-[#FBF8F2] text-[14px] text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none focus:border-[#3E1540]/40 transition-colors"
                      />
                      {pollOptions.length > 2 && (
                        <button onClick={() => setPollOptions(prev => prev.filter((_, i) => i !== oi))} className="text-[#C4C4C4] hover:text-[#5A5466] transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 5 && (
                    <button
                      onClick={() => setPollOptions(prev => [...prev, ""])}
                      className="flex items-center gap-1.5 text-[13px] text-[#3E1540] font-medium hover:opacity-70 transition-opacity self-start mt-1"
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
                className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors text-[14px]"
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
          <div className="w-full max-w-[390px] md:max-w-[420px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl border border-[#E8E2D2] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#F0EEF8]">
              <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A" }}>Forward to</p>
              <button onClick={() => setForwardingMsg(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F4F1E8] transition-colors">
                <X className="w-4 h-4 text-[#5A5466]" />
              </button>
            </div>
            <div className="px-3 py-2 max-h-[50vh] overflow-y-auto">
              {forwardGroups.length === 0 ? (
                <p className="text-[13px] text-[#8A8497] px-3 py-4">No other chats available.</p>
              ) : (
                forwardGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleForward(g.id)}
                    className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-[#FBF8F2] active:bg-[#F3EDE6] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <MonogramChip initials={g.name.charAt(0).toUpperCase()} className="w-9 h-9 text-[12px] font-semibold" />
                      <span className="text-[14px] font-medium text-[#13101A]">{g.name}</span>
                    </div>
                    {forwardSentTo === g.id ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Forward className="w-4 h-4 text-[#C4C4C4]" />
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="px-5 py-3 border-t border-[#F0EEF8]">
              <p className="text-[11px] text-[#8A8497] truncate">"{forwardingMsg.content.slice(0, 60)}{forwardingMsg.content.length > 60 ? "…" : ""}"</p>
            </div>
          </div>
        </div>
      )}
    </div>
    </AnimateIn>

    {showSettings && (
      <ChatSettings
        groupId={groupId}
        groupName={displayName}
        groupType={groupType}
        groupArchived={groupArchived}
        userId={userId}
        userName={userName}
        ministryId={ministryId}
        userRole={userRole}
        onBack={() => setShowSettings(false)}
        onNameChange={(name) => { setDisplayName(name); onNameChange?.(name) }}
        onClose={() => { setShowSettings(false); onClose() }}
      />
    )}

    {/* Image lightbox */}
    {lightboxUrl && (
      <div
        className="fixed inset-0 z-[300] bg-black/92 flex items-center justify-center"
        onClick={() => setLightboxUrl(null)}
      >
        <button
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
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

export function ChatsTab({ userId, userProfile, userRole, ministryId, ministryName, onOpenChat, onTotalUnreadChange, refreshKey, onOpenDirectory, activeGroupId, canCreateChurchChat }: ChatsTabProps) {
  const supabase = createClient()
  const router = useRouter()
  const [subTab, setSubTab] = useState<"church" | "my">(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("chats") : null
    return (p === "church" || p === "my") ? p : "church"
  })
  const [churchChats, setChurchChats] = useState<ChatGroup[]>([])
  const [archivedChurchChats, setArchivedChurchChats] = useState<ChatGroup[]>([])
  const [myChats, setMyChats] = useState<ChatGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateChat, setShowCreateChat] = useState<"my" | "church" | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")

  const isAdminOrLeader = ["admin", "leader", "deacon", "elder"].includes(userRole.toLowerCase())

  function clearUnread(groupId: string) {
    const zero = (list: ChatGroup[]) => list.map(g => g.id === groupId ? { ...g, unread_count: 0 } : g)
    setChurchChats(zero)
    setMyChats(zero)
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

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("group_members")
        .select("groups(id, name, type, archived, ministry_id), last_read_at")
        .eq("user_id", userId)

      type RawMember = {
        groups: { id: string; name: string; type: string; archived: boolean | null; ministry_id: string | null } | { id: string; name: string; type: string; archived: boolean | null; ministry_id: string | null }[] | null
        last_read_at: string | null
      }

      const allWithLastRead = (data ?? [])
        .map((m: RawMember) => {
          if (!m.groups) return null
          const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
          if (!g || g.ministry_id !== ministryId) return null
          return {
            id: g.id,
            name: g.name,
            type: g.type,
            archived: g.archived ?? false,
            last_message: null,
            last_sender: null,
            last_message_time: null,
            unread_count: 0,
            _lastReadAt: m.last_read_at,
          }
        })
        .filter(Boolean) as (ChatGroup & { _lastReadAt: string | null })[]

      // Fetch unread counts + last message preview in parallel per group
      const withUnread = await Promise.all(
        allWithLastRead.map(async ({ _lastReadAt, ...group }) => {
          let countQuery = supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("group_id", group.id)
            .neq("sender_id", userId)
            .eq("message_type", "user")
          if (_lastReadAt) countQuery = countQuery.gt("created_at", _lastReadAt)

          const [{ count }, { data: lastMsgData }] = await Promise.all([
            countQuery,
            supabase
              .from("messages")
              .select("content, created_at, profiles!sender_id(name)")
              .eq("group_id", group.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ])

          const senderProfile = lastMsgData
            ? (Array.isArray(lastMsgData.profiles) ? lastMsgData.profiles[0] : lastMsgData.profiles) as { name: string } | null
            : null

          return {
            ...group,
            unread_count: count ?? 0,
            last_message: lastMsgData?.content ?? null,
            last_sender: senderProfile?.name ?? null,
            last_message_time: lastMsgData?.created_at ?? null,
          }
        })
      )

      // Sort by most recent message first (nulls last)
      withUnread.sort((a, b) => {
        if (!a.last_message_time && !b.last_message_time) return 0
        if (!a.last_message_time) return 1
        if (!b.last_message_time) return -1
        return b.last_message_time.localeCompare(a.last_message_time)
      })

      setChurchChats(withUnread.filter((g) => g.type === "church" && !g.archived))
      setArchivedChurchChats(withUnread.filter((g) => g.type === "church" && g.archived))
      setMyChats(withUnread.filter((g) => g.type !== "church"))

      const total = withUnread.filter((g) => !g.archived).reduce((s, g) => s + g.unread_count, 0)
      onTotalUnreadChange(total)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshKey])

  const rawActive = subTab === "church" ? churchChats : myChats
  const active = search.trim()
    ? rawActive.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    : rawActive
  const showPlusButton = subTab === "my" || (subTab === "church" && canCreateChurchChat)

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "10px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  return (
    <div className="pb-2 md:pb-0 md:h-full md:flex md:flex-col">
      {/* Desktop Plan C header */}
      <div className="hidden md:block px-5 pt-5 pb-4 border-b border-[#E5E0D2] flex-shrink-0">
        <p style={monoStyle}>Workspace</p>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", lineHeight: 1.1, color: "#13101A", marginTop: "4px" }}>{ministryName}</p>
      </div>

      {/* Desktop search */}
      <div className="hidden md:flex items-center gap-2 mx-3 my-3 px-3.5 py-2.5 border border-[#E5E0D2] rounded-lg bg-[#F4F1E8] text-[#8A8497] flex-shrink-0">
        <Search className="w-4 h-4 flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages"
          className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-[#8A8497] text-[#13101A]"
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
              const sp = new URLSearchParams(window.location.search)
              sp.set("chats", t)
              router.replace(`?${sp.toString()}`, { scroll: false })
            }}
            style={{
              flex: 1, padding: "14px 0", fontSize: "14px", fontWeight: 600,
              color: subTab === t ? "#13101A" : "#8A8497",
              background: "transparent", border: "none",
              borderBottom: `2px solid ${subTab === t ? "#3E1540" : "transparent"}`,
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
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>{ministryName}</span>
        </div>
        <button
          onClick={onOpenDirectory}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F0EEF8] transition-colors"
          aria-label="Directory"
        >
          <Users className="w-5 h-5 text-[#3E1540]" />
        </button>
      </div>

      {/* Sub-tab switcher — mobile only */}
      <div className="flex items-center gap-1 bg-[#FBF8F2] rounded-xl p-1 mb-5 md:hidden">
        {(["church", "my"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setSubTab(t)
              setSearch("")
              const sp = new URLSearchParams(window.location.search)
              sp.set("chats", t)
              router.replace(`?${sp.toString()}`, { scroll: false })
            }}
            className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all ${
              subTab === t
                ? "bg-white text-[#3E1540] shadow-sm"
                : "text-[#8A8497] hover:text-[#3E1540]/70"
            }`}
          >
            {t === "church" ? "Church Chats" : "My Chats"}
          </button>
        ))}
      </div>

      {/* Search bar — mobile only (desktop has one in the panel header above) */}
      <div className="relative mb-4 md:hidden">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8497]/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chats…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#FBF8F2] text-[13px] placeholder:text-[#C4C4C4] text-[#13101A] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 border border-[#EFEFEF] focus:border-[#3E1540]/30 transition-all"
        />
      </div>

      {/* Section header with + button */}
      <div className="flex items-center justify-between mb-3 md:px-4">
        <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "26px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, margin: 0 }}
          className="md:hidden">
          {subTab === "church" ? "Church chats" : "My chats"}
        </h3>
        {/* Desktop mono section label */}
        <p className="hidden md:block mb-1" style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8497" }}>
          {subTab === "church" ? `Church · ${churchChats.length}` : `Direct · ${myChats.length}`}
        </p>
        {showPlusButton && (
          <button
            onClick={() => setShowCreateChat(subTab)}
            className="size-8 rounded-xl bg-[#FBF8F2] border border-[#ECE8DE] flex items-center justify-center hover:bg-[#F2EDE0] active:scale-95 transition-all md:size-7 md:rounded-lg"
          >
            <Plus className="w-4 h-4 text-[#3E1540] md:w-3.5 md:h-3.5" />
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
                <span className="text-[11px] font-bold text-[#8A8497]/40 uppercase tracking-wider">
                  Archived · {archivedChurchChats.length}
                </span>
                <ChevronDown className={`w-4 h-4 text-[#8A8497]/30 transition-transform duration-200 ${showArchived ? "rotate-180" : ""}`} />
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
            if (showCreateChat === "church") {
              setChurchChats(prev => [newGroup, ...prev])
            } else {
              setMyChats(prev => [newGroup, ...prev])
            }
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
      <div className="md:hidden bg-[#FBF8F2] border border-[#ECE8DE] rounded-[18px] p-4 hover:bg-[#F5F0E8] transition-colors">
        <div className="flex items-center gap-3.5">
          <MonogramChip
            initials={firstInitial}
            className="w-12 h-12 flex-shrink-0"
            style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400 }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[15px] font-semibold text-[#13101A] truncate pr-2">{group.name}</h3>
              {group.last_message_time && <span className="text-[11px] text-[#8A8497] flex-shrink-0">{formatRelativeTime(group.last_message_time)}</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-[#5A5466] truncate">
                {group.last_message
                  ? group.last_sender ? <><span className="font-semibold text-[#5A5466]">{group.last_sender}:</span> {group.last_message}</> : group.last_message
                  : <span className="italic text-[#8A8497]">No messages yet</span>}
              </p>
              {group.unread_count > 0 && (
                <span className="w-6 h-6 bg-[#C9A34B] rounded-full text-[11px] font-bold text-[#13101A] flex items-center justify-center flex-shrink-0">{group.unread_count}</span>
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
  onOpenChat: (id: string, name: string) => void
  refreshKey: number
  canCreateChurchChat: boolean
  userProfile: Profile
  userRole: string
}

export function ChatListPanel({ userId, ministryId, activeGroupId, onOpenChat, refreshKey, canCreateChurchChat, userProfile, userRole }: ChatListPanelProps) {
  const supabase = createClient()
  const router = useRouter()
  const [subTab, setSubTab] = useState<"church" | "my">(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("chats") : null
    return (p === "church" || p === "my") ? p : "church"
  })
  const [churchChats, setChurchChats] = useState<ChatGroup[]>([])
  const [archivedChurchChats, setArchivedChurchChats] = useState<ChatGroup[]>([])
  const [myChats, setMyChats] = useState<ChatGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateChat, setShowCreateChat] = useState<"my" | "church" | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")

  function clearUnread(groupId: string) {
    const zero = (list: ChatGroup[]) => list.map(g => g.id === groupId ? { ...g, unread_count: 0 } : g)
    setChurchChats(zero)
    setMyChats(zero)
  }

  function handleOpenChatPanel(groupId: string, groupName: string) {
    clearUnread(groupId)
    onOpenChat(groupId, groupName)
  }

  useEffect(() => {
    if (activeGroupId) clearUnread(activeGroupId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId])

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("group_members")
        .select("groups(id, name, type, archived, ministry_id), last_read_at")
        .eq("user_id", userId)

      type RawMember = {
        groups: { id: string; name: string; type: string; archived: boolean | null; ministry_id: string | null } | { id: string; name: string; type: string; archived: boolean | null; ministry_id: string | null }[] | null
        last_read_at: string | null
      }

      const allWithLastRead = (data ?? [])
        .map((m: RawMember) => {
          if (!m.groups) return null
          const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
          if (!g || g.ministry_id !== ministryId) return null
          return {
            id: g.id,
            name: g.name,
            type: g.type,
            archived: g.archived ?? false,
            last_message: null,
            last_sender: null,
            last_message_time: null,
            unread_count: 0,
            _lastReadAt: m.last_read_at,
          }
        })
        .filter(Boolean) as (ChatGroup & { _lastReadAt: string | null })[]

      const withUnread = await Promise.all(
        allWithLastRead.map(async ({ _lastReadAt, ...group }) => {
          let countQuery = supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("group_id", group.id)
            .neq("sender_id", userId)
            .eq("message_type", "user")
          if (_lastReadAt) countQuery = countQuery.gt("created_at", _lastReadAt)

          const [{ count }, { data: lastMsgData }] = await Promise.all([
            countQuery,
            supabase
              .from("messages")
              .select("content, created_at, profiles!sender_id(name)")
              .eq("group_id", group.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ])

          const senderProfile = lastMsgData
            ? (Array.isArray(lastMsgData.profiles) ? lastMsgData.profiles[0] : lastMsgData.profiles) as { name: string } | null
            : null

          return {
            ...group,
            unread_count: count ?? 0,
            last_message: lastMsgData?.content ?? null,
            last_sender: senderProfile?.name ?? null,
            last_message_time: lastMsgData?.created_at ?? null,
          }
        })
      )

      withUnread.sort((a, b) => {
        if (!a.last_message_time && !b.last_message_time) return 0
        if (!a.last_message_time) return 1
        if (!b.last_message_time) return -1
        return b.last_message_time.localeCompare(a.last_message_time)
      })

      setChurchChats(withUnread.filter((g) => g.type === "church" && !g.archived))
      setArchivedChurchChats(withUnread.filter((g) => g.type === "church" && g.archived))
      setMyChats(withUnread.filter((g) => g.type !== "church"))
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshKey])

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
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-[12.5px] placeholder:text-[var(--muted-text)] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
            style={{ background: "var(--cream)", borderColor: "var(--line-2)", color: "var(--ink)" }}
          />
        </div>
      </div>

      {/* Church / My tab strip */}
      <div className="flex border-b border-[var(--line)] flex-shrink-0">
        {(["church", "my"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setSubTab(t)
              setSearch("")
              const sp = new URLSearchParams(window.location.search)
              sp.set("chats", t)
              router.replace(`?${sp.toString()}`, { scroll: false })
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
              cursor: "pointer",
              fontFamily: "var(--sans)",
            }}
          >
            {t === "church" ? "Church" : "My Chats"}
          </button>
        ))}
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
            {active.map((group) => (
              <ChatGroupCard key={group.id} group={group} onClick={() => handleOpenChatPanel(group.id, group.name)} isActive={activeGroupId === group.id} />
            ))}
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
                {showArchived && archivedChurchChats.map((group) => (
                  <div key={group.id} className="opacity-50">
                    <ChatGroupCard group={group} onClick={() => handleOpenChatPanel(group.id, group.name)} />
                  </div>
                ))}
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
            if (showCreateChat === "church") {
              setChurchChats(prev => [newGroup, ...prev])
            } else {
              setMyChats(prev => [newGroup, ...prev])
            }
            setShowCreateChat(null)
            onOpenChat(group.id, group.name)
          }}
        />
      )}
    </div>
  )
}
