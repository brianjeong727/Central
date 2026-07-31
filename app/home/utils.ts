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

export function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
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
