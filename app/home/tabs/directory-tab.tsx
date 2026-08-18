"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { Search, MessageCircle, Heart, Users } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { findExistingDm } from "../dm"
import { useOpenDraftDm } from "../draft-dm-context"
import { EmptyState } from "../components/shared"
import { TabPageHeader, PageTitle, MonogramChip, DirectoryListSkeleton, PocketRow, PocketKicker, PocketSearchField, BackChevron, POCKET_CHROME_PAD_Y, POCKET_CHROME_TITLE } from "@/components/central"
import { getInitials } from "../utils"
import { roleLabel } from "@/app/actions/super-constants"
import type { DirectoryMember } from "../types"
// Member-profile UI lives in the shared member-sheet module so it can also open
// as a global overlay from anywhere (not only inside this tab).
import { MemberSheet, MemberActionsMenu, MobileRoleTag, MobileYouTag, loadMemberDetail } from "../components/member-sheet"
import { cohortLabel, cohortShortLabel } from "@/lib/cohort"

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
    .select("id, name, graduation_year, grade, role, avatar_url")
    .eq("ministry_id", ministryId)
    .is("deleted_at", null) // hide deleted-account tombstones ("Former member")
    .order("name")
  return data ?? []
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
                    {cohortShortLabel(member.grade, member.graduation_year)}
                    {cohortShortLabel(member.grade, member.graduation_year) && member.role ? " · " : ""}
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
        {/* Chrome row (mobile spec §2.1): back chevron + 22px serif title inline.
            Vertical rhythm is the shared constant (Convention #27) — this shipped
            `pt-14` (56px), by far the deepest header in the app, so Directory sat
            a full title-height lower than every other tab root. */}
        {/* NO bottom padding: the count eyebrow below owns the whitespace that
            separates it from the search field (mobile spec §4 — Directory's is the
            one kicker with no opening rule, so that gap IS the separator). Adding
            `pb-5` here paid for it twice: 20 + the eyebrow's own 20 put the first
            visible mark 40px under the field, where every other list sits at ~16. */}
        <div className="px-5" style={{ paddingTop: POCKET_CHROME_PAD_Y.paddingTop }}>
          <div className="flex items-center gap-2" style={{ marginBottom: POCKET_CHROME_PAD_Y.paddingBottom + 6 }}>
            {onBack && <BackChevron onClick={onBack} />}
            <span style={{ flex: 1, minWidth: 0, ...POCKET_CHROME_TITLE }}>Directory</span>
          </div>
          {/* Tonal search pill (§3.6): PocketSearchField, --ivory borderless */}
          <PocketSearchField value={mobileSearch} onChange={setMobileSearch} placeholder="Search members…" />
        </div>

        {/* The two non-list branches have no eyebrow to carry the gap, so they
            re-apply it themselves rather than pushing it back onto the wrapper. */}
        {mobileLoading ? (
          <div className="px-2 pt-5"><DirectoryListSkeleton /></div>
        ) : mobileFiltered.length === 0 ? (
          <div className="px-5 pt-5">
            <EmptyState
              icon={<Users className="w-7 h-7" />}
              title="No members found"
              subtitle={mobileSearch ? "Try a different name" : "No members in the directory yet"}
            />
          </div>
        ) : (
          /* Full-bleed member run — no card, rows on the page surface (§4). The
             count eyebrow carries the rule that opens the list, so the first row
             takes no top border. */
          <div className="pb-4">
            <PocketKicker
              label={`${mobileFiltered.length} ${mobileFiltered.length === 1 ? "member" : "members"}`}
              style={{ margin: 0, padding: "20px 20px 10px" }}
            />
            {mobileFiltered.map((member, i) => (
              <PocketRow
                key={member.id}
                immersive
                isFirst={i === 0}
                // The presence dot's ring is a fake cut-out, so it must match
                // whatever sits BEHIND the avatar. That was the card (--ivory);
                // with the card gone it is the page surface.
                leading={<MonogramChip initials={getInitials(member.name)} avatarUrl={member.avatar_url} style={{ width: 46, height: 46, fontFamily: "var(--serif)", fontSize: 16, fontWeight: 500 }} online={onlineUserIds?.has(member.id)} dotSize={11} dotRing="var(--cream)" />}
                title={member.name}
                titleAccessory={
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {member.role && <MobileRoleTag role={member.role} userId={member.id} />}
                    {member.id === currentUserId && <MobileYouTag />}
                  </span>
                }
                sub={cohortLabel(member.grade, member.graduation_year) ?? undefined}
                chevron
                onClick={() => setMobileSelected(member)}
              />
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
  const openDraftDm = useOpenDraftDm()
  const [dmLoading, setDmLoading] = useState(false)
  const [prayingFor, setPrayingFor] = useState(false)
  const isOwnProfile = member.id === currentUserId
  // Header renders instantly from the slim `member` row; the heavy profile
  // fields stream in per-member (SWR-cached, so revisits are instant).
  const { data: detail, isLoading: detailLoading } = useSWR(
    ["member-detail", member.id],
    () => loadMemberDetail(supabase, member.id, ministryId)
  )

  // Existing thread → open it; otherwise a DRAFT (the group is created on the
  // first send). Shares the one pair lookup in app/home/dm.ts — this was a
  // verbatim copy of the member sheet's, and copies are how the two surfaces
  // drifted into minting duplicate DMs.
  async function handleMessage() {
    setDmLoading(true)
    const existing = await findExistingDm(supabase, currentUserId, member.id)
    setDmLoading(false)
    if (existing) {
      onOpenChat(existing, member.name, "dm")
      return
    }
    openDraftDm({ id: member.id, name: member.name })
  }

  const infoRows = [
    { label: "EMAIL", value: detail?.email || null },
    { label: "PHONE", value: detail?.phone || null },
    { label: "ROLE", value: roleLabel(member.role, member.id) || null },
    { label: "CLASS", value: cohortLabel(member.grade, member.graduation_year) },
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
          cohortLabel(member.grade, member.graduation_year),
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
