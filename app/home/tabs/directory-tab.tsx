"use client"

import { useState, useEffect } from "react"
import { Search, X, ArrowLeft, MessageCircle, Users, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { createGroup } from "@/app/actions/create-group"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Spinner, EmptyState, MONO_STYLE } from "../components/shared"
import { getInitials, getAvatarColor } from "../utils"
import { DesktopTopbar } from "../components/desktop-nav"
import type { DirectoryMember } from "../types"

export function DirectoryTab({ currentUserId, currentUserName, ministryId, ministryName, onOpenChat, onBack }: { currentUserId: string; currentUserName: string; ministryId: string; ministryName: string; onOpenChat: (id: string, name: string) => void; onBack?: () => void }) {
  const supabase = createClient()
  const [members, setMembers] = useState<DirectoryMember[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DirectoryMember | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, graduation_year, role, email, about_me, bible_verse, prayer_request, pray_for_me, avatar_url")
        .eq("ministry_id", ministryId)
        .order("name")
      setMembers(data ?? [])
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="pb-2 md:pb-0">
      {/* Desktop Topbar */}
      <DesktopTopbar crumbs={["Central", "Directory"]} right={
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-[#E5E0D2] rounded-full bg-[#F4F1E8] text-[#8A8497]" style={{ width: "280px" }}>
          <Search className="w-3.5 h-3.5 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by name, year, prayer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-[12px] bg-transparent outline-none placeholder:text-[#8A8497] text-[#13101A]"
          />
        </div>
      } />

      {/* Mobile Header */}
      <div className="px-5 pt-14 pb-5 md:hidden">
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

      {/* Desktop Editorial Header */}
      <div className="hidden md:flex items-end justify-between px-14 pt-11 pb-8 border-b border-[#E5E0D2]" style={{ gap: "24px" }}>
        <div>
          <p style={MONO_STYLE}>{members.length} members · {members.filter(m => ["admin","leader"].includes(m.role.toLowerCase())).length} leaders</p>
          <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-instrument-serif)", fontWeight: 400, fontSize: "52px", lineHeight: 1.05, letterSpacing: "-0.01em", color: "#13101A" }}>
            Directory
          </h1>
          <p style={{ marginTop: "12px", color: "#5A5466", fontSize: "14px", maxWidth: "560px" }}>
            Names, faces, what they&apos;re carrying. A chance to know and pray.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="px-5 md:px-14"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="px-5 md:px-14">
          <EmptyState
            icon={<Users className="w-7 h-7" />}
            title="No members found"
            subtitle={search ? "Try a different name" : "No members in the directory yet"}
          />
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden px-5 pb-4 flex flex-col gap-3">
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
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide ${["admin","leader"].includes(member.role.toLowerCase()) ? "bg-[#3E1540] text-white" : "bg-[#F4F1E8] text-[#3E1540]"}`}>
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

          {/* Desktop table */}
          <div className="hidden md:block px-14 py-7">
            <div className="rounded-xl border border-[#E5E0D2] bg-[#FBF8F2] overflow-hidden">
              <div className="grid px-5 py-2.5 border-b border-[#E5E0D2]" style={{ gridTemplateColumns: "1.4fr 100px 1fr 1.4fr 60px", gap: "12px" }}>
                {["Name", "Class", "Role", "Praying for", ""].map((h, i) => (
                  <span key={i} style={MONO_STYLE}>{h}</span>
                ))}
              </div>
              {filtered.map((member, i) => (
                <button
                  key={member.id}
                  onClick={() => setSelected(member)}
                  className="w-full grid px-5 py-3 text-left items-center hover:bg-[#F4F1E8] transition-colors"
                  style={{ gridTemplateColumns: "1.4fr 100px 1fr 1.4fr 60px", gap: "12px", borderTop: i ? "1px solid #EFEAE0" : undefined }}
                >
                  <div className="flex items-center gap-3">
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: i % 2 === 0 ? "#3E1540" : "#13101A",
                      color: "#F6F4EF", display: "grid", placeItems: "center",
                      fontSize: "11px", fontWeight: 600, overflow: "hidden",
                    }}>
                      {member.avatar_url
                        ? <img src={member.avatar_url} alt={member.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : getInitials(member.name)}
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 500 }}>
                        {member.name}
                        {member.id === currentUserId && (
                          <span style={{ fontSize: "10px", color: "#8A8497", letterSpacing: "0.6px", textTransform: "uppercase", marginLeft: "6px" }}>You</span>
                        )}
                      </div>
                      <div style={{ fontSize: "11px", color: "#8A8497" }}>{member.email}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "12px", color: "#5A5466", fontVariantNumeric: "tabular-nums" }}>
                    {member.graduation_year ? `'${String(member.graduation_year).slice(2)}` : "—"}
                  </div>
                  <div>
                    <span style={{
                      fontSize: "10px", letterSpacing: "0.8px", padding: "3px 9px", borderRadius: "6px",
                      background: ["admin","leader"].includes(member.role.toLowerCase()) ? "#3E1540" : "#F4F1E8",
                      color: ["admin","leader"].includes(member.role.toLowerCase()) ? "#F6F4EF" : "#13101A",
                      border: ["admin","leader"].includes(member.role.toLowerCase()) ? "none" : "1px solid #E5E0D2",
                      textTransform: "uppercase", fontWeight: 600,
                    }}>{member.role}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#5A5466", fontStyle: "italic", fontFamily: "var(--font-instrument-serif)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {member.pray_for_me || "—"}
                  </div>
                  <div className="flex justify-end">
                    <ChevronRight className="w-4 h-4 text-[#C4C4C4]" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Member Detail Sheet */}
      {selected && (
        <MemberSheet
          member={selected}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => setSelected(null)}
          onOpenChat={(id, name) => {
            setSelected(null)
            onOpenChat(id, name)
          }}
        />
      )}
    </div>
  )
}

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

    // Check for an existing DM between these two users
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

    // No existing DM — create one named after the other person
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
    <div className="fixed inset-0 z-[60] bg-white flex flex-col md:bg-black/20 md:backdrop-blur-sm md:items-center md:justify-center">
      <div className="max-w-[390px] mx-auto w-full h-full flex flex-col bg-white md:max-w-[580px] md:h-auto md:max-h-[88vh] md:rounded-2xl md:shadow-2xl md:overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-12 pb-3 md:pt-5 bg-white border-b border-[#ECE8DE]">
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
          {/* Avatar hero + name + meta */}
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
                <span className="text-[12px] text-[#8A8497]">
                  Class of {member.graduation_year}
                </span>
              )}
              {member.role && (
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide ${member.role.toLowerCase() === "admin" || member.role.toLowerCase() === "leader" ? "bg-[#3E1540] text-white" : "bg-[#F4F1E8] text-[#3E1540]"}`}>
                  {member.role}
                </span>
              )}
              {isOwnProfile && (
                <span className="text-[10px] bg-[#3E1540]/10 text-[#3E1540] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">
                  You
                </span>
              )}
            </div>
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-3">
            {member.bible_verse && (
              <div className="bg-white rounded-2xl p-5 border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "14px", color: "#3E1540", fontWeight: 400, marginBottom: "6px" }}>
                  Bible verse
                </p>
                <p className="text-[13px] text-[#5A5466] italic leading-relaxed">
                  &ldquo;{member.bible_verse}&rdquo;
                </p>
              </div>
            )}

            {member.prayer_request && (
              <div className="bg-white rounded-2xl p-5 border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "14px", color: "#3E1540", fontWeight: 400, marginBottom: "6px" }}>
                  Prayer request
                </p>
                <p className="text-[13px] text-[#5A5466] leading-relaxed">{member.prayer_request}</p>
              </div>
            )}

            {member.pray_for_me && (
              <div className="bg-white rounded-2xl p-5 border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "14px", color: "#3E1540", fontWeight: 400, marginBottom: "6px" }}>
                  How to pray for me
                </p>
                <p className="text-[13px] text-[#5A5466] leading-relaxed">{member.pray_for_me}</p>
              </div>
            )}

            {member.about_me && (
              <div className="bg-white rounded-2xl p-5 border border-[#EFEFEF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "14px", color: "#3E1540", fontWeight: 400, marginBottom: "6px" }}>
                  About
                </p>
                <p className="text-[13px] text-[#5A5466] leading-relaxed">{member.about_me}</p>
              </div>
            )}

            {!member.bible_verse && !member.prayer_request && !member.pray_for_me && !member.about_me && (
              <div className="flex items-center justify-center py-10">
                <p className="text-[13px] text-[#8A8497]/60">No details shared yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Pinned Send Message button */}
        {!isOwnProfile && (
          <div className="flex-shrink-0 bg-white border-t border-[#ECE8DE] px-5 py-4">
            <button
              onClick={handleSendMessage}
              disabled={dmLoading}
              className="w-full bg-[#3E1540] hover:bg-[#2D0F2E] disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors text-[14px] tracking-wide shadow-[0_2px_8px_rgba(19,16,26,0.08)] active:scale-[0.98]"
            >
              {dmLoading ? "Opening chat…" : "Send Message"}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
