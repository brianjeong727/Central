// ─────────────────────────────────────────────────────────────────────────────
// lib/tz.ts — the ONE event date/time conversion layer.
//
// WHY THIS FILE EXISTS
// `calendar_events.start_date` is a `timestamptz`: an INSTANT, not a wall clock.
// Before this layer the app had two producers writing opposite conventions into
// that one column — the Add-event modal wrote `${ymd}T${hhmm}:00+00:00` (a
// ministry wall-clock time mislabeled as UTC) while the seed scripts wrote a
// real Eastern instant. ~40 display sites read it as an instant. So a
// modal-created 7pm event rendered as 3pm, and the modal read a seeded noon
// event back as 4pm. Both populations are byte-identical in the column, which
// is why there is no query that can repair them.
//
// The fix is a single convention — the column always holds a TRUE instant — and
// a single conversion layer that every event read and write routes through. The
// wall clock a ministry means is interpreted in THAT MINISTRY'S timezone
// (`ministries.timezone`, IANA), never the browser's and never UTC.
//
// CONSTRAINTS THIS FILE HONORS
//  • Dependency-free. There is no date library in this repo and none is being
//    added. Everything below is `Intl.DateTimeFormat` + arithmetic.
//  • DST-correct by construction. Offsets are PROBED per instant, never
//    assumed — a fixed "-05:00" is wrong for half the year in every US zone.
//  • Isomorphic. No `window`, no `process`, no Node-only API — safe in client
//    components, server actions, route handlers, and edge.
//  • No imports at all, so any module (including LEAF `components/central/*`)
//    may consume it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The one documented fallback zone, applied in exactly ONE place —
 * `resolveMinistryTimezone()`. Do not import it anywhere else: a second
 * fallback site is a second silent default, which is how the original bug hid
 * for so long. Matches the `ministries.timezone` column default.
 */
const FALLBACK_TIMEZONE = "America/New_York"

// ── internals ────────────────────────────────────────────────────────────────

// `Intl.DateTimeFormat` construction is expensive and these run per row across
// calendar/list renders. Cache one parts-formatter per zone.
const PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = PARTS_FORMATTERS.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    PARTS_FORMATTERS.set(timeZone, f)
  }
  return f
}

type ZoneParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

/** Wall-clock fields of `date` as they read on a clock in `timeZone`. */
function zoneParts(date: Date, timeZone: string): ZoneParts {
  const parts = partsFormatter(timeZone).formatToParts(date)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? "0")
  // Some engines historically emitted hour "24" for midnight under h23; normalize.
  const hour = get("hour") % 24
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute"), second: get("second") }
}

/**
 * Milliseconds a clock in `timeZone` is AHEAD of UTC **at that instant**
 * (EDT → −14_400_000, EST → −18_000_000). Probed, never assumed: this is the
 * single function that makes every conversion below DST-correct.
 */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zoneParts(date, timeZone)
  const asIfUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  // Parts carry no milliseconds — compare at second resolution so sub-second
  // values can't leak a bogus offset.
  return asIfUTC - Math.floor(date.getTime() / 1000) * 1000
}

const pad2 = (n: number) => String(n).padStart(2, "0")

// ── timezone identity ────────────────────────────────────────────────────────

/**
 * True if `name` is a timezone this runtime can actually format in.
 *
 * Prefers the canonical `Intl.supportedValuesOf("timeZone")` list where the
 * runtime exposes it, and falls back to attempting a `DateTimeFormat` — which
 * also lets legitimate aliases through (`US/Eastern`, `Asia/Calcutta`) that the
 * canonical list omits. Prevents: a typo'd or renamed zone reaching
 * `Intl.DateTimeFormat`, which throws a `RangeError` and would take down every
 * calendar render. The DB CHECK on `ministries.timezone` only guards the
 * `Area/Location` *shape* — it cannot know the tz database.
 */
export function isValidTimeZone(name: unknown): name is string {
  if (typeof name !== "string" || name.length === 0) return false
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  if (typeof supportedValuesOf === "function") {
    try {
      if (supportedValuesOf.call(Intl, "timeZone").includes(name)) return true
    } catch {
      // fall through to the constructor probe
    }
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name })
    return true
  } catch {
    return false
  }
}

/**
 * THE fallback site. Turns a raw `ministries.timezone` value into a zone that is
 * safe to format with. Every consumer — the client provider and every server
 * action/route — resolves here, so "what happens when the zone is missing" has
 * exactly one answer and one place to change it.
 *
 * A missing/invalid zone is a DATA BUG (the column is NOT NULL with a default),
 * so this warns loudly rather than defaulting silently.
 */
