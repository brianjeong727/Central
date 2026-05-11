"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Search, ChevronRight, ChevronDown, X, Check, ArrowLeft, Send, Settings, MoreHorizontal, Trash2, CornerUpLeft, Plus, Users, Edit3, Info, Download, Bell, User } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { createGroup } from "@/app/actions/create-group"
import { deleteGroup } from "@/app/actions/chat"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Spinner, EmptyState } from "../components/shared"
import { getInitials, getAvatarColor, formatRelativeTime, formatMessageTime, REACTION_EMOJIS } from "../utils"
import { DesktopTopbar } from "../components/desktop-nav"
import type { CreateChatScreenProps, ChatSettingsProps, ChatScreenProps, ChatsTabProps, ChatGroup, GroupMember, Message, Reaction, Profile } from "../types"

export function CreateChatScreen({ userId, userName, ministryId, groupType, onClose, onCreated }: CreateChatScreenProps) {
  const supabase = createClient()
  const [chatName, setChatName] = useState("")
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

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    const name = chatName.trim()
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

    onCreated({ id: group.id, name: group.name })
  }

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
              {groupType === "church" ? "Church Chat" : "Group Chat"}
            </span>
          </div>
          <div className="px-5 pb-5">
            <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "32px", fontWeight: 400, letterSpacing: "-0.02em", color: "#13101A", lineHeight: 1.05, margin: 0 }}>
              {groupType === "church" ? "New Church Chat" : "New Chat"}
            </h1>
            <p style={{ fontSize: "13px", color: "#8A8497", marginTop: "6px" }}>Name your space and invite members to join.</p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-xl bg-[#3E1540]/8 px-4 py-3 text-[13px] text-[#3E1540] font-medium">
              {error}
            </div>
          )}

          {/* Chat name */}
          <div className="bg-white rounded-2xl border border-[#ECE8DE] shadow-[0_1px_3px_rgba(19,16,26,0.04)] px-4 pt-4 pb-4">
            <label className="text-[10px] font-semibold text-[#8A8497] tracking-wider uppercase block mb-2">Chat Name</label>
            <input
              type="text"
              value={chatName}
              onChange={(e) => setChatName(e.target.value)}
              placeholder={groupType === "church" ? "e.g. Freshman Bible Study" : "e.g. Prayer Group"}
              className="w-full text-[#13101A] placeholder:text-[#C4C4C4] focus:outline-none bg-transparent"
              style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "18px", letterSpacing: "-0.01em", lineHeight: "1.4" }}
            />
          </div>

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

            {/* Selected chips — lives here so the member list stays in place */}
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
                      <Avatar className={`w-9 h-9 flex-shrink-0 ${getAvatarColor(member.name)} shadow-sm overflow-hidden`} style={{ borderRadius: "12px" }}>
                        {member.avatar_url && <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover" style={{ borderRadius: "12px" }} />}
                        <AvatarFallback className="text-white font-bold text-[11px] bg-transparent" style={{ fontFamily: "var(--font-instrument-serif)" }}>
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
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
            disabled={creating || !chatName.trim()}
            className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-[14px] tracking-wide"
          >
            {creating ? "Creating…" : `Create Chat${selectedMembers.length > 0 ? ` · ${selectedMembers.length + 1} members` : ""}`}
          </button>
        </div>

      </div>
    </div>
  )
}

