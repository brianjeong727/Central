"use client"

import { useState, useEffect } from "react"
import { Search, ArrowLeft, MessageCircle, Heart, ChevronRight, Users } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { createGroup } from "@/app/actions/create-group"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Spinner, EmptyState, AnimateIn } from "../components/shared"
import { getInitials, getAvatarColor } from "../utils"
import { DesktopTopbar } from "../components/desktop-nav"
import type { DirectoryMember } from "../types"

export function DirectoryTab({ currentUserId, currentUserName, ministryId, ministryName, initialMemberId, onMemberSelect, onOpenChat, onBack }: { currentUserId: string; currentUserName: string; ministryId: string; ministryName: string; initialMemberId?: string; onMemberSelect?: (id: string | null) => void; onOpenChat: (id: string, name: string) => void; onBack?: () => void }) {
  const supabase = createClient()
  const [members, setMembers] = useState<DirectoryMember[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DirectoryMember | null>(null)

  function selectMember(member: DirectoryMember | null) {
    setSelected(member)
    onMemberSelect?.(member?.id ?? null)
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, graduation_year, role, email, about_me, bible_verse, prayer_request, pray_for_me, bio, testimony, favorite_verse, favorite_worship_song, favorite_book_of_bible, avatar_url")
        .eq("ministry_id", ministryId)
        .order("name")
      const list = data ?? []
      setMembers(list)
      const restored = initialMemberId ? list.find((m) => m.id === initialMemberId) : null
      setSelected(restored ?? list[0] ?? null)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    if (search && filtered.length === 0) selectMember(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, search])

  return (
    <div className="pb-2 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">

      {/* Desktop Topbar — full-width row */}
      <DesktopTopbar
        crumbs={selected ? ["Central", "Directory", selected.name] : ["Central", "Directory"]}
      />

      {/* ── Desktop: split-pane row ── */}
      <div className="hidden md:flex md:flex-1 md:overflow-hidden">

      {/* ── Desktop: left member list panel ── */}
      <div className="flex flex-col w-[260px] flex-shrink-0 border-r border-[#ECE8DE] h-full overflow-hidden" style={{ background: "#F4F1E8" }}>
        {/* Search */}
        <div className="px-3 py-3 border-b border-[#ECE8DE]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8A8497]" />
            <input
              type="text"
              placeholder="Search members"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg border border-[#E5E0D2] text-[12.5px] text-[#13101A] placeholder:text-[#8A8497] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
            />
          </div>
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Users size={20} strokeWidth={1.5} />}
                title="No members found"
                subtitle={search ? "Try a different name" : "No members in the directory yet"}
              />
            </div>
          ) : (
            filtered.map((member) => {
              const isActive = selected?.id === member.id
              return (
                <button
                  key={member.id}
                  onClick={() => selectMember(member)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[#ECE8DE]/60 active:bg-[#ECE8DE] transition-colors duration-100"
                  style={{
                    borderLeft: isActive ? "2px solid #3E1540" : "2px solid transparent",
                    background: isActive ? "rgba(62,21,64,0.06)" : undefined,
                  }}
                >
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: "#13101A",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {member.avatar_url
                      ? <img src={member.avatar_url} alt={member.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 13, color: "#F6F4EF", fontWeight: 400 }}>{getInitials(member.name)}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#13101A] truncate leading-tight">
                      {member.name}
                      {member.id === currentUserId && <span className="ml-1.5 text-[10px] text-[#8A8497] font-normal">you</span>}
                    </p>
                    <p className="text-[11px] text-[#8A8497] truncate leading-tight mt-0.5">
                      {member.graduation_year ? `'${String(member.graduation_year).slice(2)}` : ""}
                      {member.graduation_year && member.role ? " · " : ""}
                      {member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : ""}
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Desktop: right detail panel ── */}
      <div className="flex flex-1 overflow-y-auto flex-col" style={{ background: "#FDFBF7" }}>
        {selected ? (
          <MemberDetailPanel
            member={selected}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            onOpenChat={onOpenChat}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Users className="w-9 h-9 text-[#C4C4C4] mx-auto mb-3" />
              <p className="text-[14px] font-semibold text-[#8A8497]">Select a member</p>
              <p className="text-[12px] text-[#C4C4C4] mt-1">Choose someone from the list</p>
            </div>
          </div>
        )}
      </div>

      </div>{/* end split-pane row */}

      {/* ── Mobile: header + card list ── */}
      <div className="md:hidden">
        <div className="px-5 pt-14 pb-5">
          <div className="flex items-center gap-2.5 mb-4">
            {onBack && (
              <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F4F1E8] transition-colors -ml-1 mr-0.5" aria-label="Back">
                <ArrowLeft className="w-5 h-5 text-[#3E1540]" />
              </button>
            )}
            <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "36px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>Directory</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4C4C4]" />
            <input
              type="text"
              placeholder="Search members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FBF8F2] border border-[#EFEFEF] text-[13px] placeholder:text-[#C4C4C4] text-[#13101A] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/30 transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="px-5"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="px-5">
            <EmptyState
              icon={<Users className="w-7 h-7" />}
              title="No members found"
              subtitle={search ? "Try a different name" : "No members in the directory yet"}
            />
          </div>
        ) : (
          <div className="px-5 pb-4 flex flex-col gap-3">
            {filtered.map((member) => (
              <button
                key={member.id}
                onClick={() => setSelected(member)}
                className="w-full bg-white rounded-2xl border border-[#EFEFEF] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all text-left"
              >
                <div className="flex items-center gap-3.5">
                  <Avatar className="w-11 h-11 bg-[#3E1540]">
                    {member.avatar_url && <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover rounded-full" />}
                    <AvatarFallback className="text-white font-bold text-[11px] bg-transparent tracking-wide">{getInitials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[#13101A] text-[14px] tracking-tight">{member.name}</h3>
                      {member.id === currentUserId && (
                        <span className="text-[10px] bg-[#FBF8F2] text-[#9CA3AF] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide">You</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {member.graduation_year && <span className="text-[11px] text-[#8A8497] font-medium">Class of {member.graduation_year}</span>}
                      {member.role && (
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide border ${["admin","leader"].includes(member.role.toLowerCase()) ? "bg-[#3E1540] text-white border-[#3E1540]" : member.role.toLowerCase() === "visitor" ? "bg-white text-[#8A8497] border-[#D8D3C8]" : "bg-[#F4F1E8] text-[#3E1540] border-transparent"}`}>
                          {member.role}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#C4C4C4] flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile: full-screen member sheet */}
      {selected && (
        <div className="md:hidden">
          <MemberSheet
            member={selected}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            onClose={() => selectMember(null)}
            onOpenChat={(id, name) => {
              selectMember(null)
              onOpenChat(id, name)
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Desktop inline detail panel ─────────────────────────────────────────────

function MemberDetailPanel({ member, currentUserId, currentUserName, onOpenChat }: {
  member: DirectoryMember
  currentUserId: string
  currentUserName: string
  onOpenChat: (id: string, name: string) => void
}) {
  const supabase = createClient()
  const [dmLoading, setDmLoading] = useState(false)
  const [prayingFor, setPrayingFor] = useState(false)
  const isOwnProfile = member.id === currentUserId

  async function handleMessage() {
    setDmLoading(true)
    const { data: myGroups } = await supabase
      .from("group_members")
      .select("group_id, groups!inner(type)")
      .eq("user_id", currentUserId)

    const myDmGroupIds = (myGroups ?? [])
      .filter((m: { groups: { type: string } | { type: string }[] | null }) => {
        const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
        return g?.type === "dm"
      })
      .map((m: { group_id: string }) => m.group_id)

    if (myDmGroupIds.length > 0) {
      const { data: shared } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", member.id)
        .in("group_id", myDmGroupIds)
        .limit(1)

      if (shared && shared.length > 0) {
        setDmLoading(false)
        onOpenChat(shared[0].group_id, member.name)
        return
      }
    }

    const { group: newGroup, error: dmErr } = await createGroup({
      name: member.name,
      type: "dm",
      memberIds: [member.id],
      createdBy: currentUserId,
    })
    setDmLoading(false)
    if (dmErr || !newGroup) return
    onOpenChat(newGroup.id, newGroup.name)
  }

  const infoRows = [
    { label: "EMAIL", value: member.email },
    { label: "PHONE", value: member.phone || null },
    { label: "ROLE", value: member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : null },
    { label: "CLASS", value: member.graduation_year ? `Class of ${member.graduation_year}` : null },
  ].filter(r => r.value)

  return (
    <div className="flex flex-col items-center px-16 py-16">
      {/* Avatar */}
      <div
        style={{
          width: 120, height: 120, borderRadius: "50%",
          background: "#3E1540",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 28, overflow: "hidden", flexShrink: 0,
        }}
      >
        {member.avatar_url
          ? <img src={member.avatar_url} alt={member.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, color: "#F6F4EF", fontWeight: 400 }}>{getInitials(member.name)}</span>
        }
      </div>

      {/* Name */}
      <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 42, fontWeight: 400, color: "#13101A", letterSpacing: "-0.02em", margin: "0 0 10px", lineHeight: 1.1, textAlign: "center" }}>
        {member.name}
      </h1>

      {/* Subtitle */}
      <p style={{ fontSize: 13.5, color: "#8A8497", margin: "0 0 28px", textAlign: "center" }}>
        {[
          member.graduation_year ? `Class of ${member.graduation_year}` : null,
          member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : null,
        ].filter(Boolean).join(" · ")}
      </p>
      <p style={{ fontSize: 12, color: "#8A8497", margin: "-16px 0 28px", textAlign: "center", maxWidth: 360, lineHeight: 1.45 }}>
        Shared profile details are visible to members in this ministry.
      </p>

      {/* Action buttons */}
      {!isOwnProfile && (
        <div style={{ display: "flex", gap: 10, marginBottom: 40 }}>
          <button
            onClick={handleMessage}
            disabled={dmLoading}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "10px 22px", borderRadius: 9999,
              background: "#3E1540", color: "#F6F4EF",
              border: "none", fontSize: 13.5, fontWeight: 500,
              cursor: dmLoading ? "not-allowed" : "pointer",
              opacity: dmLoading ? 0.6 : 1,
            }}
          >
            <MessageCircle style={{ width: 15, height: 15 }} />
            {dmLoading ? "Opening…" : "Message"}
          </button>
          <button
            onClick={() => setPrayingFor((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "10px 22px", borderRadius: 9999,
              background: prayingFor ? "#F4F1E8" : "white",
              color: prayingFor ? "#3E1540" : "#5A5466",
              border: "1.5px solid #ECE8DE",
              fontSize: 13.5, fontWeight: 500, cursor: "pointer",
            }}
          >
            <Heart style={{ width: 15, height: 15, fill: prayingFor ? "#3E1540" : "none" }} />
            {prayingFor ? "Praying" : "Pray for"}
          </button>
        </div>
      )}

      {/* Info rows */}
      <div style={{ width: "100%", maxWidth: 480, borderTop: "1px solid #ECE8DE" }}>
        {infoRows.map((row) => (
          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, padding: "14px 0", borderBottom: "1px solid #ECE8DE", alignItems: "start" }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "#8A8497", textTransform: "uppercase", paddingTop: 1 }}>{row.label}</span>
            <span style={{ fontSize: 14, color: "#13101A" }}>{row.value}</span>
          </div>
        ))}

        {/* Profile fields — new fields with fallback to legacy */}
        {(() => {
          const aboutVal = member.bio || member.about_me
          const verseVal = member.favorite_verse || member.bible_verse
          const rows: { label: string; value: string; italic?: boolean }[] = []
          if (aboutVal) rows.push({ label: "ABOUT", value: aboutVal })
          if (member.testimony) rows.push({ label: "TESTIMONY", value: member.testimony })
          if (verseVal) rows.push({ label: "VERSE", value: verseVal, italic: true })
          if (member.favorite_worship_song) rows.push({ label: "WORSHIP SONG", value: member.favorite_worship_song })
          if (member.favorite_book_of_bible) rows.push({ label: "FAVORITE BOOK", value: member.favorite_book_of_bible })
          if (member.prayer_request) rows.push({ label: "PRAYER", value: member.prayer_request })
          return rows.map(row => (
            <div key={row.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, padding: "14px 0", borderBottom: "1px solid #ECE8DE", alignItems: "start" }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "#8A8497", textTransform: "uppercase", paddingTop: 1 }}>{row.label}</span>
              <span style={{ fontSize: 14, color: row.italic ? "#3E1540" : "#5A5466", lineHeight: 1.65, fontStyle: row.italic ? "italic" : "normal", fontFamily: row.italic ? "var(--font-instrument-serif)" : "inherit" }}>{row.value}</span>
            </div>
          ))
        })()}
      </div>
    </div>
  )
}

// ── Mobile full-screen sheet (unchanged) ────────────────────────────────────

export function MemberSheet({
  member,
  currentUserId,
  currentUserName,
  onClose,
  onOpenChat,
}: {
  member: DirectoryMember
  currentUserId: string
  currentUserName: string
  onClose: () => void
  onOpenChat: (id: string, name: string) => void
}) {
  const supabase = createClient()
  const [dmLoading, setDmLoading] = useState(false)
  const isOwnProfile = member.id === currentUserId

  async function handleSendMessage() {
    setDmLoading(true)

    const { data: myGroups } = await supabase
      .from("group_members")
      .select("group_id, groups!inner(type)")
      .eq("user_id", currentUserId)

    const myDmGroupIds = (myGroups ?? [])
      .filter((m: { groups: { type: string } | { type: string }[] | null }) => {
        const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
        return g?.type === "dm"
      })
      .map((m: { group_id: string }) => m.group_id)

    if (myDmGroupIds.length > 0) {
      const { data: shared } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", member.id)
        .in("group_id", myDmGroupIds)
        .limit(1)

      if (shared && shared.length > 0) {
        setDmLoading(false)
        onOpenChat(shared[0].group_id, member.name)
        return
      }
    }

    const { group: newGroup, error: dmErr } = await createGroup({
      name: member.name,
      type: "dm",
      memberIds: [member.id],
      createdBy: currentUserId,
    })

    setDmLoading(false)
    if (dmErr || !newGroup) return
    onOpenChat(newGroup.id, newGroup.name)
  }

  return (
    <AnimateIn className="fixed inset-0 z-[60] bg-white flex flex-col">
      <div className="max-w-[390px] mx-auto w-full h-full flex flex-col bg-white">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 bg-white border-b border-[#ECE8DE]">
          <button
            onClick={onClose}
            className="size-8 bg-[#FBF8F2] rounded-full flex items-center justify-center hover:bg-[#F2EDE0] transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-[#5A5466]" />
          </button>
          <Avatar className={`w-9 h-9 flex-shrink-0 rounded-full ${getAvatarColor(member.name)}`}>
            {member.avatar_url && <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover rounded-full" />}
            <AvatarFallback className="text-white font-bold text-[13px] bg-transparent">
              {getInitials(member.name)}
            </AvatarFallback>
          </Avatar>
          <h2 className="flex-1 min-w-0 text-[15px] font-bold text-[#13101A] tracking-tight truncate">
            {member.name}
          </h2>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="flex flex-col items-center mb-7">
            <Avatar className={`w-20 h-20 ${getAvatarColor(member.name)} mb-4`}>
              {member.avatar_url && <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover rounded-full" />}
              <AvatarFallback className="text-white font-bold text-2xl bg-transparent">
                {getInitials(member.name)}
              </AvatarFallback>
            </Avatar>
            <h1 className="text-[22px] font-bold text-[#13101A] tracking-tight mb-2">{member.name}</h1>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {member.graduation_year && (
                <span className="text-[12px] text-[#8A8497]">Class of {member.graduation_year}</span>
              )}
              {member.role && (
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide border ${["admin","leader"].includes(member.role.toLowerCase()) ? "bg-[#3E1540] text-white border-[#3E1540]" : member.role.toLowerCase() === "visitor" ? "bg-white text-[#8A8497] border-[#D8D3C8]" : "bg-[#F4F1E8] text-[#3E1540] border-transparent"}`}>
                  {member.role}
                </span>
              )}
              {isOwnProfile && (
                <span className="text-[10px] bg-[#3E1540]/10 text-[#3E1540] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">You</span>
              )}
            </div>
            <p className="mt-3 text-[12px] text-[#8A8497] text-center leading-relaxed max-w-[270px]">
              Shared profile details are visible to members in this ministry.
            </p>
          </div>

          {(() => {
            const monoLabel: React.CSSProperties = { fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8497", margin: 0, marginBottom: 4 }
            const aboutVal = member.bio || member.about_me
            const verseVal = member.favorite_verse || member.bible_verse

            const sections: { id: string; label: string; fields: { label: string; value: string; italic?: boolean }[] }[] = [
              {
                id: "contact", label: "Contact",
                fields: [
                  member.graduation_year ? { label: "Graduation year", value: String(member.graduation_year) } : null,
                  member.phone ? { label: "Phone", value: member.phone } : null,
                ].filter(Boolean) as { label: string; value: string }[]
              },
              {
                id: "about", label: "About",
                fields: aboutVal ? [{ label: "Bio", value: aboutVal }] : []
              },
              {
                id: "faith", label: "Faith",
                fields: [
                  member.testimony ? { label: "Testimony", value: member.testimony } : null,
                  verseVal ? { label: "Favorite verse", value: verseVal, italic: true } : null,
                  member.favorite_worship_song ? { label: "Favorite worship song", value: member.favorite_worship_song } : null,
                  member.favorite_book_of_bible ? { label: "Favorite book of the Bible", value: member.favorite_book_of_bible } : null,
                ].filter(Boolean) as { label: string; value: string; italic?: boolean }[]
              },
              {
                id: "prayer", label: "Prayer",
                fields: member.prayer_request ? [{ label: "Prayer request", value: member.prayer_request }] : []
              }
            ].filter(s => s.fields.length > 0)

            if (sections.length === 0) {
              return (
                <div className="flex items-center justify-center py-10">
                  <p className="text-[13px] text-[#8A8497]/60">No details shared yet</p>
                </div>
              )
            }

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {sections.map(section => (
                  <div key={section.id}>
                    <p style={{ ...monoLabel, marginBottom: 10 }}>{section.label}</p>
                    <div style={{ border: "1px solid #E5E0D2", borderRadius: 12, overflow: "hidden", background: "#FBF8F2" }}>
                      {section.fields.map((field, i) => (
                        <div key={field.label} style={{ padding: "14px 18px", borderTop: i > 0 ? "1px solid #E5E0D2" : "none" }}>
                          <p style={monoLabel}>{field.label}</p>
                          <p style={{ fontSize: 14, color: field.italic ? "#3E1540" : "#13101A", lineHeight: 1.65, whiteSpace: "pre-wrap", margin: 0, fontStyle: field.italic ? "italic" : "normal", fontFamily: field.italic ? "var(--font-instrument-serif)" : "inherit" }}>{field.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {!isOwnProfile && (
          <div className="flex-shrink-0 bg-white border-t border-[#ECE8DE] px-5 py-4">
            <button
              onClick={handleSendMessage}
              disabled={dmLoading}
              className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-50 text-white font-semibold py-4 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px] tracking-wide shadow-[0_2px_8px_rgba(19,16,26,0.08)]"
            >
              {dmLoading ? "Opening chat…" : "Send Message"}
            </button>
          </div>
        )}
      </div>
    </AnimateIn>
  )
}
