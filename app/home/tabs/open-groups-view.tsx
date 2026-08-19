"use client"

// ─── Browse open groups ──────────────────────────────────────────────────────
//
// The ONE discovery surface for chats anyone in the ministry may join.
//
// WHY THIS IS A DRILL-IN AND NOT A NAV SECTION. Slack and Discord put every room
// permanently in the sidebar, badged, so the list itself becomes an obligation —
// that clutter is exactly what Central is refusing. A list you open ON PURPOSE,
// from one row at the top of your chat list, costs nothing when you are not
// looking for it. Do not promote this to a tab, a nav item, or a persistent
// section of the chat list.
//
// THE JOIN AFFORDANCE IS PER-VIEWPORT. This was one rule ("TAP IS JOIN — there is
// no separate Join button") for as long as the screen was a mobile body that
// desktop happened to render too. It is now two, and the divergence is the point
// (cdesign "Open groups body", reconciled + ratified 2026-08-19):
//
//   • PHONE (`md:hidden`) — TAP IS JOIN. A row you are not in joins on tap
//     (optimistic, Undo toast); a row you are in opens the chat. `PocketRow` has
//     no action slot BY DESIGN — the row IS the affordance — and a bespoke row
//     here would be the first crack in the full-bleed list grammar
//     (mobile_design_system.md §4, ratified 2026-08-16). Joining is cheap and
//     reversible, which is what makes tap-to-join proportionate.
//
//   • DESKTOP (`hidden md:block`) — an explicit Join button per row. A pointer
//     lands on a 720px-wide row with a cursor, not a thumb on a full-bleed one:
//     "tap anywhere on this row and you have joined a group chat" is a surprise
//     at that width, and §3.2 permits a per-row action (Convention #15 governs
//     HEADER creates, which this is not). The row itself only navigates when you
//     are already a MEMBER — `groups`/`messages` SELECT require membership, so a
//     non-member has no thread to open and neither the chevron nor the row click
//     may promise one.
//
// Both viewports share ONE state/SWR/data layer below; only the body renders
// twice. Every read goes through app/home/open-groups.ts (definer RPCs), never a
// `groups` table query — see that file for why widening SELECT is not an option.

import { useState } from "react"
import useSWR from "swr"
import { ChevronRight, Users } from "lucide-react"
import {
  SubpageShell,
  PocketRow,
  PocketKicker,
  ChatAvatar,
  Toast,
  ListRow,
  CentralButton,
  SkeletonBlock,
  EYEBROW_STYLE,
} from "@/components/central"
import { EmptyState } from "@/app/home/components/shared"
import {
  fetchOpenGroups,
  joinOpenGroup,
  leaveOpenGroup,
  openGroupsKey,
  type OpenGroup,
} from "@/app/home/open-groups"

// The desktop card (K3/K6): a bounded, bordered panel holding the rows, the
// counterpart of the phone's full-bleed run. No CentralCard variant expresses
// cream-panel + line-2 + the prominent radius yet — flagged as a `panel` variant
// candidate rather than invented here.
const CARD_STYLE: React.CSSProperties = {
  background: "var(--cream-panel)",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--r-callout)",
  // Clips the rows' --cream-2 hover fill to the card's radius; the rows in turn
  // carry borderRadius 0 so the fill meets the card edge squarely.
  overflow: "hidden",
}

// 46px avatar, not the mock's 40 (ratified 2026-08-19): the row is deliberately
// the SAME object as the chat-list row, so a group looks identical before and
// after joining. Phone width already uses 46, so the two viewports agree here.
const ROW_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "46px 1fr auto",
  gap: 14,
  alignItems: "center",
  padding: "14px 18px",
  borderRadius: 0,
}

