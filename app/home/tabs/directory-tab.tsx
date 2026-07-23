"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { Search, ArrowLeft, MessageCircle, MoreHorizontal, Heart, Users, Flag, Ban, UserCheck } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { createGroup } from "@/app/actions/create-group"
import { EmptyState } from "../components/shared"
import { TabPageHeader, PageTitle, MonogramChip, DirectoryListSkeleton, SubpageShell, ActionMenu, PocketCard, PocketRow, PocketRowCard, PocketKicker } from "@/components/central"
import type { ActionMenuItem } from "@/components/central"
import { getInitials } from "../utils"
import { roleLabel } from "@/app/actions/super-constants"
import { ReportModal } from "../components/report-modal"
import { useBlocks } from "../use-blocks"
import { blockUser, unblockUser } from "@/app/actions/blocks"
import type { DirectoryMember, DirectoryMemberDetail } from "../types"

// Borderless tonal role tag for phone-width surfaces (mobile spec §3.7): elevated
// roles carry the plum fill; member/visitor get a --line-2 tonal pill. No borders.
function MobileRoleTag({ role, userId }: { role: string; userId: string }) {
  const elevated = ["admin", "leader", "deacon", "elder", "pastor"].includes(role.toLowerCase())
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", borderRadius: 999, padding: "2px 7px", flexShrink: 0, background: elevated ? "var(--plum)" : "var(--line-2)", color: elevated ? "var(--cream-on-dark)" : "var(--body)" }}>
      {roleLabel(role, userId)}
    </span>
  )
}

// "You" identity tag — tonal, borderless, shares the §3.7 mono-pill grammar.
function MobileYouTag() {
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", borderRadius: 999, padding: "2px 7px", flexShrink: 0, background: "var(--line-2)", color: "var(--body)" }}>You</span>
  )
}

// Shared Report/Block overflow menu for a directory member (§1.2). Used by both
// the desktop detail panel and the mobile member sheet. Only rendered for other
// members (never your own profile). `pocketTrigger` swaps the desktop kebab
// IconButton for a 44px tonal round trigger (mobile §3.3 quiet-on-card, ≥34px
// tap target) so it sits flush beside the Send Message primary.
function MemberActionsMenu({ member, currentUserId, pocketTrigger = false }: { member: DirectoryMember; currentUserId: string; pocketTrigger?: boolean }) {
  const { blocked, blockedIds, mutate } = useBlocks(currentUserId)
  const [reporting, setReporting] = useState(false)
  const isBlocked = blockedIds.has(member.id)

  const items: ActionMenuItem[] = [
    { key: "report", label: "Report", icon: <Flag size={15} />, onSelect: () => setReporting(true) },
    isBlocked
      ? {
          key: "unblock", label: "Unblock", icon: <UserCheck size={15} />,
          onSelect: async () => {
            mutate(blocked.filter((b) => b.blocked_id !== member.id), { revalidate: false })
            await unblockUser(member.id)
            mutate()
          },
        }
      : {
          key: "block", label: "Block", tone: "danger", icon: <Ban size={15} />,
          onSelect: async () => {
            mutate(
              [{ blocked_id: member.id, name: member.name, avatar_url: member.avatar_url, created_at: new Date().toISOString() }, ...blocked],
              { revalidate: false },
            )
            await blockUser(member.id)
            mutate()
          },
        },
  ]

  return (
    <>
      <ActionMenu
        items={items}
        triggerLabel="Member actions"
        renderTrigger={pocketTrigger ? ({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="Member actions"
            style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 999, border: "none", background: "var(--cream)", color: "var(--plum)", display: "grid", placeItems: "center", cursor: "pointer", opacity: open ? 0.7 : 1 }}
          >
            <MoreHorizontal size={18} />
          </button>
        ) : undefined}
      />
      {reporting && (
        <ReportModal
          targetType="profile"
          targetId={member.id}
          targetUserId={member.id}
          targetName={member.name}
          onClose={() => setReporting(false)}
          onBlocked={() => mutate()}
        />
      )}
    </>
  )
}

