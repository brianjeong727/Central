"use client"

// Shared member-profile UI. Lifted out of directory-tab so the member profile
// can open from ANYWHERE (chat sender, RSVP chip, settings roster, team roster,
// …) via the global overlay (GlobalMemberProfileOverlay) mounted in home-app,
// not only inside the Directory tab. Directory still imports MemberSheet +
// helpers from here — its behavior is unchanged.

import { useState, useEffect } from "react"
import useSWR from "swr"
import { X, MoreHorizontal, Flag, Ban, UserCheck, Users } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { findExistingDm } from "../dm"
import { useOpenDraftDm } from "../draft-dm-context"
import { EmptyState, Spinner } from "./shared"
import { SubpageShell, ActionMenu, PocketCard, PocketKicker, MonogramChip } from "@/components/central"
import type { ActionMenuItem } from "@/components/central"
import { getInitials } from "../utils"
import { roleLabel } from "@/app/actions/super-constants"
import { ReportModal } from "./report-modal"
import { useBlocks } from "../use-blocks"
import { blockUser, unblockUser } from "@/app/actions/blocks"
import type { DirectoryMember, DirectoryMemberDetail } from "../types"

// Borderless tonal role tag for phone-width surfaces (mobile spec §3.7): elevated
// roles carry the plum fill; member/visitor get a --line-2 tonal pill. No borders.
export function MobileRoleTag({ role, userId }: { role: string; userId: string }) {
  const elevated = ["admin", "leader", "deacon", "elder", "pastor"].includes(role.toLowerCase())
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", borderRadius: 999, padding: "2px 7px", flexShrink: 0, background: elevated ? "var(--plum)" : "var(--line-2)", color: elevated ? "var(--cream-on-dark)" : "var(--body)" }}>
      {roleLabel(role, userId)}
    </span>
  )
}

// "You" identity tag — tonal, borderless, shares the §3.7 mono-pill grammar.
export function MobileYouTag() {
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", borderRadius: 999, padding: "2px 7px", flexShrink: 0, background: "var(--line-2)", color: "var(--body)" }}>You</span>
  )
}

