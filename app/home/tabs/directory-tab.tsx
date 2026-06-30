"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { Search, ArrowLeft, MessageCircle, Heart, Users } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { createGroup } from "@/app/actions/create-group"
import { EmptyState } from "../components/shared"
import { TabPageHeader, PageTitle, MonogramChip, DirectoryListSkeleton, SubpageShell } from "@/components/central"
import { getInitials } from "../utils"
import type { DirectoryMember } from "../types"

// Shared directory fetcher — both the desktop panel and the mobile list key on
// ["directory-members", ministryId], so they dedupe to a single request and
// share one cache entry (instant on tab revisit).
async function loadDirectoryMembers(
  supabase: ReturnType<typeof createClient>,
  ministryId: string
): Promise<DirectoryMember[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, graduation_year, role, email, about_me, bible_verse, prayer_request, pray_for_me, bio, testimony, favorite_verse, favorite_worship_song, favorite_book_of_bible, avatar_url")
    .eq("ministry_id", ministryId)
    .order("name")
  return data ?? []
}

// ── DirectoryMemberListPanel — lives in the shell context panel on desktop ─────

export function DirectoryMemberListPanel({
  ministryId,
  currentUserId,
  selectedId,
  initialMemberId,
  onSelect,
}: {
  ministryId: string
  currentUserId: string
  selectedId: string | null | undefined
  initialMemberId?: string | null
  onSelect: (member: DirectoryMember) => void
}) {
  const supabase = createClient()
  const [search, setSearch] = useState("")
  const { data: membersData, isLoading: loading } = useSWR(
    ["directory-members", ministryId],
    () => loadDirectoryMembers(supabase, ministryId)
  )
  const members = membersData ?? []

  // Auto-select on first successful load only (a ref guard keeps background
  // revalidations from clobbering the user's current selection).
  const didInitialSelect = useRef(false)
  useEffect(() => {
    if (!membersData || didInitialSelect.current) return
    didInitialSelect.current = true
    const restored = initialMemberId ? membersData.find((m) => m.id === initialMemberId) : null
    const toSelect = restored ?? membersData[0] ?? null
    if (toSelect) onSelect(toSelect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersData])

  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search */}
      <div className="px-3 py-3 border-b" style={{ borderColor: "var(--line)" }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--muted-text)" }} />
          <input
            type="text"
            placeholder="Search members"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-[12.5px] placeholder:text-[var(--muted-text)] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20"
            style={{
              background: "var(--cream)",
              borderColor: "var(--line-2)",
              color: "var(--ink)",
            }}
          />
        </div>
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="pt-2"><DirectoryListSkeleton /></div>
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
            const isActive = selectedId === member.id
            return (
              <button
                key={member.id}
                onClick={() => onSelect(member)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-100"
                style={{
                  borderLeft: isActive ? "2px solid var(--plum)" : "2px solid transparent",
                  background: isActive ? "rgba(62,21,64,0.06)" : undefined,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--cream-3)" }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "" }}
              >
                <MonogramChip
                  initials={getInitials(member.name)}
                  avatarUrl={member.avatar_url}
                  className="w-8 h-8"
                  style={{ fontFamily: "var(--serif)", fontSize: 12, fontWeight: 400 }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate leading-tight" style={{ color: "var(--ink)" }}>
                    {member.name}
                    {member.id === currentUserId && <span className="ml-1.5 text-[10px] font-normal" style={{ color: "var(--muted-text)" }}>you</span>}
                  </p>
                  <p className="text-[11px] truncate leading-tight mt-0.5" style={{ color: "var(--muted-text)" }}>
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
  )
}

// ── DirectoryTab — desktop: header + detail only; mobile: full self-contained ──

export function DirectoryTab({
  currentUserId,
  currentUserName,
  ministryId,
  ministryName,
  initialMemberId,
  selectedMember,
  onMemberSelect,
  onOpenChat,
  onBack,
}: {
  currentUserId: string
  currentUserName: string
  ministryId: string
  ministryName: string
  initialMemberId?: string
  selectedMember?: DirectoryMember | null
  onMemberSelect?: (id: string | null) => void
  onOpenChat: (id: string, name: string, type?: string) => void
  onBack?: () => void
}) {
  // Mobile-only state — desktop selection is driven by home-app via selectedMember prop
  const supabase = createClient()
  const [mobileSearch, setMobileSearch] = useState("")
  const [mobileSelected, setMobileSelected] = useState<DirectoryMember | null>(null)
  const { data: mobileMembersData, isLoading: mobileLoading } = useSWR(
    ["directory-members", ministryId],
    () => loadDirectoryMembers(supabase, ministryId)
  )
  const mobileMembers = mobileMembersData ?? []

  // Restore the deep-linked member once, on first load.
  const didRestoreMobile = useRef(false)
  useEffect(() => {
    if (!mobileMembersData || didRestoreMobile.current) return
    didRestoreMobile.current = true
    const restored = initialMemberId ? mobileMembersData.find((m) => m.id === initialMemberId) : null
    setMobileSelected(restored ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileMembersData])

  const mobileFiltered = mobileMembers.filter((m) =>
    m.name.toLowerCase().includes(mobileSearch.toLowerCase())
  )

  return (
    <div className="pb-2 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">

      {/* ── Desktop: TabPageHeader + detail pane only ── */}
      <div className="hidden md:flex md:flex-col md:flex-1 md:overflow-hidden" style={{ background: "var(--cream)" }}>

        {/* Page header — matches Finance/Profile exactly */}
        <TabPageHeader>
          <PageTitle title="Directory" compact />
        </TabPageHeader>

        {/* Detail area */}
        <div className="flex-1 overflow-y-auto">
          {selectedMember ? (
            <MemberDetailPanel
              member={selectedMember}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              onOpenChat={onOpenChat}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div style={{
                border: "1px dashed var(--dashed)",
                borderRadius: 14,
                padding: "32px 48px",
                textAlign: "center",
                maxWidth: 320,
              }}>
                <Users style={{ width: 24, height: 24, color: "var(--muted-text)", margin: "0 auto 12px" }} />
                <p style={{ fontSize: 14, color: "var(--body)", fontWeight: 500 }}>Select a member</p>
                <p style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 6 }}>Choose someone from the list on the left.</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Mobile: member list (hidden while a member subpage is open) ── */}
      {!mobileSelected && (
      <div className="md:hidden">
        <div className="px-5 pt-14 pb-5">
          <div className="flex items-center gap-2.5 mb-4">
            {onBack && (
              <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F4F1E8] transition-colors -ml-1 mr-0.5" aria-label="Back">
                <ArrowLeft className="w-5 h-5" style={{ color: "var(--plum)" }} />
              </button>
            )}
            <span style={{ fontFamily: "var(--serif)", fontSize: "36px", color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1, fontWeight: 600 }}>Directory</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted-text)" }} />
            <input
              type="text"
              placeholder="Search members…"
              value={mobileSearch}
              onChange={(e) => setMobileSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border text-[13px] placeholder:text-[var(--muted-text)] focus:outline-none focus:ring-2 focus:ring-[#3E1540]/20 focus:border-[#3E1540]/30 transition-all"
              style={{ background: "var(--cream)", borderColor: "var(--line)", color: "var(--ink)" }}
            />
          </div>
        </div>

        {mobileLoading ? (
          <div className="px-2"><DirectoryListSkeleton /></div>
        ) : mobileFiltered.length === 0 ? (
          <div className="px-5">
            <EmptyState
              icon={<Users className="w-7 h-7" />}
              title="No members found"
              subtitle={mobileSearch ? "Try a different name" : "No members in the directory yet"}
            />
          </div>
        ) : (
          <div className="px-5 pb-4 flex flex-col gap-3">
            {mobileFiltered.map((member) => (
              <button
                key={member.id}
                onClick={() => setMobileSelected(member)}
                className="w-full rounded-2xl border p-4 text-left transition-all"
                style={{
                  background: "var(--cream)",
                  borderColor: "var(--line)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <div className="flex items-center gap-3.5">
                  <MonogramChip initials={getInitials(member.name)} avatarUrl={member.avatar_url} className="w-11 h-11 font-bold text-[11px] tracking-wide" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[14px] tracking-tight" style={{ color: "var(--ink)" }}>{member.name}</h3>
                      {member.id === currentUserId && (
                        <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide" style={{ background: "var(--ivory)", color: "var(--muted-text)" }}>You</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {member.graduation_year && <span className="text-[11px] font-medium" style={{ color: "var(--muted-text)" }}>Class of {member.graduation_year}</span>}
                      {member.role && (
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide border ${["admin","leader","deacon","elder"].includes(member.role.toLowerCase()) ? "bg-[var(--plum)] text-white border-[var(--plum)]" : member.role.toLowerCase() === "visitor" ? "bg-white text-[var(--muted-text)] border-[#D8D3C8]" : "bg-[#F4F1E8] text-[var(--plum)] border-transparent"}`}>
                          {member.role}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Mobile: member detail subpage (swaps in over the list) */}
      {mobileSelected && (
        <div className="md:hidden">
          <MemberSheet
            member={mobileSelected}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            onClose={() => setMobileSelected(null)}
            onOpenChat={(id, name) => {
              setMobileSelected(null)
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
  onOpenChat: (id: string, name: string, type?: string) => void
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
      <MonogramChip
        initials={getInitials(member.name)}
        avatarUrl={member.avatar_url}
        className="flex-shrink-0"
        style={{ width: 120, height: 120, marginBottom: 28, fontFamily: "var(--serif)", fontSize: 40, fontWeight: 400 }}
      />

      {/* Member name — prominent heading in the detail body */}
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: "0 0 10px", lineHeight: 1.1, textAlign: "center" }}>
        {member.name}
      </h2>

      {/* Subtitle */}
      <p style={{ fontSize: 13.5, color: "var(--muted-text)", margin: "0 0 28px", textAlign: "center" }}>
        {[
          member.graduation_year ? `Class of ${member.graduation_year}` : null,
          member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : null,
        ].filter(Boolean).join(" · ")}
      </p>
      <p style={{ fontSize: 12, color: "var(--muted-text)", margin: "-16px 0 28px", textAlign: "center", maxWidth: 360, lineHeight: 1.45 }}>
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
              background: "var(--plum)", color: "var(--cream)",
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
              background: prayingFor ? "var(--ivory)" : "var(--cream)",
              color: prayingFor ? "var(--plum)" : "var(--body)",
              border: "1.5px solid var(--line)",
              fontSize: 13.5, fontWeight: 500, cursor: "pointer",
            }}
          >
            <Heart style={{ width: 15, height: 15, fill: prayingFor ? "var(--plum)" : "none" }} />
            {prayingFor ? "Praying" : "Pray for"}
          </button>
        </div>
      )}

      {/* Info rows */}
      <div style={{ width: "100%", maxWidth: 480, borderTop: "1px solid var(--line)" }}>
        {infoRows.map((row) => (
          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, padding: "14px 0", borderBottom: "1px solid var(--line)", alignItems: "start" }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--muted-text)", textTransform: "uppercase", paddingTop: 1 }}>{row.label}</span>
            <span style={{ fontSize: 14, color: "var(--ink)" }}>{row.value}</span>
          </div>
        ))}

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
            <div key={row.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, padding: "14px 0", borderBottom: "1px solid var(--line)", alignItems: "start" }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--muted-text)", textTransform: "uppercase", paddingTop: 1 }}>{row.label}</span>
              <span style={{ fontSize: 14, color: row.italic ? "var(--plum)" : "var(--body)", lineHeight: 1.65, fontStyle: row.italic ? "italic" : "normal", fontFamily: row.italic ? "var(--serif)" : "inherit" }}>{row.value}</span>
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
  onOpenChat: (id: string, name: string, type?: string) => void
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
    <SubpageShell crumbs={[{ label: "Directory", onClick: onClose }, { label: member.name }]} width="full">
        {/* Identity block */}
        <div>
          <div className="flex flex-col items-center mb-7">
            <MonogramChip initials={getInitials(member.name)} avatarUrl={member.avatar_url} className="w-20 h-20 font-bold text-2xl mb-4" />
            <h1 className="text-[22px] font-bold text-[var(--ink)] tracking-tight mb-2">{member.name}</h1>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {member.graduation_year && (
                <span className="text-[12px] text-[var(--muted-text)]">Class of {member.graduation_year}</span>
              )}
              {member.role && (
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide border ${["admin","leader","deacon","elder"].includes(member.role.toLowerCase()) ? "bg-[var(--plum)] text-white border-[var(--plum)]" : member.role.toLowerCase() === "visitor" ? "bg-white text-[var(--muted-text)] border-[#D8D3C8]" : "bg-[#F4F1E8] text-[var(--plum)] border-transparent"}`}>
                  {member.role}
                </span>
              )}
              {isOwnProfile && (
                <span className="text-[10px] bg-[#3E1540]/10 text-[var(--plum)] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">You</span>
              )}
            </div>
            <p className="mt-3 text-[12px] text-[var(--muted-text)] text-center leading-relaxed max-w-[270px]">
              Shared profile details are visible to members in this ministry.
            </p>
          </div>

          {(() => {
            const monoLabel: React.CSSProperties = { fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", margin: 0, marginBottom: 4 }
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
                    <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--cream-2)" }}>
                      {section.fields.map((field, i) => (
                        <div key={field.label} style={{ padding: "14px 18px", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                          <p style={monoLabel}>{field.label}</p>
                          <p style={{ fontSize: 14, color: field.italic ? "var(--plum)" : "var(--ink)", lineHeight: 1.65, whiteSpace: "pre-wrap", margin: 0, fontStyle: field.italic ? "italic" : "normal", fontFamily: field.italic ? "var(--font-instrument-serif)" : "inherit" }}>{field.value}</p>
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
          <div style={{ marginTop: 28, borderTop: "1px solid var(--line)", paddingTop: 18 }}>
            <button
              onClick={handleSendMessage}
              disabled={dmLoading}
              className="w-full bg-[var(--plum)] hover:bg-[var(--plum-2)] disabled:opacity-50 text-white font-semibold py-4 rounded-xl active:scale-[0.97] transition-[transform,background-color] duration-150 text-[14px] tracking-wide"
            >
              {dmLoading ? "Opening chat…" : "Send Message"}
            </button>
          </div>
        )}
    </SubpageShell>
  )
}
