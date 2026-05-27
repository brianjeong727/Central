import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase-admin"

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

// Format a date string (YYYY-MM-DD) as an iCal DATE value
function icalDate(dateStr: string): string {
  return dateStr.replace(/-/g, "")
}

// Format a date string as an iCal DATETIME value (UTC midnight)
function icalDateTime(dateStr: string): string {
  return `${dateStr.replace(/-/g, "")}T000000Z`
}

// Add one day to a YYYY-MM-DD string (iCal all-day DTEND is exclusive)
function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z")
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

  const [ministryRes, eventsRes] = await Promise.all([
    admin.from("ministries").select("name").eq("id", ministryId).maybeSingle(),
    admin
      .from("calendar_events")
      .select("id, title, description, location, start_date, end_date, all_day")
      .eq("ministry_id", ministryId)
      .is("parent_event_id", null)
      .order("start_date", { ascending: true }),
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
    all_day: boolean
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
    "X-WR-TIMEZONE:America/New_York",
    "X-PUBLISHED-TTL:PT6H",
  ]

  for (const ev of events) {
    const isAllDay = ev.all_day !== false
    const dtstart = isAllDay
      ? `DTSTART;VALUE=DATE:${icalDate(ev.start_date)}`
      : `DTSTART:${icalDateTime(ev.start_date)}`

    const endDate = ev.end_date && ev.end_date !== ev.start_date
      ? ev.end_date
      : isAllDay ? addOneDay(ev.start_date) : ev.start_date
    const dtend = isAllDay
      ? `DTEND;VALUE=DATE:${icalDate(endDate)}`
      : `DTEND:${icalDateTime(endDate)}`

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
