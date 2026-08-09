import { instantToZoned } from "@/lib/tz"
import type { ChatPreview } from "@/components/central/chat-strip"

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🙏", "🔥", "😮"]

// Normalize a typed dollar amount on blur / Enter-commit: "7" → "7.00", "7.7" →
// "7.70". Empty stays empty (never force "0.00" onto a blank field). Negative /
// non-numeric clamps to ">= 0" (Math.max(0, …).toFixed(2)). Call this ONLY on
// blur — never mid-typing, so the user isn't fought while entering a value.
export function normalizeMoneyInput(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === "") return ""
  const n = parseFloat(trimmed)
  if (isNaN(n)) return ""
  return Math.max(0, n).toFixed(2)
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// Parse a date string as a LOCAL date. A bare "YYYY-MM-DD" (date-only, e.g. an
// event_date) is otherwise parsed as UTC midnight and shifts a day back when
// displayed in a behind-UTC timezone — split it and build a local Date instead.
// Strings that carry a time component are parsed as-is.
export function parseDateLocal(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(dateStr)
}

export function formatDate(dateStr: string): string {
  return parseDateLocal(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

// ── Event date-span helpers ───────────────────────────────────────────────────
// An event's span is a CALENDAR-day question, not a timestamp one. The retreat
// preset starts 5:00 PM and ends 2:00 PM three days later, so comparing raw
// Dates ("is end still after start?") drops the final day. Everything below
// normalizes to local midnight first, and every event-date surface (Overview,
// the mobile facts grid, the events list, the Run of Show day headers) goes
// through these two functions so there is exactly one implementation.

function atLocalMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Whole calendar days an event covers, inclusive of both ends. 1 for a same-day event. */
export function eventDaySpan(start: Date | string, end: Date | string): number {
  const s = atLocalMidnight(typeof start === "string" ? parseDateLocal(start) : start)
  const e = typeof end === "string" ? parseDateLocal(end) : end
  if (isNaN(e.getTime())) return 1
  const days = Math.round((atLocalMidnight(e).getTime() - s.getTime()) / 86_400_000) + 1
  return days > 0 ? days : 1
}

/**
 * Editorial date label for an event's identity line.
 *   same day    → "Saturday, September 12"
 *   same month  → "September 12 – 25"
 *   spans months→ "September 12 – October 3"
 */
export function eventDateRangeLabel(start: Date | string, end: Date | string): string {
  const s = typeof start === "string" ? parseDateLocal(start) : start
  const e = typeof end === "string" ? parseDateLocal(end) : end
  if (isNaN(e.getTime()) || eventDaySpan(s, e) === 1) {
    return s.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  }
  const from = s.toLocaleDateString("en-US", { month: "long", day: "numeric" })
  const to = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
    ? String(e.getDate())
    : e.toLocaleDateString("en-US", { month: "long", day: "numeric" })
  return `${from} – ${to}`
}

/** Compact form of the same range, for dense meta rows: "Sep 12" / "Sep 12 – Sep 25". */
export function eventDateRangeShort(start: Date | string, end: Date | string): string {
  const s = typeof start === "string" ? parseDateLocal(start) : start
  const e = typeof end === "string" ? parseDateLocal(end) : end
  const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  if (isNaN(e.getTime()) || eventDaySpan(s, e) === 1) return short(s)
  return `${short(s)} – ${short(e)}`
}

/** Uppercase mono day header shared by Run of Show and Sub-events: "FRI · SEP 12". */
export function eventDayHeaderLabel(d: Date): string {
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} · ${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}`.toUpperCase()
}

/**
 * A run-of-show block's length, from `event_blocks.duration_min` (integer minutes).
 * This is INTEGER formatting, not date math — a block's duration carries no instant
 * and no zone, so it never goes near `lib/tz.ts` (Convention #23).
 *   30 → "30 min" · 60 → "1 hr" · 75 → "1 hr 15 min" · 90 → "1 hr 30 min"
 * Null / zero / negative → "" so a caller can `label || undefined` a slot away.
 */
export function formatDurationMin(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min) || min <= 0) return ""
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

// ── Event countdown ───────────────────────────────────────────────────────────
// Promoted here from plan-tab.tsx now that a SHARED component (the L1 event meta
// line) consumes it. Both keep the explicit `timeZone` argument: the countdown is
// answered on the MINISTRY's calendar, never the device's (Convention #23) — an
// 8pm ET event is still "today" for the ministry when UTC has already rolled over.

/** Whole-day difference between two instants on the ministry's calendar (sign-preserving). */
export function daysUntil(start: Date, now: Date, timeZone: string): number {
  const s = Date.parse(`${instantToZoned(start, timeZone).ymd}T00:00:00Z`)
  const n = Date.parse(`${instantToZoned(now, timeZone).ymd}T00:00:00Z`)
  return Math.round((s - n) / 86400000)
}

/** Humanised countdown for a future event; null for past events (caller shows nothing). */
export function countdownLabel(start: Date, now: Date, timeZone: string): { label: string; soon: boolean } | null {
  const days = daysUntil(start, now, timeZone)
  if (days < 0) return null
  let label: string
  if (days === 0) label = "Today"
  else if (days === 1) label = "Tomorrow"
  else if (days < 30) label = `in ${days} days`
  else { const m = Math.round(days / 30); label = `in ${m} month${m === 1 ? "" : "s"}` }
  return { label, soon: days <= 7 }
}

export function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

// Chat-LIST timestamp: the clock time a conversation last moved, not "5m ago".
// Knowing a message landed at 11:47 PM is more useful at a glance than knowing it
// was 38 minutes back, and it doesn't silently go stale while the list sits open.
//
// Deliberately NOT formatRelativeTime: that one still serves the surfaces where
// recency IS the point (an archive request, a moderation report, a shared file),
// so the two must stay separate rather than one being retuned into the other.
//
// The ramp past today is the standard messaging one — a bare "11:47 PM" on a
// three-day-old thread reads as today and is worse than useless:
//   today      → 11:47 PM
//   yesterday  → Yesterday
//   this week  → Tue
//   older      → 8/1/26
//
// DEVICE-LOCAL on purpose. Convention #23 routes event times through the
// MINISTRY's zone, and explicitly exempts chat timestamps — "when did this arrive
// for ME" is a question about the reader's own clock.
export function formatChatListTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  // Calendar-day distance, not a 24h window: a message at 11:50 PM is "yesterday"
  // at 12:10 AM, not "20 minutes ago rounded to today". Both ends are snapped to
  // LOCAL midnight, and the rounding absorbs the 23/25-hour DST days.
  const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const midnightThen = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((midnightToday - midnightThen) / 86400000)

  if (days <= 0) return formatMessageTime(dateStr) // today (<0 = clock skew ahead)
  if (days === 1) return "Yesterday"
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" })
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
}

export function audienceLabel(audience: string | null): string {
  if (!audience || audience === "all") return "Everyone"
  if (audience.match(/^\d{4}$/)) return `Class of ${audience}`
  if (audience === "group") return "Specific Group"
  return audience
}

export function previewBody(body: string): string {
  return body.replace(/\s*\n+\s*/g, " ").trim()
}

// Display text for a chat-list preview: text wins, else a media/poll label, else "".
export function chatPreviewLabel(content?: string | null, attachmentType?: string | null, hasPoll?: boolean | null): string {
  if (content && content.trim()) return previewBody(content)
  if (attachmentType?.startsWith("image/")) return "Photo"
  if (attachmentType) return "File"
  if (hasPoll) return "Poll"
  return ""
}

// Preview label for a replied-to / pinned / forwarded message. Text wins; falls
// back to "Photo" for images or the attachment name / "File" otherwise.
export function replyPreviewLabel(
  content?: string | null,
  attachmentType?: string | null,
  attachmentName?: string | null,
): string {
  if (content && content.trim()) return content
  if (attachmentType?.startsWith("image/")) return "Photo"
  if (attachmentType) return attachmentName || "File"
  return ""
}

// ── get_chat_previews → ChatPreview[] ────────────────────────────────────────
// The row shape and mapper for the `get_chat_previews` RPC, shared by the SSR
// boot (app/home/page.tsx, server component) and the client refetcher
// (home-app.tsx `loadRecentChats`).
//
// It lives HERE rather than in chat-list.ts because that module imports the
// BROWSER Supabase client at module scope — a server component importing it
// would drag the browser client into the server bundle. This mapper is pure and
// composes only the three helpers above, so both callers can reach it. Each
// caller still runs its own query with its own client; only the shape and the
// projection are shared.
//
// Both copies had already DRIFTED before this was unified: the client mapped
// `type: row.group_type` and the server did not, so an SSR-seeded chat carried
// no `type` until the first client refetch replaced it — and `type` is what
// routes the Messages church/my subtab when a chat is opened from the Home
// strip. (Found by the 2026-08-04 audit.)
export type ChatPreviewRow = {
  group_id: string; group_name: string; group_type: string
  last_read_at: string | null; last_msg_content: string | null
  last_msg_sender_name: string | null; last_msg_at: string | null
  last_msg_type: string | null; unread_count: number
  last_msg_attachment_type: string | null; last_msg_has_poll: boolean | null
  muted: boolean | null; pinned: boolean | null
}

/** Map + sort `get_chat_previews` rows into the ChatPreview shape the Home strip
 *  renders. Newest first; rows with no message sort last (never interleaved). */
export function rowsToChatPreviews(rows: ChatPreviewRow[]): ChatPreview[] {
  return rows
    .map((row) => ({
      id: row.group_id,
      groupName: row.group_name,
      type: row.group_type,
      lastMessage: chatPreviewLabel(row.last_msg_content, row.last_msg_attachment_type, row.last_msg_has_poll),
      lastMessageSender: row.last_msg_sender_name ?? "",
      unreadCount: Number(row.unread_count),
      initials: getInitials(row.group_name),
      time: row.last_msg_at ? formatChatListTime(row.last_msg_at) : "",
      muted: row.muted ?? false,
      pinned: row.pinned ?? false,
      _ts: row.last_msg_at ?? "",
    }))
    .sort((a, b) => {
      if (!a._ts && !b._ts) return 0
      if (!a._ts) return 1
      if (!b._ts) return -1
      return b._ts.localeCompare(a._ts)
    })
    .map(({ _ts: _, ...rest }) => rest)
}
