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

// The open-groups list as a BARE BODY — no shell, no header, no back control.
//
// This used to be `OpenGroupsBrowse`, a `SubpageShell` push surface reached from
// an entry row in the chat list. It is now the third SCOPE of the Chats screen
// (chat-shared.ts `ChatsSection`), so the screen's own chrome already names it and
// a shell here would be a second header on one screen — which mobile §1 forbids
// outright ("No two-header screens"). Losing the shell also loses a push/pop, a
// back chevron and the state that drove them: switching scope is not navigation.
export function OpenGroupsBody({
  userId,
  ministryId,
  onOpenChat,
  variant = "page",
}: {
  userId: string
  ministryId: string
  onOpenChat: (groupId: string, groupName: string) => void
  /** "panel" is the desktop SIDEBAR density. The page rows are built for the full
   *  content area — a 46px avatar, a 17px name and a Join button — and a ~240px
   *  panel crushed that to "Boa…" with "3 members" wrapping onto two lines. Same
   *  data, same join/undo path, panel-scale markup. */
  variant?: "page" | "panel"
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

  // ── Desktop sidebar panel ────────────────────────────────────────────────
  // No description and no count eyebrow: the segmented control directly above
  // already says "Open", and a panel this narrow cannot afford a sentence that
  // wraps to three lines before the first row.
  if (variant === "panel") {
    return (
      <div className="flex flex-col gap-1">
        {error && (
          <p className="text-[12px] px-1" style={{ color: "var(--danger)", margin: "0 0 8px" }} role="alert">{error}</p>
        )}
        {isLoading && groups.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--muted-text)", padding: "8px 4px", fontFamily: "var(--sans)" }}>Loading…</p>
        )}
        {!isLoading && groups.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--muted-text)", padding: "8px 4px", fontFamily: "var(--sans)" }}>No open groups yet</p>
        )}
        {groups.map((g) => (
          <div
            key={g.id}
            className={`flex items-center gap-2.5 px-2 py-2 rounded-lg ${g.isMember ? "cursor-pointer hover:bg-[var(--ivory)]" : ""}`}
            {...(g.isMember
              ? { role: "button" as const, tabIndex: 0, "aria-label": `Open ${g.name}`,
                  onClick: () => onOpenChat(g.id, g.name),
                  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenChat(g.id, g.name) }
                  } }
              : {})}
          >
            <ChatAvatar size={30} title={g.name} avatarUrl={g.avatarUrl} surface="var(--cream)" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="text-[13.5px] truncate" style={{ color: "var(--ink)", fontWeight: 500 }}>{g.name}</div>
              <div className="text-[11.5px] truncate" style={{ color: "var(--muted-text)" }}>{memberLabel(g)}</div>
            </div>
            {g.isMember ? (
              <span className="text-[11px] flex-shrink-0" style={{ color: "var(--muted-text)" }}>Joined</span>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); void join(g) }}
                disabled={busyId === g.id}
                className="text-[12px] flex-shrink-0"
                style={{ color: "var(--plum)", background: "none", border: 0, padding: "2px 4px", cursor: "pointer", fontWeight: 500 }}
              >
                {busyId === g.id ? "…" : "Join"}
              </button>
            )}
          </div>
        ))}
        {joined && (
          <Toast message={`Joined ${joined.name}`} actionLabel="Undo" onAction={() => undoJoin(joined)} onDismiss={() => setJoined(null)} />
        )}
      </div>
    )
  }

  return (
    <>
      {/* The 15px sentence that used to sit in the shell's title block. Phone
          width keeps its shipped 14.5/1.6.
          NO horizontal padding of its own — the HOST owns the one gutter
          (Convention #26: exactly ONE 20px inset, never stacked). Mobile mounts
          this inside the chat list's own `px-5`; desktop inside the panel. */}
      <p
        className="md:pt-6 text-[14.5px] md:text-[15px] leading-[1.6] md:leading-[1.55] md:max-w-[56ch] md:text-pretty"
        style={{ color: "var(--body)", margin: "0 0 18px" }}
      >
        Chats anyone in the ministry can join.
      </p>

      {error && (
        <p className="text-[13px]" style={{ color: "var(--danger)", margin: "0 0 14px" }} role="alert">
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
        <div>
          <EmptyState
            icon={<Users style={{ width: 21, height: 21 }} strokeWidth={1.7} />}
            title="No open groups yet"
            subtitle="When someone opens a group chat to the ministry, it shows up here."
          />
        </div>
      ) : (
        <>
          {/* ── Phone width — the shipped full-bleed immersive run ──────────── */}
          {/* FULL-BLEED: an `immersive` PocketRow owns the 20px screen gutter
              itself, so its host must not also apply one. SubpageShell's body is
              `px-5` at phone width, which inset the run to 350px and pushed row
              content to 40px. `-mx-5` cancels exactly that; the kicker's own
              `0 20px` margin then lands it back at the 20px gutter. Desktop is
              untouched (`md:mx-0`, and this whole branch is md:hidden). */}
          <div className="md:hidden -mx-5 md:mx-0">
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
    </>
  )
}