export function OpenGroupsBrowse({
  userId,
  ministryId,
  onBack,
  onOpenChat,
}: {
  userId: string
  ministryId: string
  onBack: () => void
  onOpenChat: (groupId: string, groupName: string) => void
}) {
  const { data, mutate, isLoading } = useSWR(openGroupsKey(ministryId), fetchOpenGroups)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState<OpenGroup | null>(null)

  const groups = data ?? []

  async function join(g: OpenGroup) {
    setBusyId(g.id)
    setError(null)
    const before = groups
    // Optimistic (Convention #4) — joining is a conversational write, not a
    // staged setting.
    void mutate(
      before.map((x) => (x.id === g.id ? { ...x, isMember: true, memberCount: x.memberCount + 1 } : x)),
      { revalidate: false },
    )
    const err = await joinOpenGroup(g.id, userId)
    setBusyId(null)
    if (err) {
      void mutate(before, { revalidate: false })
      setError(err)
      return
    }
    setJoined(g)
    void mutate()
  }

  async function undoJoin(g: OpenGroup) {
    setJoined(null)
    void mutate(
      groups.map((x) => (x.id === g.id ? { ...x, isMember: false, memberCount: Math.max(0, x.memberCount - 1) } : x)),
      { revalidate: false },
    )
    await leaveOpenGroup(g.id, userId)
    void mutate()
  }

  const countLabel = `${groups.length} group${groups.length === 1 ? "" : "s"}`
  const memberLabel = (g: OpenGroup) => `${g.memberCount} member${g.memberCount === 1 ? "" : "s"}`

  return (
    <SubpageShell
      crumbs={[{ label: "Chats", onClick: onBack }, { label: "Open groups" }]}
      title="Open groups"
      mobileTitle="Open groups"
      // FULL WIDTH, LEFT-ALIGNED — §7.0 splits by CONTENT TYPE, and this is a
      // COLLECTION: "lists of cards, tables, stat grids… no reading-measure
      // constraint — let them fill the content area out to the page padding. Do
      // not trap a list or grid in a fixed narrow column." The capped/centred
      // clause governs reading- and form-measure content (prose, a single-column
      // form), which a list of joinable groups is not. The handoff proposed a
      // 720px centred column and it was drift, not a variant — do not reintroduce
      // one here. Title, description, count eyebrow and card all sit at the same
      // md:px-14 inset, and the header rules span the content width.
      width="full"
    >
      {/* The 15px sentence §3 puts in the title block; SubpageShell has no
          subtitle slot, so it leads the body. Phone width keeps its shipped
          14.5/1.6 and its own gutter — the desktop body is what this redesign
          replaces. */}
      <p
        className="px-5 md:px-0 md:pt-6 text-[14.5px] md:text-[15px] leading-[1.6] md:leading-[1.55] md:max-w-[56ch] md:text-pretty"
        style={{ color: "var(--body)", margin: "0 0 18px" }}
      >
        Chats anyone in the ministry can join. Tap one to join, and it shows up with your other
        chats.
      </p>

      {error && (
        <p className="px-5 md:px-0 text-[13px]" style={{ color: "var(--danger)", margin: "0 0 14px" }} role="alert">
          {error}
        </p>
      )}

      {isLoading ? (
        // Desktop only: the phone path has always painted nothing for the one RPC
        // it waits on, and that is the shipped, ratified behaviour there.
        <div className="hidden md:block" style={CARD_STYLE}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{ ...ROW_GRID, borderBottom: i === 2 ? "none" : "1px solid var(--line-3)" }}
            >
              <SkeletonBlock width={46} height={46} radius={999} />
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <SkeletonBlock width="42%" height={13} radius="var(--r-pill)" />
                <SkeletonBlock width="24%" height={11} radius="var(--r-pill)" />
              </div>
              <SkeletonBlock width={64} height={28} radius={999} />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="px-5 md:px-0">
          <EmptyState
            icon={<Users style={{ width: 21, height: 21 }} strokeWidth={1.7} />}
            title="No open groups yet"
            subtitle="When someone opens a group chat to the ministry, it shows up here."
          />
        </div>
      ) : (
        <>
          {/* ── Phone width — the shipped full-bleed immersive run ──────────── */}
          <div className="md:hidden">
            <PocketKicker label={countLabel} style={{ margin: "0 20px 8px" }} />
            {groups.map((g, i) => (
              <PocketRow
                key={g.id}
                immersive
                isFirst={i === 0}
                // Same primitive and size the chat list itself uses, so a row here
                // and the row it becomes after joining are the same object.
                // MonogramChip has no intrinsic size and would collapse to its
                // content — a one-letter name rendered visibly narrower.
                leading={<ChatAvatar size={46} title={g.name} avatarUrl={g.avatarUrl} />}
                title={g.name}
                sub={memberLabel(g)}
                meta={g.isMember ? "Joined" : busyId === g.id ? "Joining…" : "Join"}
                chevron={g.isMember}
                ariaLabel={g.isMember ? `Open ${g.name}` : `Join ${g.name}`}
                onClick={() => {
                  if (busyId === g.id) return
                  if (g.isMember) onOpenChat(g.id, g.name)
                  else void join(g)
                }}
              />
            ))}
          </div>

          {/* ── Desktop — bounded card of rows, each with its own Join ───────── */}
          <div className="hidden md:block">
            <div style={{ ...EYEBROW_STYLE, marginBottom: 10 }}>{countLabel}</div>
            <div style={CARD_STYLE}>
              {groups.map((g, i) => {
                const open = () => onOpenChat(g.id, g.name)
                return (
                  <ListRow
                    key={g.id}
                    last={i === groups.length - 1}
                    style={{ ...ROW_GRID, cursor: g.isMember ? "pointer" : "default" }}
                    // A member's row navigates; a non-member's cannot (no
                    // membership, no thread), so it is not a control at all — the
                    // Join button inside it is. `role`/`tabIndex` are on the row
                    // rather than making it a <button> because a <button> may not
                    // contain the Join <button>.
                    {...(g.isMember
                      ? {
                          role: "button" as const,
                          tabIndex: 0,
                          "aria-label": `Open ${g.name}`,
                          onClick: open,
                          onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              open()
                            }
                          },
                        }
                      : {})}
                  >
                    <ChatAvatar size={46} title={g.name} avatarUrl={g.avatarUrl} surface="var(--cream-panel)" />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 17,
                          fontWeight: 500,
                          letterSpacing: "-0.01em",
                          color: "var(--ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {g.name}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 2 }}>
                        {memberLabel(g)}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {g.isMember ? (
                        // Membership IDENTITY, not a status — which is exactly what
                        // --plum-tint is sanctioned for (§1.2). Non-interactive.
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: "var(--plum)",
                            background: "var(--plum-tint)",
                            borderRadius: 999,
                            padding: "4px 10px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Joined
                        </span>
                      ) : (
                        // Join and Joined are ONE control changing state, so Join
                        // takes the pill radius and the plum text of the slot it
                        // will become (ratified 2026-08-19) — through CentralButton,
                        // never a raw <button> with inline colour (§4.3).
                        <CentralButton
                          variant="secondary"
                          size="sm"
                          style={{ borderRadius: 999, color: "var(--plum)" }}
                          disabled={busyId === g.id}
                          aria-label={`Join ${g.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (busyId === g.id) return
                            void join(g)
                          }}
                        >
                          {busyId === g.id ? "Joining…" : "Join"}
                        </CentralButton>
                      )}
                      {/* The chevron's slot is RESERVED on every row, drawn only on
                          joined ones. Without the reservation a non-member row's
                          Join slides 27px right into the chevron's place, and Join
                          and Joined stop being one control changing state. */}
                      <span style={{ width: 15, height: 15, flexShrink: 0 }}>
                        {g.isMember && (
                          <ChevronRight
                            className="row-chevron"
                            aria-hidden
                            style={{ width: 15, height: 15, color: "var(--faint)", display: "block" }}
                            strokeWidth={1.8}
                          />
                        )}
                      </span>
                    </div>
                  </ListRow>
                )
              })}
            </div>
          </div>
        </>
      )}

      {joined && (
        <Toast
          message={`Joined ${joined.name}`}
          actionLabel="Undo"
          onAction={() => undoJoin(joined)}
          onDismiss={() => setJoined(null)}
        />
      )}
    </SubpageShell>
  )
}
