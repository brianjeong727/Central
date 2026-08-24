// ── Chat helpers shared by the LIST and the THREAD ───────────────────────────
//
// These five used to live at the top of chats-tab.tsx. The list surfaces
// (chat-list-view.tsx) and the thread/settings surfaces (chats-tab.tsx) both use
// them, so they are HOISTED here rather than moved with either half — otherwise
// the small, server-rendered list chunk would have to import the ~3,900-line
// thread module just to reach a section label.
//
// Deliberately pure: no JSX, no browser API, no React. That is what lets the
// server component (app/home/page.tsx) import resolveChatsSection.

import type { ChatGroup } from "../types"

// ── Church-chat sectioning ─────────────────────────────────────────────────
// Church chats split into three sections (General / Groups / Teams) by the
// `category` column. Null/unknown category falls back to "general". Recency
// sort within each section is inherited from the already-sorted input list.
export type ChurchSection = "general" | "group" | "team"
export const CHURCH_SECTION_DEFS: { key: ChurchSection; label: string }[] = [
  { key: "general", label: "General" },
  { key: "group", label: "Groups" },
  { key: "team", label: "Teams" },
]
export function sectionChurchChats(chats: ChatGroup[]): Record<ChurchSection, ChatGroup[]> {
  const out: Record<ChurchSection, ChatGroup[]> = { general: [], group: [], team: [] }
  for (const c of chats) {
    if (c.category === "team") out.team.push(c)
    else if (c.category === "group") out.group.push(c)
    else out.general.push(c)
  }
  return out
}

// Stable partition: pinned rooms float to the top, preserving the existing
// recency order within the pinned and unpinned subsets (no re-sort by anything
// else). Applied per rendered group — each church section + the flat My Chats list.
export function partitionPinned(chats: ChatGroup[]): ChatGroup[] {
  const pinned: ChatGroup[] = []
  const rest: ChatGroup[] = []
  for (const c of chats) (c.pinned ? pinned : rest).push(c)
  return [...pinned, ...rest]
}

// A gated church chat shows a small lock glyph — only on rooms the member is IN
// but whose membership is restricted: any team chat, plus the two role-synced
// general chats ("Leaders" and "<Ministry> Staff", mirrored from auto-chats.ts).
export function isLockedChat(group: ChatGroup, ministryName: string): boolean {
  if (group.category === "team") return true
  if (group.name === "Leaders") return true
  if (ministryName && group.name === `${ministryName} Staff`) return true
  return false
}

// ── The `?chats` scope, resolved in ONE place ────────────────────────────────
// Which scope the list opens on (Church | My chats). URL state itself is
// unchanged — it is still written through nav-state's one atomic replace
// (Convention #12); this only validates the value.
//
// The FIRST value is now read on the SERVER (app/home/page.tsx reads
// searchParams and threads it down as initialSection) instead of by a
// `typeof window` peek inside a useState initializer. That peek was a hydration
// mismatch by construction: the server has no window, so it always rendered
// "church" while a client arriving at ?chats=my rendered "my" — the wrong
// segment painted first and React had to discard it. It was also duplicated
// verbatim in ChatsTab and ChatListPanel.
// THREE scopes, not two. Open groups are a third bucket of the same object —
// the chats the church made, the ones you made, and the ones anyone can join —
// so they belong in the same exclusive switch rather than as an entry row
// somewhere in the body. A row at the TOP outranked the conversations; a row at
// the BOTTOM was below the fold the moment a ministry had a screenful of chats
// (Brian, 2026-08-20). A scope is neither: it never scrolls, it costs the body
// no pixels, and it can't outrank a list it isn't above.
//
// The labels are CATEGORIES, deliberately parallel — "which chats? church ones /
// mine / open ones". "Browse" was rejected for this slot: it is an action
// wearing a category's clothes, and it does not fit besides (the options ARE the
// 22/600 chrome title, and three of them plus the two round buttons have to fit
// 375px — Church 74 + Mine 51 + Open 54 + 32 of gaps = 211 against a 247 budget).
// ── Unread, split by scope ──────────────────────────────────────────────────
// The scope switcher (Church | Mine | Open) hides two of the three buckets, so a
// notification could land in a scope you are not looking at and the list would
// show you nothing — you would go to Messages, see an empty Church list, and
// conclude the app had lost the message.
//
// The filter here is deliberately the SAME one the bottom-nav total uses
// (`!archived && !muted`). These two numbers must PARTITION that badge exactly:
// if the nav says 3 and the scopes account for 2, the feature has replaced "where
// is it?" with "where are the other ones?" — worse than no indicator at all.
// Muted is excluded for the same reason a muted row shows no dot: the user has
// already said they don't want to be pulled back to it.
//
// "Open" is not a bucket of the user's chats (it is discovery — groups they have
// not joined), so it has no unread and gets no dot.
export function unreadByScope(groups: ChatGroup[]): { church: number; my: number } {
  let church = 0
  let my = 0
  for (const g of groups) {
    if (g.archived || g.muted) continue
    if (g.unread_count <= 0) continue
    if (g.type === "church") church += g.unread_count
    else my += g.unread_count
  }
  return { church, my }
}

export type ChatsSection = "church" | "my" | "open"
export function resolveChatsSection(raw: string | string[] | null | undefined): ChatsSection {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === "my" ? "my" : v === "open" ? "open" : "church"
}