// Shared directory fetcher — both the desktop panel and the mobile list key on
// ["directory-members", ministryId], so they dedupe to a single request and
// share one cache entry (instant on tab revisit). Slim columns only — the heavy
// free-text profile fields are fetched per-member by loadMemberDetail.
async function loadDirectoryMembers(
  supabase: ReturnType<typeof createClient>,
  ministryId: string
): Promise<DirectoryMember[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, graduation_year, role, avatar_url")
    .eq("ministry_id", ministryId)
    .is("deleted_at", null) // hide deleted-account tombstones ("Former member")
    .order("name")
  return data ?? []
}

// Per-member detail fetcher — full profile fields for the detail views only,
// keyed by ["member-detail", memberId] so revisits hit the SWR cache.
async function loadMemberDetail(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  ministryId: string
): Promise<DirectoryMemberDetail | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, graduation_year, role, avatar_url, email, phone, about_me, bio, bible_verse, favorite_verse, prayer_request, pray_for_me, testimony, favorite_worship_song, favorite_book_of_bible")
    .eq("id", memberId)
    .eq("ministry_id", ministryId)
    .single()
  return data ?? null
}

// ── DirectoryMemberListPanel — lives in the shell context panel on desktop ─────

export function DirectoryMemberListPanel({
  ministryId,
  currentUserId,
  selectedId,
  initialMemberId,
  onlineUserIds,
  onSelect,
}: {
  ministryId: string
  currentUserId: string
  selectedId: string | null | undefined
  initialMemberId?: string | null
  onlineUserIds?: Set<string>
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
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-[12.5px] placeholder:text-[var(--muted-text)] focus:outline-none focus:ring-2 focus:ring-[var(--plum)]/20"
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
              variant="bordered"
              icon={<Users size={20} strokeWidth={1.5} />}
              title="No members found"
              subtitle={search ? "Try a different name" : "No members in the directory yet"}
            />
          </div>
        ) : (
          filtered.map((member, i) => {
            const isActive = selectedId === member.id
            return (
              <button
                key={member.id}
                onClick={() => onSelect(member)}
                className="central-list-row w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-100"
                style={{
                  borderLeft: isActive ? "3px solid var(--plum)" : "3px solid transparent",
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--line-3)" : "none",
                  background: isActive ? "var(--plum-tint)" : undefined,
                }}
              >
                <MonogramChip
                  initials={getInitials(member.name)}
                  avatarUrl={member.avatar_url}
                  className="w-8 h-8"
                  style={{ fontFamily: "var(--serif)", fontSize: 12, fontWeight: 400 }}
                  online={onlineUserIds?.has(member.id)}
                  dotSize={9}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate leading-tight" style={{ color: isActive ? "var(--plum)" : "var(--ink)" }}>
                    {member.name}
                    {member.id === currentUserId && <span className="ml-1.5 text-[10px] font-normal" style={{ color: "var(--muted-text)" }}>you</span>}
                  </p>
                  <p className="text-[11px] truncate leading-tight mt-0.5" style={{ color: "var(--muted-text)" }}>
                    {member.graduation_year ? `'${String(member.graduation_year).slice(2)}` : ""}
                    {member.graduation_year && member.role ? " · " : ""}
                    {roleLabel(member.role, member.id)}
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
  onlineUserIds,
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
  onlineUserIds?: Set<string>
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

        {/* Page header — landing tier (R1) */}
        <TabPageHeader>
          <PageTitle eyebrow={mobileMembers.length ? `People · ${mobileMembers.length} members` : "People"} title="Directory" />
        </TabPageHeader>

        {/* Detail area */}
        <div className="flex-1 overflow-y-auto">
          {selectedMember ? (
            <MemberDetailPanel
              member={selectedMember}
              ministryId={ministryId}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              online={onlineUserIds?.has(selectedMember.id)}
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
        {/* Chrome row (mobile spec §2.1): back chevron + 22px serif title inline */}
        <div className="px-5 pt-14 pb-5">
          <div className="flex items-center gap-2 mb-4">
            {onBack && (
              <button onClick={onBack} className="flex items-center justify-center rounded-full -ml-1" style={{ width: 34, height: 34, flexShrink: 0 }} aria-label="Back">
                <ArrowLeft className="w-5 h-5" style={{ color: "var(--plum)" }} />
              </button>
            )}
            <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.1, fontWeight: 600 }}>Directory</span>
          </div>
          {/* Tonal search pill (§3.6): --ivory, borderless, radius --r-pocket-sm */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted-text)" }} />
            <input
              type="text"
              placeholder="Search members…"
              value={mobileSearch}
              onChange={(e) => setMobileSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 text-[13px] placeholder:text-[var(--muted-text)] focus:outline-none"
              style={{ background: "var(--ivory)", border: "none", borderRadius: "var(--r-pocket-sm)", color: "var(--ink)" }}
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
          <div className="px-5 pb-4">
            <PocketKicker label={`${mobileFiltered.length} ${mobileFiltered.length === 1 ? "member" : "members"}`} />
            <PocketRowCard>
              {mobileFiltered.map((member, i) => (
                <PocketRow
                  key={member.id}
                  leading={<MonogramChip initials={getInitials(member.name)} avatarUrl={member.avatar_url} className="w-10 h-10" style={{ fontFamily: "var(--serif)", fontSize: 13, fontWeight: 500 }} online={onlineUserIds?.has(member.id)} dotSize={10} dotRing="var(--ivory)" />}
                  title={member.name}
                  titleAccessory={
                    <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {member.role && <MobileRoleTag role={member.role} userId={member.id} />}
                      {member.id === currentUserId && <MobileYouTag />}
                    </span>
                  }
                  sub={member.graduation_year ? `Class of ${member.graduation_year}` : undefined}
                  chevron
                  isLast={i === mobileFiltered.length - 1}
                  onClick={() => setMobileSelected(member)}
                />
              ))}
            </PocketRowCard>
          </div>
        )}
      </div>
      )}

      {/* Mobile: member detail subpage (swaps in over the list) */}
      {mobileSelected && (
        <div className="md:hidden">
          <MemberSheet
            member={mobileSelected}
            ministryId={ministryId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            online={onlineUserIds?.has(mobileSelected.id)}
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

function MemberDetailPanel({ member, ministryId, currentUserId, currentUserName, online, onOpenChat }: {
  member: DirectoryMember
  ministryId: string
  currentUserId: string
  currentUserName: string
  online?: boolean
  onOpenChat: (id: string, name: string, type?: string) => void
}) {
  const supabase = createClient()
  const [dmLoading, setDmLoading] = useState(false)
  const [prayingFor, setPrayingFor] = useState(false)
  const isOwnProfile = member.id === currentUserId
  // Header renders instantly from the slim `member` row; the heavy profile
  // fields stream in per-member (SWR-cached, so revisits are instant).
  const { data: detail, isLoading: detailLoading } = useSWR(
    ["member-detail", member.id],
    () => loadMemberDetail(supabase, member.id, ministryId)
  )

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
    { label: "EMAIL", value: detail?.email || null },
    { label: "PHONE", value: detail?.phone || null },
    { label: "ROLE", value: roleLabel(member.role, member.id) || null },
    { label: "CLASS", value: member.graduation_year ? `Class of ${member.graduation_year}` : null },
  ].filter(r => r.value)

  return (
    <div className="flex flex-col items-center px-16 py-16">
      {/* Avatar — bottom margin lives on the heading below, not the chip, so the
          presence-dot wrapper's percentage geometry tracks the circle exactly */}
      <MonogramChip
        initials={getInitials(member.name)}
        avatarUrl={member.avatar_url}
        className="flex-shrink-0"
        style={{ width: 120, height: 120, fontFamily: "var(--serif)", fontSize: 40, fontWeight: 400 }}
        online={online}
        dotSize={16}
      />

      {/* Member name — prominent heading in the detail body */}
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: "28px 0 10px", lineHeight: 1.1, textAlign: "center" }}>
        {member.name}
      </h2>

      {/* Subtitle */}
      <p style={{ fontSize: 13.5, color: "var(--muted-text)", margin: "0 0 28px", textAlign: "center" }}>
        {[
          member.graduation_year ? `Class of ${member.graduation_year}` : null,
          roleLabel(member.role, member.id) || null,
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
          <MemberActionsMenu member={member} currentUserId={currentUserId} />
        </div>
      )}

      {/* Info rows */}
      <div style={{ width: "100%", maxWidth: 480, borderTop: "1px solid var(--line)" }}>
        {infoRows.map((row) => (
          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, padding: "14px 0", borderBottom: "1px solid var(--line)", alignItems: "start" }}>
            <span style={{ fontSize: 11, fontWeight: 400, letterSpacing: "0.1em", color: "var(--muted-text)", textTransform: "uppercase", paddingTop: 1 }}>{row.label}</span>
            <span style={{ fontSize: 14, color: "var(--ink)" }}>{row.value}</span>
          </div>
        ))}

        {(() => {
          if (detailLoading) {
            return (
              <div style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: 14, color: "var(--muted-text)", opacity: 0.5 }}>…</span>
              </div>
            )
          }
          const aboutVal = detail?.bio || detail?.about_me
          const verseVal = detail?.favorite_verse || detail?.bible_verse
          const rows: { label: string; value: string; italic?: boolean }[] = []
          if (aboutVal) rows.push({ label: "ABOUT", value: aboutVal })
          if (detail?.testimony) rows.push({ label: "TESTIMONY", value: detail.testimony })
          if (verseVal) rows.push({ label: "VERSE", value: verseVal, italic: true })
          if (detail?.favorite_worship_song) rows.push({ label: "WORSHIP SONG", value: detail.favorite_worship_song })
          if (detail?.favorite_book_of_bible) rows.push({ label: "FAVORITE BOOK", value: detail.favorite_book_of_bible })
          if (detail?.prayer_request) rows.push({ label: "PRAYER", value: detail.prayer_request })
          return rows.map(row => (
            <div key={row.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, padding: "14px 0", borderBottom: "1px solid var(--line)", alignItems: "start" }}>
              <span style={{ fontSize: 11, fontWeight: 400, letterSpacing: "0.1em", color: "var(--muted-text)", textTransform: "uppercase", paddingTop: 1 }}>{row.label}</span>
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
  ministryId,
  currentUserId,
  currentUserName,
  online,
  onClose,
  onOpenChat,
}: {
  member: DirectoryMember
  ministryId: string
  currentUserId: string
  currentUserName: string
  online?: boolean
  onClose: () => void
  onOpenChat: (id: string, name: string, type?: string) => void
}) {
  const supabase = createClient()
  const [dmLoading, setDmLoading] = useState(false)
  const isOwnProfile = member.id === currentUserId
  // Identity block renders instantly from the slim `member` row; heavy profile
  // fields stream in per-member (SWR-cached, so revisits are instant).
  const { data: detail, isLoading: detailLoading } = useSWR(
    ["member-detail", member.id],
    () => loadMemberDetail(supabase, member.id, ministryId)
  )

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
        {/* Identity card (mobile §4 Profile recipe): avatar + name + tags/meta,
            privacy caption demoted to a muted line inside the card, and the
            actions row (plum Send Message primary + tonal kebab) living IN the
            card — no floating fragments, no stray hairline at the bottom. */}
        <div>
          <PocketCard style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <MonogramChip
                initials={getInitials(member.name)}
                avatarUrl={member.avatar_url}
                className="flex-shrink-0"
                style={{ width: 56, height: 56, fontFamily: "var(--serif)", fontSize: 19, fontWeight: 500 }}
                online={online}
                dotSize={12}
                dotRing="var(--ivory)"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", margin: 0, lineHeight: 1.15 }}>{member.name}</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {member.role && <MobileRoleTag role={member.role} userId={member.id} />}
                  {isOwnProfile && <MobileYouTag />}
                  {member.graduation_year && (
                    <span style={{ fontSize: 12.5, color: "var(--muted-text)" }}>Class of {member.graduation_year}</span>
                  )}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted-text)", lineHeight: 1.5, margin: "12px 0 0" }}>
              Shared profile details are visible to members in this ministry.
            </p>
            {!isOwnProfile && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                <button
                  onClick={handleSendMessage}
                  disabled={dmLoading}
                  className="active:scale-[0.97] transition-transform duration-150 disabled:opacity-50"
                  style={{ flex: 1, minHeight: 44, borderRadius: 999, background: "var(--plum)", color: "var(--cream)", border: "none", fontSize: 13.5, fontWeight: 600, letterSpacing: "0.01em", cursor: dmLoading ? "not-allowed" : "pointer" }}
                >
                  {dmLoading ? "Opening chat…" : "Send Message"}
                </button>
                <MemberActionsMenu member={member} currentUserId={currentUserId} pocketTrigger />
              </div>
            )}
          </PocketCard>

          {(() => {
            const monoLabel: React.CSSProperties = { fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", margin: 0, marginBottom: 4 }

            if (detailLoading) {
              return (
                <div className="flex items-center justify-center py-10">
                  <p className="text-[13px]" style={{ color: "var(--muted-text)", opacity: 0.6 }}>…</p>
                </div>
              )
            }

            const aboutVal = detail?.bio || detail?.about_me
            const verseVal = detail?.favorite_verse || detail?.bible_verse

            const sections: { id: string; label: string; fields: { label: string; value: string; italic?: boolean }[] }[] = [
              {
                id: "contact", label: "Contact",
                fields: [
                  member.graduation_year ? { label: "Graduation year", value: String(member.graduation_year) } : null,
                  detail?.phone ? { label: "Phone", value: detail.phone } : null,
                ].filter(Boolean) as { label: string; value: string }[]
              },
              {
                id: "about", label: "About",
                fields: aboutVal ? [{ label: "Bio", value: aboutVal }] : []
              },
              {
                id: "faith", label: "Faith",
                fields: [
                  detail?.testimony ? { label: "Testimony", value: detail.testimony } : null,
                  verseVal ? { label: "Favorite verse", value: verseVal, italic: true } : null,
                  detail?.favorite_worship_song ? { label: "Favorite worship song", value: detail.favorite_worship_song } : null,
                  detail?.favorite_book_of_bible ? { label: "Favorite book of the Bible", value: detail.favorite_book_of_bible } : null,
                ].filter(Boolean) as { label: string; value: string; italic?: boolean }[]
              },
              {
                id: "prayer", label: "Prayer",
                fields: detail?.prayer_request ? [{ label: "Prayer request", value: detail.prayer_request }] : []
              }
            ].filter(s => s.fields.length > 0)

            if (sections.length === 0) {
              // Quiet EmptyState grammar (mobile §3.8) — never a lone floating sentence.
              return (
                <div style={{ paddingTop: 20 }}>
                  <EmptyState
                    icon={<Users className="w-6 h-6" strokeWidth={1.5} />}
                    title="No details shared yet"
                    subtitle={isOwnProfile
                      ? "Details you add on your Profile show up here."
                      : `Details ${member.name.split(" ")[0]} shares will show up here.`}
                  />
                </div>
              )
            }

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {sections.map(section => (
                  <div key={section.id}>
                    <PocketKicker label={section.label} />
                    <div style={{ borderRadius: "var(--r-pocket)", overflow: "hidden", background: "var(--ivory)" }}>
                      {section.fields.map((field, i) => (
                        <div key={field.label} style={{ padding: "14px 18px", borderTop: i > 0 ? "1px solid var(--line-3)" : "none" }}>
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
    </SubpageShell>
  )
}
