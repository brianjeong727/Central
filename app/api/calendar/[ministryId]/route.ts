import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase-admin"
import { getMinistryTimezone } from "@/lib/ministry-timezone"
import { instantToZoned } from "@/lib/tz"

// Fold long iCal lines at 75 octets per RFC 5545 §3.1
function fold(line: string): string {
  const out: string[] = []
  while (line.length > 75) {
    out.push(line.slice(0, 75))
    line = " " + line.slice(75)
  }
  out.push(line)
  return out.join("\r\n")
}

// Escape iCal text values (commas, semicolons, backslashes, newlines)
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
}

// Format a date string (YYYY-MM-DD or ISO datetime) as an iCal DATE value
function icalDate(dateStr: string): string {
  return dateStr.slice(0, 10).replace(/-/g, "")
}

// Format a date string as an iCal DATETIME value in UTC
// Handles both "YYYY-MM-DD" (treated as UTC midnight) and full ISO datetimes
function icalDateTime(dateStr: string): string {
  const d = new Date(dateStr.length === 10 ? dateStr + "T00:00:00Z" : dateStr)
  if (isNaN(d.getTime())) return `${dateStr.slice(0, 10).replace(/-/g, "")}T000000Z`
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  const h = String(d.getUTCHours()).padStart(2, "0")
  const min = String(d.getUTCMinutes()).padStart(2, "0")
  const s = String(d.getUTCSeconds()).padStart(2, "0")
  return `${y}${mo}${day}T${h}${min}${s}Z`
}

// Add one day to a "YYYY-MM-DD". RFC 5545 §3.8.2.2: DTEND is EXCLUSIVE, so an
// all-day event's DTEND is the day AFTER its last day. Emitting the inclusive last
// day (or, worse, DTEND == DTSTART) produces a zero-length event that Google
// Calendar / Apple Calendar silently drop — the reason subscribed feeds looked empty.
function addOneDay(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T12:00:00Z")
  d.setUTCDate(d.getUTCDate() + 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ministryId: string }> }
) {
  const { ministryId } = await params
  const admin = createAdminClient()

  // The ministry's IANA zone is fetched IN PARALLEL with the rest (no added latency).
  // A server route can't read the client MinistryTimezoneProvider, and the feed used
  // to hardcode America/New_York while every scheduler computed Pacific.
  const [ministryRes, eventsRes, timeZone] = await Promise.all([
    admin.from("ministries").select("name").eq("id", ministryId).maybeSingle(),
    admin
      .from("calendar_events")
      .select("id, title, description, location, start_date, end_date, start_day, end_day, all_day")
      .eq("ministry_id", ministryId)
      .is("parent_event_id", null)
      .order("start_date", { ascending: true }),
    getMinistryTimezone(admin, ministryId),
  ])

  if (!ministryRes.data) {
    return new NextResponse("Ministry not found", { status: 404 })
  }

  const ministryName = (ministryRes.data as { name: string }).name
  const events = (eventsRes.data ?? []) as {
    id: string
    title: string
    description: string | null
    location: string | null
    start_date: string
    end_date: string
    start_day: string | null
    end_day: string | null
    all_day: boolean | null
  }[]

  const now = new Date()
  const stamp =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0") +
    "T" +
    String(now.getUTCHours()).padStart(2, "0") +
    String(now.getUTCMinutes()).padStart(2, "0") +
    String(now.getUTCSeconds()).padStart(2, "0") +
    "Z"

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Central//Ministry Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc(ministryName)}`),
    `X-WR-TIMEZONE:${timeZone}`,
    "X-PUBLISHED-TTL:PT6H",
  ]

  for (const ev of events) {
    // EXPLICIT: only a true `all_day` is all-day. The old `ev.all_day !== false`
    // treated a NULL as all-day, so a row with an unset flag lost its clock times.
    const isAllDay = ev.all_day === true

    let dtstart: string
    let dtend: string
    if (isAllDay) {
      // An all-day event is a DATE RANGE. `start_day`/`end_day` are the truth when
      // present (end INCLUSIVE); otherwise project the stored instants into the
      // MINISTRY's zone — never `start_date.slice(0, 10)`, which reads the UTC day
      // and lands an evening-stored row on the wrong date.
      const startDay = ev.start_day ?? instantToZoned(ev.start_date, timeZone).ymd
      const rawEndDay = ev.end_day ?? (ev.end_date ? instantToZoned(ev.end_date, timeZone).ymd : startDay)
      // Guard a malformed row (end before start) into a single-day event rather than
      // emitting a negative range that clients reject outright.
      const endDayInclusive = rawEndDay && rawEndDay >= startDay ? rawEndDay : startDay
      dtstart = `DTSTART;VALUE=DATE:${icalDate(startDay)}`
      dtend = `DTEND;VALUE=DATE:${icalDate(addOneDay(endDayInclusive))}`
    } else {
      const endInstant = ev.end_date && ev.end_date !== ev.start_date ? ev.end_date : ev.start_date
      dtstart = `DTSTART:${icalDateTime(ev.start_date)}`
      dtend = `DTEND:${icalDateTime(endInstant)}`
    }

    lines.push("BEGIN:VEVENT")
    lines.push(fold(`UID:central-${ev.id}@joincentral.app`))
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(dtstart)
    lines.push(dtend)
    lines.push(fold(`SUMMARY:${esc(ev.title)}`))
    if (ev.description) lines.push(fold(`DESCRIPTION:${esc(ev.description)}`))
    if (ev.location)    lines.push(fold(`LOCATION:${esc(ev.location)}`))
    lines.push("END:VEVENT")
  }

  lines.push("END:VCALENDAR")

  const body = lines.join("\r\n") + "\r\n"

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ministryId}.ics"`,
      "Cache-Control": "public, max-age=3600",
    },
  })
}