export function resolveMinistryTimezone(raw: string | null | undefined): string {
  if (isValidTimeZone(raw)) return raw
  if (raw != null && raw !== "") {
    console.error(`[tz] ministries.timezone is not a valid IANA zone: ${JSON.stringify(raw)} — falling back to ${FALLBACK_TIMEZONE}`)
  }
  return FALLBACK_TIMEZONE
}

// ── wall clock → instant ─────────────────────────────────────────────────────

/**
 * A wall-clock date+time IN `timeZone` → the UTC instant it names.
 *
 * Prevents: `new Date(`${ymd}T${hhmm}:00+00:00`)` — a wall clock mislabeled as
 * UTC, the original bug. Also prevents `new Date(y, m, d, h, min)`, which
 * silently interprets the input in the BROWSER's zone (a leader planning from
 * California would file a Pittsburgh event three hours off).
 *
 * @param ymd  "YYYY-MM-DD"
 * @param time "HH:MM" or "HH:MM:SS"
 *
 * DST edge cases (documented, deterministic):
 *  • Repeated wall clock (fall back): resolves to the FIRST occurrence.
 *  • Nonexistent wall clock (spring forward gap): shifts FORWARD past the gap,
 *    matching how calendar apps behave. Neither is reachable by typing a normal
 *    event time; both are defined so behavior can never be arbitrary.
 */
export function zonedTimeToInstant(ymd: string, time: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  const [hh = 0, mm = 0, ss = 0] = time.split(":").map(Number)
  const naive = Date.UTC(y, m - 1, d, hh, mm, ss)
  // Probe the offset at the naive guess, correct, then re-probe: one correction
  // is enough because a zone's offset changes by at most a couple of hours.
  const off1 = zoneOffsetMs(new Date(naive), timeZone)
  const cand1 = naive - off1
  const off2 = zoneOffsetMs(new Date(cand1), timeZone)
  if (off2 === off1) return new Date(cand1)
  const cand2 = naive - off2
  // Only accept the corrected candidate if it actually reads back as the
  // requested wall clock; if it doesn't, the wall clock never existed (spring
  // forward) and cand1 is the forward-shifted answer.
  const back = zoneParts(new Date(cand2), timeZone)
  const matches = back.year === y && back.month === m && back.day === d && back.hour === hh && back.minute === mm
  return new Date(matches ? cand2 : cand1)
}

/** `zonedTimeToInstant` as an ISO-8601 UTC string — what a `timestamptz` write takes. */
export function zonedTimeToISO(ymd: string, time: string, timeZone: string): string {
  return zonedTimeToInstant(ymd, time, timeZone).toISOString()
}

// ── instant → wall clock ─────────────────────────────────────────────────────

/**
 * A stored instant → the wall clock it reads as in `timeZone`.
 *
 * Prevents: `iso.split("T")[0]` / `iso.slice(11, 16)` — string-slicing the raw
 * UTC text out of a `timestamptz`, which is what made the edit modal disagree
 * with all ~40 display sites. Also prevents `date.getHours()`, which answers in
 * the viewer's device zone rather than the ministry's.
 *
 * @returns `ymd` ("YYYY-MM-DD") and `hhmm` ("HH:MM", 24h) — the exact shapes the
 *          `<input type="date">` / `<input type="time">` controls take.
 */
export function instantToZoned(value: string | Date, timeZone: string): { ymd: string; hhmm: string } {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return { ymd: "", hhmm: "" }
  const p = zoneParts(date, timeZone)
  return {
    ymd: `${p.year}-${pad2(p.month)}-${pad2(p.day)}`,
    hhmm: `${pad2(p.hour)}:${pad2(p.minute)}`,
  }
}

/**
 * Display formatter, pinned to a zone.
 *
 * Prevents: bare `new Date(iso).toLocaleString(...)`, which renders in the
 * VIEWER's device zone — so the same event reads 7:00 PM to a student in
 * Pittsburgh and 4:00 PM to one home in California over break. An event's time
 * is a property of the ministry, not of who is looking at it.
 */
export function formatInZone(
  value: string | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
  locale = "en-US",
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date)
}

/** Today's calendar date in `timeZone` ("YYYY-MM-DD"). Prevents "today" flipping
 *  at the viewer's midnight (or at UTC midnight, 8pm Eastern) instead of the
 *  ministry's — the past-clamp on seeded task due dates depends on it. */