// Shared Report/Block overflow menu for a directory member (§1.2). Used by both
// the desktop detail panel and the mobile member sheet. Only rendered for other
// members (never your own profile). `pocketTrigger` swaps the desktop kebab
// IconButton for a 44px tonal round trigger (mobile §3.3 quiet-on-card, ≥34px
// tap target) so it sits flush beside the Send Message primary.
export function MemberActionsMenu({ member, currentUserId, pocketTrigger = false }: { member: DirectoryMember; currentUserId: string; pocketTrigger?: boolean }) {
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

// Per-member detail fetcher — full profile fields for the detail views only,
// keyed by ["member-detail", memberId] so revisits hit the SWR cache. Returns a
// superset of DirectoryMember, so a caller with only an id can open the sheet
// straight from this row (the identity header renders from the same fetch).
export async function loadMemberDetail(
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

// ── Mobile full-screen sheet ────────────────────────────────────────────────

export function MemberSheet({
  member,
  ministryId,
  currentUserId,
  currentUserName,
  online,
  backLabel = "Directory",
  onClose,
  onOpenChat,
}: {
  member: DirectoryMember
  ministryId: string
  currentUserId: string
  currentUserName: string
  online?: boolean
  /** Back-crumb label — "Directory" inside the tab, "Back" from the global overlay. */
  backLabel?: string
  onClose: () => void
  onOpenChat: (id: string, name: string, type?: string) => void
}) {
  const supabase = createClient()
  const openDraftDm = useOpenDraftDm()
  const [dmLoading, setDmLoading] = useState(false)
  const isOwnProfile = member.id === currentUserId
  // Identity block renders instantly from the slim `member` row; heavy profile
  // fields stream in per-member (SWR-cached, so revisits are instant).
  const { data: detail, isLoading: detailLoading } = useSWR(
    ["member-detail", member.id],
    () => loadMemberDetail(supabase, member.id, ministryId)
  )

  // Existing thread → open it. No thread yet → open a DRAFT; the group is born on
  // the first send (app/home/dm.ts), so browsing people never leaves empty
  // conversations in anyone's chat list. This used to create the group eagerly
  // AND carry its own copy of the pair lookup — the copy that could miss an
  // existing DM and mint a duplicate.
  async function handleSendMessage() {
    setDmLoading(true)
    const existing = await findExistingDm(supabase, currentUserId, member.id)
    setDmLoading(false)
    if (existing) {
      onOpenChat(existing, member.name, "dm")
      return
    }
    onClose()
    openDraftDm({ id: member.id, name: member.name })
  }

  return (
    <SubpageShell crumbs={[{ label: backLabel, onClick: onClose }, { label: member.name }]} width="full">
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

// ── Global member-profile overlay ───────────────────────────────────────────
// Mounted once in home-app (like the global ChatScreen / announcement-detail
// overlays), opened from anywhere via useOpenMemberProfile(). Takes only a
// userId: the minimal member row + all detail come from the shared
// ["member-detail", id] SWR key (a cache hit if the sheet was opened before).
// Mobile = full-screen fixed cream overlay (z-60, per the Z-index table's member
// sheet); desktop = centered modal card over the ink veil. Both reuse MemberSheet
// so the profile presentation stays single-sourced.

export function GlobalMemberProfileOverlay({
  memberId,
  ministryId,
  currentUserId,
  currentUserName,
  online,
  onClose,
  onOpenChat,
}: {
  memberId: string
  ministryId: string
  currentUserId: string
  currentUserName: string
  online?: boolean
  onClose: () => void
  onOpenChat: (id: string, name: string, type?: string) => void
}) {
  const supabase = createClient()
  const { data: member, isLoading } = useSWR(
    ["member-detail", memberId],
    () => loadMemberDetail(supabase, memberId, ministryId)
  )

  // The id couldn't be resolved to a member in this ministry (cross-ministry id,
  // deleted account, …) — close gracefully rather than sit on a blank overlay.
  useEffect(() => {
    if (!isLoading && member === null) onClose()
  }, [isLoading, member, onClose])

  const sheet = member ? (
    <MemberSheet
      member={member}
      ministryId={ministryId}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      online={online}
      backLabel="Back"
      onClose={onClose}
      onOpenChat={onOpenChat}
    />
  ) : (
    <div className="flex items-center justify-center" style={{ minHeight: 240 }}>
      <Spinner />
    </div>
  )

  return (
    <>
      {/* Mobile: full-screen fixed overlay. z-[130] sits ABOVE the chat screen
          (100) and chat settings (110) so a sender tapped from inside a chat
          opens ON TOP — not hidden behind it — while staying below the emoji
          picker (155/160) and the ActionMenu/Report modal portals (200) this
          sheet itself raises. Opaque cream covers the pill nav (50); the
          SubpageShell pocket chrome supplies the back chevron. */}
      <div
        className="md:hidden fixed inset-0 z-[130] overflow-y-auto"
        style={{ background: "var(--cream)", paddingTop: "env(safe-area-inset-top)" }}
      >
        {sheet}
      </div>

      {/* Desktop: centered modal card over the ink veil (z-200, per the modal
          layer). Backdrop click + the X close; the card holds MemberSheet, whose
          desktop SubpageShell renders body-only (no pocket chrome, no title). */}
      <div
        className="hidden md:flex fixed inset-0 z-[200] items-center justify-center animate-backdrop-in"
        style={{ background: "var(--veil)", padding: "0 20px" }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-full flex flex-col animate-dialog-in"
          style={{ background: "var(--cream-2)", borderRadius: "var(--r-callout)", maxWidth: 620, maxHeight: "86vh", overflow: "hidden" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ position: "absolute", top: 16, right: 16, zIndex: 2, width: 32, height: 32, borderRadius: 999, border: "1px solid var(--line)", background: "var(--ivory)", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--ink)" }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
          <div className="flex-1 min-h-0">
            {sheet}
          </div>
        </div>
      </div>
    </>
  )
}
