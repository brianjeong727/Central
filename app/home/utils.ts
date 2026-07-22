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