export function todayInZone(timeZone: string): string {
  return instantToZoned(new Date(), timeZone).ymd
}

// ── all-day events ───────────────────────────────────────────────────────────
//
// An all-day event is a DATE RANGE, not an instant range. `calendar_events`
// therefore carries `start_day`/`end_day` (`date`, `end_day` INCLUSIVE) as the
// truth for all-day rows, while `start_date`/`end_date` keep carrying derived
// instants so sorting, the ICS feed, and `run_sheet_tick()` keep working
// against one column pair. Both are written; neither is optional.

/** Midnight at the start of `day` in `timeZone`, as an instant. */
export function dayStartInstantISO(day: string, timeZone: string): string {
  return zonedTimeToISO(day, "00:00:00", timeZone)
}

/** The last second of the INCLUSIVE `day` in `timeZone`, as an instant. Prevents
 *  the all-day end landing at the *start* of its last day (a zero-length range)
 *  or on the next day (an off-by-one in every "is it over?" filter). */
export function dayEndInstantISO(day: string, timeZone: string): string {
  return zonedTimeToISO(day, "23:59:59", timeZone)
}

/** The date/time columns of a `calendar_events` row. `start_day`/`end_day` are
 *  non-null for all-day rows and null for timed ones. */
export type EventDateColumns = {
  start_date: string
  end_date: string
  start_day: string | null
  end_day: string | null
}

/** The four form controls the Add-event modal edits. */
export type EventDateInputs = {
  allDay: boolean
  startYMD: string
  startHHMM: string
  endYMD: string
  endHHMM: string
}

/**
 * Form inputs → the columns to write. The ONE place the write convention lives.
 *
 * All-day: `start_day`/`end_day` are exactly what the user picked (end
 * inclusive), and the instants are derived — local midnight → local 23:59:59.
 * Timed: the wall clocks are converted through the ministry zone, and the day
 * columns are explicitly nulled (an event edited from all-day to timed must not
 * keep stale day columns).
 */
export function eventDateColumnsFromInputs(inputs: EventDateInputs, timeZone: string): EventDateColumns {
  const { allDay, startYMD, startHHMM, endYMD, endHHMM } = inputs
  if (allDay) {
    return {
      start_day: startYMD,
      end_day: endYMD,
      start_date: dayStartInstantISO(startYMD, timeZone),
      end_date: dayEndInstantISO(endYMD, timeZone),
    }
  }
  return {
    start_day: null,
    end_day: null,
    start_date: zonedTimeToISO(startYMD, startHHMM, timeZone),
    end_date: zonedTimeToISO(endYMD, endHHMM, timeZone),
  }
}

/**
 * The exact inverse: a stored row → the form controls. Pairing it with
 * `eventDateColumnsFromInputs` is what guarantees the round trip — what the user
 * typed is what the modal shows them next time.
 *
 * All-day rows read `start_day`/`end_day` when present (the truth) and fall back
 * to projecting the instants into the ministry zone for rows written before
 * those columns existed. NOTE: that fallback is correct for rows stored as true
 * instants and off by a day for legacy modal rows stored as `T00:00:00+00:00` —
 * those are ambiguous by construction (a legacy all-day row and a true one are
 * byte-identical) and are being fixed by the sandbox re-seed, not by a guess
 * here.
 */
export function eventDateInputsFromRow(
  row: { all_day?: boolean | null; start_date: string; end_date: string; start_day?: string | null; end_day?: string | null },
  timeZone: string,
  fallback: { startHHMM: string; endHHMM: string } = { startHHMM: "09:00", endHHMM: "17:00" },
): EventDateInputs {
  const allDay = !!row.all_day
  const start = instantToZoned(row.start_date, timeZone)
  const end = instantToZoned(row.end_date, timeZone)
  if (allDay) {
    return {
      allDay: true,
      startYMD: row.start_day || start.ymd,
      endYMD: row.end_day || end.ymd,
      // All-day rows carry no meaningful clock; keep the caller's defaults so
      // toggling all-day OFF lands on sane times instead of 00:00–23:59.
      startHHMM: fallback.startHHMM,
      endHHMM: fallback.endHHMM,
    }
  }
  return {
    allDay: false,
    startYMD: start.ymd,
    startHHMM: start.hhmm || fallback.startHHMM,
    endYMD: end.ymd,
    endHHMM: end.hhmm || fallback.endHHMM,
  }
}