export function ChatSettings({ groupId, groupName, groupType, groupArchived = false, userId, ministryId, userRole, onBack, onNameChange, onClose }: ChatSettingsProps) {
  const supabase = createClient()
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [displayGroupName, setDisplayGroupName] = useState(groupName)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(groupName)
  const [saving, setSaving] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [searchAdd, setSearchAdd] = useState("")
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([])
  const [addingMembers, setAddingMembers] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isAdminOrLeader = ["admin", "leader"].includes(userRole.toLowerCase())
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
    const memberIds = new Set(members.map((m) => m.user_id))
    const { data } = await supabase
      .from("profiles")
      .select("id, name, role, graduation_year, email, about_me, bible_verse, prayer_request, pray_for_me, avatar_url")
      .eq("ministry_id", ministryId)
      .order("name")
    setAllProfiles((data ?? []).filter((p: Profile) => !memberIds.has(p.id)))
  }

  async function handleRename() {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === displayGroupName) { setRenaming(false); return }
    setSaving(true)
    const { error } = await supabase.from("groups").update({ name: trimmed }).eq("id", groupId).eq("ministry_id", ministryId)
    if (!error) {
      setDisplayGroupName(trimmed)
      onNameChange(trimmed)
    }
    setSaving(false)
    setRenaming(false)
  }

  async function handleRemoveMember(memberId: string) {
    setRemovingId(memberId)
    await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", memberId)
    setMembers((prev) => prev.filter((m) => m.user_id !== memberId))
    setRemovingId(null)
  }

  async function handleLeave() {
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

  async function handleAddMembers() {
    if (selectedToAdd.length === 0) return
    setAddingMembers(true)
    await supabase.from("group_members").insert(selectedToAdd.map((uid) => ({ group_id: groupId, user_id: uid })))
    await loadMembers()
    setSelectedToAdd([])
    setAddingMembers(false)
    setShowAddMembers(false)
    setSearchAdd("")
  }

  const filteredProfiles = allProfiles.filter((p) =>
    p.name.toLowerCase().includes(searchAdd.toLowerCase())
  )

  if (showAddMembers) {
    return (
      <div className="fixed inset-0 z-[110] bg-[#FBF8F2] flex flex-col md:left-[296px]">
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
                    <Avatar className={`w-9 h-9 flex-shrink-0 ${getAvatarColor(profile.name)} overflow-hidden`}>
                      {profile.avatar_url && <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover rounded-full" />}
                      <AvatarFallback className="text-white font-bold text-[10px] bg-transparent">
                        {getInitials(profile.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#13101A] truncate">{profile.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {profile.role && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${profile.role.toLowerCase() === "admin" || profile.role.toLowerCase() === "leader" ? "bg-[#3E1540] text-white" : "bg-[#F3EDE6] text-[#3E1540]"}`}>
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
            onClick={handleAddMembers}
            disabled={selectedToAdd.length === 0 || addingMembers}
            className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-[14px] tracking-wide"
          >
            {addingMembers
              ? "Adding…"
              : selectedToAdd.length > 0
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
    <div className="fixed inset-0 z-[110] bg-[#FBF8F2] flex flex-col md:left-[296px]">
    <div className="max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none">

      {/* ── Mobile header (hidden on desktop) ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 md:hidden bg-white border-b border-[#ECE8DE]">
        <button onClick={onBack} className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-[#13101A]" />
        </button>
        <h2 className="flex-1 text-[15px] font-bold text-[#13101A] tracking-tight">Chat Info</h2>
      </div>

      {/* ── Desktop topbar ── */}
      <div className="hidden md:block flex-shrink-0">
        <DesktopTopbar
          crumbs={["Central", "Chats", displayGroupName, "Info"]}
          right={
            <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-[#8A8497] hover:text-[#3E1540] transition-colors px-3 py-1.5 rounded-lg border border-[#ECE8DE] bg-white">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to chat
            </button>
          }
        />
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
              <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, color: "#F6F4EF", lineHeight: 1.05 }}>{displayGroupName}</h2>
              <p style={{ color: "rgba(246,244,239,0.65)", fontSize: 13, marginTop: 8 }}>
                {members.length} member{members.length !== 1 ? "s" : ""}
              </p>
            </div>
            {/* Action buttons */}
            {canManage && (
              <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => { setRenaming(true); setNewName(displayGroupName) }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "rgba(246,244,239,0.08)", border: "1px solid rgba(246,244,239,0.2)", borderRadius: 10, color: "#F6F4EF", fontSize: 13, cursor: "pointer" }}>
                  <Edit3 style={{ width: 13, height: 13 }} /> Rename
                </button>
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
              <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8497" }}>{members.length} people</span>
            </div>
            {loading ? <Spinner /> : (
              <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, overflow: "hidden" }}>
                {members.map((member, i) => (
                  <div key={member.user_id} style={{
                    display: "grid", gridTemplateColumns: "40px 1fr auto auto",
                    alignItems: "center", gap: 14, padding: "15px 20px",
                    borderBottom: i < members.length - 1 ? "1px solid #ECE8DE" : "none",
                  }}>
                    <Avatar className={`w-10 h-10 flex-shrink-0 ${getAvatarColor(member.name)} overflow-hidden`}>
                      {member.avatar_url && <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover rounded-full" />}
                      <AvatarFallback className="text-white font-bold text-[11px] bg-transparent">{getInitials(member.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <p style={{ fontSize: 14, color: "#13101A", fontWeight: 500 }}>{member.name}</p>
                        {member.user_id === userId && (
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#FBF8F2", color: "#8A8497", letterSpacing: "0.06em", textTransform: "uppercase" }}>You</span>
                        )}
                      </div>
                      {member.graduation_year && (
                        <p style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>Class of {member.graduation_year}</p>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {member.role && (
                        <span style={{
                          fontSize: 11, padding: "3px 10px", borderRadius: 999,
                          background: ["admin","leader"].includes(member.role.toLowerCase()) ? "rgba(62,21,64,0.08)" : "#FBF8F2",
                          color: ["admin","leader"].includes(member.role.toLowerCase()) ? "#3E1540" : "#8A8497",
                          letterSpacing: "0.04em", textTransform: "uppercase" as const,
                        }}>
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </span>
                      )}
                    </div>
                    {canManage && member.user_id !== userId && (
                      <button onClick={() => handleRemoveMember(member.user_id)} disabled={removingId === member.user_id} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: "transparent", color: "#C4C4C4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} className="hover:text-red-400 transition-colors disabled:opacity-40">
                        <X style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                  </div>
                ))}
                {canManage && (
                  <button onClick={() => { setShowAddMembers(true); loadAllProfiles() }} style={{ width: "100%", padding: "13px 20px", borderTop: "1px solid #ECE8DE", color: "#3E1540", fontSize: 13.5, display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                    <Plus style={{ width: 14, height: 14 }} /> Add members from directory
                  </button>
                )}
              </div>
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
              {/* Rename row */}
              {renaming ? (
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #ECE8DE", display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setRenaming(false); setNewName(displayGroupName) } }}
                    style={{ flex: 1, padding: "8px 12px", border: "1px solid #ECE8DE", borderRadius: 8, fontSize: 13, color: "#13101A", background: "#FBF8F2", outline: "none" }}
                  />
                  <button onClick={handleRename} disabled={saving} style={{ width: 32, height: 32, borderRadius: 999, background: "#3E1540", border: "none", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check style={{ width: 13, height: 13 }} />
                  </button>
                  <button onClick={() => { setRenaming(false); setNewName(displayGroupName) }} style={{ width: 32, height: 32, borderRadius: 999, background: "#F4F1E8", border: "none", color: "#8A8497", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              ) : canManage ? (
                <button onClick={() => { setRenaming(true); setNewName(displayGroupName) }} style={{ width: "100%", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, background: "transparent", border: "none", borderBottom: "1px solid #ECE8DE", cursor: "pointer" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: "#FBF8F2", border: "1px solid #ECE8DE", display: "flex", alignItems: "center", justifyContent: "center", color: "#3E1540", flexShrink: 0 }}>
                    <Edit3 style={{ width: 13, height: 13 }} />
                  </div>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <p style={{ fontSize: 13.5, color: "#13101A", fontWeight: 500 }}>Rename chat</p>
                    <p style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>Change how it appears in everyone&apos;s list</p>
                  </div>
                  <ChevronRight style={{ width: 14, height: 14, color: "#C4C4C4" }} />
                </button>
              ) : null}
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
                <button onClick={handleArchive} style={{ width: "100%", padding: "11px 0", background: "white", color: "#5A5466", borderRadius: 12, fontSize: 13.5, fontWeight: 500, border: "1px solid #ECE8DE", cursor: "pointer" }}>
                  Archive chat
                </button>
              )}
              {canUnarchive && (
                <button onClick={handleUnarchive} style={{ width: "100%", padding: "11px 0", background: "white", color: "#5A5466", borderRadius: 12, fontSize: 13.5, fontWeight: 500, border: "1px solid #ECE8DE", cursor: "pointer" }}>
                  Unarchive chat
                </button>
              )}
              {canLeave && (
                <button onClick={handleLeave} style={{ width: "100%", padding: "11px 0", background: "transparent", color: "#B0413E", borderRadius: 12, fontSize: 13.5, fontWeight: 500, border: "none", cursor: "pointer" }}>
                  Leave conversation
                </button>
              )}
              {canDelete && (
                confirmDelete ? (
                  <div style={{ background: "#FFF5F5", border: "1px solid #FFD7D7", borderRadius: 12, padding: "12px 14px" }}>
                    <p style={{ fontSize: 13, color: "#B0413E", marginBottom: 10, fontWeight: 500 }}>Delete this chat and all its messages? This cannot be undone.</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={handleDelete} style={{ flex: 1, padding: "8px 0", background: "#B0413E", color: "white", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>Delete</button>
                      <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: "8px 0", background: "#F4F1E8", color: "#5A5466", borderRadius: 10, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} style={{ width: "100%", padding: "11px 0", background: "transparent", color: "#B0413E", borderRadius: 12, fontSize: 13.5, fontWeight: 500, border: "1px solid #FFD7D7", cursor: "pointer" }}>
                    Delete chat
                  </button>
                )
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
              <Avatar className={`w-14 h-14 flex-shrink-0 ${getAvatarColor(displayGroupName)}`}>
                <AvatarFallback className="text-white font-bold text-[16px] bg-transparent tracking-wide">{getInitials(displayGroupName)}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-[16px] font-bold text-[#13101A] tracking-tight">{displayGroupName}</h3>
                <p className="text-[12px] text-[#8A8497]/60 mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            {loading ? <Spinner /> : (
              <div className="flex flex-col gap-2 mb-6">
                {members.map((member) => (
                  <div key={member.user_id} className="bg-white rounded-xl border border-[#EFEFEF] p-3.5 flex items-center gap-3">
                    <Avatar className={`w-9 h-9 flex-shrink-0 ${getAvatarColor(member.name)} overflow-hidden`}>
                      {member.avatar_url && <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover rounded-full" />}
                      <AvatarFallback className="text-white font-bold text-[10px] bg-transparent">{getInitials(member.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[13px] font-semibold text-[#13101A] truncate">{member.name}</p>
                        {member.user_id === userId && <span className="text-[9px] bg-[#3E1540]/8 text-[#3E1540] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0">You</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {member.role && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${member.role.toLowerCase() === "admin" || member.role.toLowerCase() === "leader" ? "bg-[#3E1540] text-white" : "bg-[#F3EDE6] text-[#3E1540]"}`}>{member.role}</span>}
                        {member.graduation_year && <span className="text-[11px] text-[#8A8497]/50">Class of {member.graduation_year}</span>}
                      </div>
                    </div>
                    {canManage && member.user_id !== userId && (
                      <button onClick={() => handleRemoveMember(member.user_id)} disabled={removingId === member.user_id} className="w-7 h-7 rounded-full bg-[#F4F1E8] flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0 disabled:opacity-40">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {canManage && (
            <div className="px-5 pb-4">
              <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "20px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, marginBottom: "16px" }}>Manage chat</h3>
              <div className="bg-white rounded-2xl border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
                {renaming ? (
                  <div className="p-4 flex items-center gap-3 border-b border-[#ECE8DE]">
                    <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setRenaming(false); setNewName(displayGroupName) } }} className="flex-1 text-[13px] text-[#13101A] bg-[#FBF8F2] border border-[#EFEFEF] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3E1540]/30" />
                    <button onClick={handleRename} disabled={saving} className="w-8 h-8 rounded-full bg-[#3E1540] flex items-center justify-center disabled:opacity-50 hover:bg-[#2D0F2E] transition-colors"><Check className="w-3.5 h-3.5 text-white" /></button>
                    <button onClick={() => { setRenaming(false); setNewName(displayGroupName) }} className="w-8 h-8 rounded-full bg-[#F4F1E8] flex items-center justify-center hover:bg-[#F4F1E8] transition-colors"><X className="w-3.5 h-3.5 text-[#8A8497]" /></button>
                  </div>
                ) : (
                  <button onClick={() => { setRenaming(true); setNewName(displayGroupName) }} className="w-full p-4 flex items-center gap-3 hover:bg-[#FBF8F2] transition-colors border-b border-[#ECE8DE]">
                    <div className="w-8 h-8 rounded-xl bg-[#3E1540]/8 flex items-center justify-center flex-shrink-0"><Edit3 className="w-3.5 h-3.5 text-[#3E1540]" /></div>
                    <span className="flex-1 text-[14px] font-semibold text-[#13101A] text-left">Rename Chat</span>
                    <ChevronRight className="w-4 h-4 text-[#8A8497]/30" />
                  </button>
                )}
                <button onClick={() => { setShowAddMembers(true); loadAllProfiles() }} className="w-full p-4 flex items-center gap-3 hover:bg-[#FBF8F2] transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-[#F3EDE6] flex items-center justify-center flex-shrink-0"><Plus className="w-3.5 h-3.5 text-[#3E1540]" /></div>
                  <span className="flex-1 text-[14px] font-semibold text-[#13101A] text-left">Add Members</span>
                  <ChevronRight className="w-4 h-4 text-[#8A8497]/30" />
                </button>
              </div>
            </div>
          )}
          {(canArchive || canUnarchive || canLeave || canDelete) && (
            <div className="px-5 pb-10">
              {canArchive && <button onClick={handleArchive} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-[#5A5466] font-semibold text-[13px] mb-3 hover:bg-[#FBF8F2] transition-colors border border-[#ECE8DE]">Archive chat</button>}
              {canUnarchive && <button onClick={handleUnarchive} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-[#5A5466] font-semibold text-[13px] mb-3 hover:bg-[#FBF8F2] transition-colors border border-[#ECE8DE]">Unarchive chat</button>}
              {canLeave && <button onClick={handleLeave} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-[#5A5466] font-semibold text-[13px] hover:bg-[#FBF8F2] transition-colors border border-[#ECE8DE]">Leave chat</button>}
              {canDelete && (
                confirmDelete ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="text-[13px] text-[#B0413E] font-medium mb-3">Delete this chat and all its messages? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl bg-[#B0413E] text-white text-[13px] font-semibold">Delete</button>
                      <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl bg-[#F4F1E8] text-[#5A5466] text-[13px] font-medium">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="mt-3 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-[#B0413E] font-semibold text-[13px] border border-red-200">Delete chat</button>
                )
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
  const [contextMenuFor, setContextMenuFor] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
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
    // Optimistic
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, deleted: true, content: "" } : m))
    setReactions((prev) => { const next = { ...prev }; delete next[msgId]; return next })
    await supabase.from("messages").delete().eq("id", msgId).eq("sender_id", userId)
  }

  // Fetch group type + archived status for settings
  useEffect(() => {
    supabase
      .from("groups")
      .select("type, archived")
      .eq("id", groupId)
      .single()
      .then(({ data }) => { if (data) { setGroupType(data.type); setGroupArchived(data.archived ?? false) } })
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
        .select("id, group_id, sender_id, content, created_at, reply_to_id, profiles!sender_id(name, avatar_url), reply_to:reply_to_id(id, content, profiles!sender_id(name))")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(50)

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched: Message[] = data.map((m: any) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          const name = p?.name ?? "Unknown"
          const avatarUrl = p?.avatar_url ?? null
          profilesCache.current[m.sender_id] = name
          avatarCache.current[m.sender_id] = avatarUrl

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
          }
        })
        setMessages(enriched)

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
          const raw = payload.new as { id: string; group_id: string; sender_id: string; content: string; created_at: string; reply_to_id: string | null }
          // Skip own messages — handled optimistically
          if (raw.sender_id === userId) return

          let senderName = profilesCache.current[raw.sender_id]
          if (!senderName) {
            const { data: prof } = await supabase.from("profiles").select("name").eq("id", raw.sender_id).single()
            senderName = prof?.name ?? "Unknown"
            profilesCache.current[raw.sender_id] = senderName
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

          setMessages((prev) => [...prev, {
            ...raw,
            sender_name: senderName,
            sender_avatar_url: avatarCache.current[raw.sender_id] ?? null,
            reply_to_id: raw.reply_to_id ?? null,
            reply_to_content: replyToContent,
            reply_to_sender: replyToSender,
          }])

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

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value)
    if (typingChannelRef.current && e.target.value.trim()) {
      typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: true } })
      if (myTypingTimeoutRef.current) clearTimeout(myTypingTimeoutRef.current)
      myTypingTimeoutRef.current = setTimeout(() => {
        typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: false } })
      }, 2500)
    }
  }

  async function handleSend() {
    const content = inputText.trim()
    if (!content || sending || groupArchived) return

    // Clear own typing status
    if (myTypingTimeoutRef.current) clearTimeout(myTypingTimeoutRef.current)
    typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: false } })

    setSending(true)
    setInputText("")

    const replyTarget = replyingTo
    setReplyingTo(null)

    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: Message = {
      id: optimisticId,
      group_id: groupId,
      sender_id: userId,
      content,
      created_at: new Date().toISOString(),
      sender_name: userName,
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
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
  const MEMBER_AVATAR_COLORS = ["#13101A", "#3E1540"]

  return (
    <>
    <div className={inline ? "flex flex-col h-full bg-[#FBF8F2] w-full" : "fixed inset-0 z-[100] bg-[#FBF8F2] flex flex-col md:left-[296px]"}>
    <div className={inline ? "w-full h-full flex flex-col" : "max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none"}>

      {/* ── Top bar ── */}
      <div className={`flex-shrink-0 flex items-center gap-3 px-4 md:px-10 ${inline ? "py-3" : "pt-12 pb-3 md:py-3.5"} bg-[#FBF8F2] border-b border-[#E8E2D2]`}>
        {!inline && (
          <button
            onClick={onClose}
            className="flex-shrink-0 -ml-1 p-1 hover:bg-[#F2EDE0] rounded-lg transition-colors md:hidden"
          >
            <ArrowLeft className="w-5 h-5 text-[#13101A]" />
          </button>
        )}
        {/* Group avatar */}
        <div
          className="flex-shrink-0 flex items-center justify-center text-[#F6F4EF]"
          style={{ width: 40, height: 40, borderRadius: 10, background: "#2D0F2E", fontFamily: "var(--font-instrument-serif)", fontSize: 16, display: "grid", placeItems: "center" }}
        >
          {getInitials(displayName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate leading-none" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", color: "#13101A", letterSpacing: "-0.02em" }}>{displayName}</h2>
            <div className="hidden md:flex items-center flex-shrink-0">
              {memberFirstNames.slice(0, 4).map((name, i) => (
                <span
                  key={i}
                  style={{
                    width: 16, height: 16, borderRadius: 99,
                    background: MEMBER_AVATAR_COLORS[i % MEMBER_AVATAR_COLORS.length],
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
        {/* Desktop action buttons */}
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
          {[Search, Bell, User].map((Icon, i) => (
            <button key={i} onClick={i === 2 ? () => setShowSettings(true) : undefined} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E2DDCF", background: "transparent", color: "#5A5466", cursor: "pointer", display: "grid", placeItems: "center" }}>
              <Icon size={14} />
            </button>
          ))}
        </div>
        {/* Mobile settings */}
        <button
          onClick={() => setShowSettings(true)}
          className="flex-shrink-0 p-1 hover:bg-[#F2EDE0] rounded-lg transition-colors md:hidden"
        >
          <Settings className="w-5 h-5 text-[#8A8497]" />
        </button>
      </div>

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
            {messages.map((msg, i) => {
              const isOwn = msg.sender_id === userId
              const prevMsg = i > 0 ? messages[i - 1] : null
              const nextMsg = i < messages.length - 1 ? messages[i + 1] : null

              const sameMinute = (a: Message, b: Message) =>
                a.sender_id === b.sender_id &&
                Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 60000

              const isFirstInGroup = !prevMsg || !sameMinute(msg, prevMsg)
              const isLastInGroup = !nextMsg || !sameMinute(msg, nextMsg)

              // Date separator
              const prevDate = prevMsg ? new Date(prevMsg.created_at).toDateString() : null
              const thisDate = new Date(msg.created_at).toDateString()
              const showDateSep = !prevMsg || prevDate !== thisDate

              const incomingRadius = isFirstInGroup && isLastInGroup
                ? "rounded-2xl rounded-tl-sm"
                : isFirstInGroup
                  ? "rounded-2xl rounded-tl-sm rounded-bl-md"
                  : isLastInGroup
                    ? "rounded-2xl rounded-tl-md"
                    : "rounded-2xl rounded-l-md"
              const outgoingRadius = isFirstInGroup && isLastInGroup
                ? "rounded-2xl rounded-tr-sm"
                : isFirstInGroup
                  ? "rounded-2xl rounded-tr-sm rounded-br-md"
                  : isLastInGroup
                    ? "rounded-2xl rounded-tr-md"
                    : "rounded-2xl rounded-r-md"

              const rxGroups = groupedReactions(msg.id)
              const groupGap = isFirstInGroup && i > 0 && !showDateSep ? "mt-3" : ""
              return (
                <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el }}>
                  {/* Date separator */}
                  {showDateSep && (
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-[#E8E2D2]" />
                      <span style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: "13px", color: "#8A8497", whiteSpace: "nowrap" }}>
                        {formatDateLabel(msg.created_at)}
                      </span>
                      <div className="flex-1 h-px bg-[#E8E2D2]" />
                    </div>
                  )}

                  <div className={`flex flex-col relative ${isOwn ? "items-end" : "items-start"} ${groupGap}`}>
                    {/* Emoji picker */}
                    {emojiPickerFor === msg.id && (
                      <div
                        className={`absolute bottom-[calc(100%-4px)] z-[160] ${isOwn ? "right-0" : "left-0"}`}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-[#EFEFEF] px-3 py-2.5 flex gap-3">
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
                        </div>
                      </div>
                    )}

                    {/* Context menu */}
                    {contextMenuFor === msg.id && (
                      <div
                        className={`absolute bottom-[calc(100%+4px)] z-[160] ${isOwn ? "right-0" : "left-0"}`}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="bg-white rounded-2xl shadow-lg border border-[#EFEFEF] overflow-hidden min-w-[140px]">
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setContextMenuFor(null); setReplyingTo(msg) }}
                            className="w-full text-left px-4 py-3 text-[14px] text-[#13101A] flex items-center gap-2.5 hover:bg-[#FBF8F2] active:bg-[#F3EDE6] transition-colors border-b border-[#F3EDE6]"
                          >
                            <CornerUpLeft className="w-4 h-4 text-[#5A5466]" />
                            Reply
                          </button>
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

                    {/* Sender name + time — above first bubble only, incoming only */}
                    {!isOwn && isFirstInGroup && (
                      <div className="flex items-baseline gap-1.5 mb-1 ml-9">
                        <span className="text-[13px] font-semibold text-[#13101A]">{msg.sender_name}</span>
                        <span className="text-[12px] text-[#8A8497]">{formatMessageTime(msg.created_at)}</span>
                      </div>
                    )}

                    {/* Avatar + bubble row */}
                    <div className={`flex items-end gap-2 w-full ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                      {/* Avatar — shown for every incoming message */}
                      {!isOwn && (
                        <div
                          className={`w-7 h-7 flex items-center justify-center text-[11px] font-bold text-[#F6F4EF] flex-shrink-0 overflow-hidden ${getAvatarColor(msg.sender_name)}`}
                          style={{ borderRadius: "10px", alignSelf: "flex-end" }}
                        >
                          {msg.sender_avatar_url
                            ? <img src={msg.sender_avatar_url} alt={msg.sender_name} className="w-full h-full object-cover" />
                            : msg.sender_name.charAt(0).toUpperCase()
                          }
                        </div>
                      )}

                      <div
                        title="Long-press for reply and reactions"
                        onPointerDown={() => handlePointerDown(msg)}
                        onPointerUp={() => handlePointerUp(msg)}
                        onPointerLeave={handlePointerCancel}
                        onPointerCancel={handlePointerCancel}
                        className={`max-w-[75%] text-[14px] leading-[1.4] select-none ${
                          msg.deleted
                            ? isOwn
                              ? `bg-[#2D0F2E]/30 text-white/50 ${outgoingRadius} px-4 py-2`
                              : `bg-[#FBF8F2] border border-[#E8E2D2] text-[#8A8497] ${incomingRadius} px-4 py-2`
                            : isOwn
                              ? `bg-[#2D0F2E] text-[#F6F4EF] ${outgoingRadius}`
                              : `bg-[#FBF8F2] border border-[#E8E2D2] text-[#13101A] ${incomingRadius}`
                        } ${!msg.deleted && msg.reply_to_id ? "" : !msg.deleted ? "px-4 py-2.5" : ""}`}
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
                            <div className={msg.reply_to_id ? "px-4 pt-2 pb-2.5" : ""}>
                              {msg.content}
                            </div>
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
                              <Avatar
                                key={`${name}-${idx}`}
                                title={`Read by ${name}`}
                                className={`w-4 h-4 flex-shrink-0 border border-[#F1EDE6] overflow-hidden ${getAvatarColor(name)}${idx > 0 ? " -ml-1" : ""}`}
                              >
                                {avatarUrl && <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />}
                                <AvatarFallback className="text-white bg-transparent" style={{ fontSize: "6px", fontWeight: 700 }}>
                                  {name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
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
                <div
                  className={`w-7 h-7 flex items-center justify-center text-[11px] font-bold text-[#F6F4EF] flex-shrink-0 ${getAvatarColor(name)}`}
                  style={{ borderRadius: "10px" }}
                >
                  {avatarUrl
                    ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover rounded-[10px]" />
                    : name.charAt(0).toUpperCase()
                  }
                </div>
                <div className="bg-[#FBF8F2] border border-[#E8E2D2] rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
                <span style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: "12px", color: "#8A8497" }}>{name} is typing…</span>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Reply preview bar ── */}
      {replyingTo && (
        <div className="flex-shrink-0 bg-[#FBF8F2] border-t border-[#E8E2D2] px-4 py-2 flex items-start gap-3">
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

      {/* ── Input bar ── */}
      {groupArchived ? (
        <div className="flex-shrink-0 bg-[#FBF8F2] border-t border-[#E8E2D2] px-4 py-3 flex items-center justify-center">
          <p className="text-[13px] text-[#8A8497]">This chat is archived</p>
        </div>
      ) : (
        <div className="flex-shrink-0 bg-[#FBF8F2] border-t border-[#E8E2D2] px-4 py-3 md:px-10 md:py-3.5">
          <div className="flex items-center gap-2 border border-[#E2DDCF] rounded-2xl bg-[#F8F4EA] px-3" style={{ minHeight: 44 }}>
            <button className="flex-shrink-0 text-[#5A5466] hover:text-[#13101A] transition-colors">
              <Plus className="w-4 h-4" />
            </button>
            <textarea
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${displayName}`}
              rows={1}
              className="flex-1 resize-none bg-transparent text-[14px] text-[#13101A] placeholder:text-[#8A8497] focus:outline-none border-none max-h-28 overflow-y-auto self-center"
              style={{ lineHeight: "1.5", paddingTop: 0, paddingBottom: 0 }}
            />
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button className="hidden md:flex w-7 h-7 items-center justify-center rounded-lg text-[#5A5466] text-[13px] font-bold hover:bg-[#E8E2D2] transition-colors">B</button>
              <button className="hidden md:flex w-7 h-7 items-center justify-center rounded-lg text-[#5A5466] text-[13px] italic hover:bg-[#E8E2D2] transition-colors">I</button>
              <button className="hidden md:flex w-7 h-7 items-center justify-center rounded-lg text-[#5A5466] text-[14px] hover:bg-[#E8E2D2] transition-colors">🙂</button>
              <button className="hidden md:flex w-7 h-7 items-center justify-center rounded-lg text-[#5A5466] text-[13px] hover:bg-[#E8E2D2] transition-colors">@</button>
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || sending}
                className="flex-shrink-0 flex items-center justify-center disabled:opacity-40 hover:bg-[#13101A] transition-all active:scale-95 bg-[#2D0F2E] ml-1"
                style={{ width: 34, height: 34, borderRadius: 10 }}
              >
                <Send className="w-4 h-4 text-white" style={{ transform: "rotate(-30deg)" }} />
              </button>
            </div>
          </div>
          <div className="hidden md:flex justify-between mt-2 text-[11px] text-[#A09A8C]">
            <span>Press <span style={{ fontFamily: "ui-monospace,monospace" }}>↵</span> to send · <span style={{ fontFamily: "ui-monospace,monospace" }}>⇧↵</span> for new line</span>
            <span>End-to-end visible to {displayName} members</span>
          </div>
        </div>
      )}

      {/* Overlay to dismiss emoji / context menu */}
      {(emojiPickerFor || contextMenuFor) && (
        <div
          className="fixed inset-0 z-[155] md:left-[296px]"
          onClick={() => { setEmojiPickerFor(null); setContextMenuFor(null) }}
        />
      )}
    </div>
    </div>

    {showSettings && (
      <ChatSettings
        groupId={groupId}
        groupName={displayName}
        groupType={groupType}
        groupArchived={groupArchived}
        userId={userId}
        ministryId={ministryId}
        userRole={userRole}
        onBack={() => setShowSettings(false)}
        onNameChange={(name) => { setDisplayName(name); onNameChange?.(name) }}
        onClose={() => { setShowSettings(false); onClose() }}
      />
    )}
    </>
  )
}

export function ChatsTab({ userId, userProfile, userRole, ministryId, ministryName, onOpenChat, onTotalUnreadChange, refreshKey, onOpenDirectory, activeGroupId, canCreateChurchChat }: ChatsTabProps) {
  const supabase = createClient()
  const [subTab, setSubTab] = useState<"church" | "my">("church")
  const [churchChats, setChurchChats] = useState<ChatGroup[]>([])
  const [archivedChurchChats, setArchivedChurchChats] = useState<ChatGroup[]>([])
  const [myChats, setMyChats] = useState<ChatGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateChat, setShowCreateChat] = useState<"my" | "church" | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")

  const isAdminOrLeader = ["admin", "leader"].includes(userRole.toLowerCase())

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("group_members")
        .select("groups(id, name, type, archived), last_read_at")
        .eq("user_id", userId)

      type RawMember = {
        groups: { id: string; name: string; type: string; archived: boolean | null } | { id: string; name: string; type: string; archived: boolean | null }[] | null
        last_read_at: string | null
      }

      const allWithLastRead = (data ?? [])
        .map((m: RawMember) => {
          if (!m.groups) return null
          const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
          if (!g) return null
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
      <div className="hidden md:block px-4 pt-5 pb-4 border-b border-[#E5E0D2] flex-shrink-0">
        <p style={monoStyle}>Workspace</p>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", lineHeight: 1.1, color: "#13101A", marginTop: "4px" }}>{ministryName}</p>
      </div>

      {/* Desktop search */}
      <div className="hidden md:flex items-center gap-2 mx-3 my-3 px-3 py-2 border border-[#E5E0D2] rounded-lg bg-[#F4F1E8] text-[#8A8497] flex-shrink-0">
        <Search className="w-3.5 h-3.5 flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages"
          className="flex-1 text-[12px] bg-transparent outline-none placeholder:text-[#8A8497] text-[#13101A]"
        />
      </div>

      <div className="px-5 pt-14 pb-2 md:pt-2 md:px-2 md:flex-1 md:overflow-y-auto">
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

      {/* Sub-tab switcher — mobile pill / desktop mono labels */}
      <div className="flex items-center gap-1 bg-[#FBF8F2] rounded-xl p-1 mb-5 md:bg-transparent md:p-0 md:mb-1 md:mx-1">
        {(["church", "my"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setSubTab(t); setSearch("") }}
            className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all
              md:py-1.5 md:px-2 md:rounded-lg md:text-left md:flex-none
              ${subTab === t
                ? "bg-white text-[#3E1540] shadow-sm md:bg-[#EFEAE0] md:shadow-none md:text-[#13101A]"
                : "text-[#8A8497] hover:text-[#3E1540]/70 md:text-[#8A8497] md:hover:bg-[#F4F1E8] md:bg-transparent"
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
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "26px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, margin: 0 }}
          className="md:hidden">
          {subTab === "church" ? "Church chats" : "My chats"}
        </h3>
        {/* Desktop mono section label */}
        <p className="hidden md:block mx-1 mb-1" style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8497" }}>
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
        <div className="flex flex-col gap-2.5 md:gap-0.5">
          {active.map((group, i) => (
            <ChatGroupCard key={group.id} group={group} onClick={() => onOpenChat(group.id, group.name)} isActive={activeGroupId === group.id} />
          ))}

          {/* Archived section (Church Chats only) */}
          {subTab === "church" && archivedChurchChats.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowArchived((s) => !s)}
                className="w-full flex items-center justify-between py-3 px-1"
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
                      <ChatGroupCard group={group} onClick={() => onOpenChat(group.id, group.name)} />
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

      {/* Desktop: New chat button at bottom */}
      <div className="hidden md:block mx-3 mt-auto pt-2 pb-3 flex-shrink-0">
        <button
          onClick={() => setShowCreateChat("my")}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-[#E5E0D2] rounded-lg text-[12px] text-[#5A5466] hover:bg-[#F4F1E8] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New chat
        </button>
      </div>
    </div>
  )
}

export function ChatGroupCard({ group, onClick, isActive }: { group: ChatGroup; onClick: () => void; isActive?: boolean }) {
  const avatarBg = getAvatarColor(group.name) === "bg-[#3E1540]" ? "#3E1540" : "#13101A"
  const firstInitial = group.name.charAt(0)

  return (
    <button onClick={onClick} className="w-full text-left group">
      {/* Mobile style */}
      <div className="md:hidden bg-[#FBF8F2] border border-[#ECE8DE] rounded-[18px] p-4 hover:bg-[#F5F0E8] transition-colors">
        <div className="flex items-center gap-3.5">
          <Avatar className="w-12 h-12 flex-shrink-0" style={{ background: avatarBg, borderRadius: "16px" }}>
            <AvatarFallback className="text-[#F6F4EF] bg-transparent" style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400 }}>
              {firstInitial}
            </AvatarFallback>
          </Avatar>
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

      {/* Desktop Plan C panel item style */}
      <div
        className="hidden md:flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-[#F4F1E8] transition-colors"
        style={{
          background: isActive ? "#EFEAE0" : "transparent",
          borderLeft: isActive ? "2px solid #3E1540" : "2px solid transparent",
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: avatarBg, color: "#F6F4EF",
          display: "grid", placeItems: "center",
          fontFamily: "var(--font-instrument-serif)", fontSize: "13px",
        }}>
          {firstInitial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: group.unread_count ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group.name}</div>
          {group.last_message && (
            <div style={{ fontSize: "11px", color: "#8A8497", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {group.last_sender ? `${group.last_sender}: ${group.last_message}` : group.last_message}
            </div>
          )}
        </div>
        {group.unread_count > 0 && (
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#13101A", background: "#C9A34B", padding: "1px 6px", borderRadius: 999 }}>{group.unread_count}</span>
        )}
      </div>
    </button>
  )
}
