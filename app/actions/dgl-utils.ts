// Semester utility functions — client-safe (no "use server")

export type DGLAvailSlot = "wednesday" | "friday" | "sunday"

export function getSemesterLabel(date: Date = new Date()): string {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  if (month >= 9) return `fall_${year}`
  if (month <= 5) return `spring_${year}`
  return `summer_${year}`
}

export function getSemesterWeeks(semesterLabel: string): Date[] {
  const [season, yearStr] = semesterLabel.split("_")
  const year = parseInt(yearStr, 10)
  if (isNaN(year)) return []

  let start: Date
  let end: Date

  if (season === "fall") {
    start = nthWeekdayOfMonth(year, 8, 0, 1)
    end   = nthWeekdayOfMonth(year, 11, 0, 2)
  } else if (season === "spring") {
    start = nthWeekdayOfMonth(year, 0, 0, 2)
    end   = lastWeekdayOfMonth(year, 3, 0)
  } else {
    return []
  }

  const weeks: Date[] = []
  const cur = new Date(start)
  while (cur <= end) {
    weeks.push(new Date(cur))
    cur.setDate(cur.getDate() + 7)
  }
  return weeks
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const d = new Date(year, month, 1)
  let count = 0
  while (d.getMonth() === month) {
    if (d.getDay() === weekday) {
      count++
      if (count === n) return new Date(d)
    }
    d.setDate(d.getDate() + 1)
  }
  return new Date(year, month, 1)
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const d = new Date(year, month + 1, 0)
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
  return new Date(d)
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function getSemesterOptions(): { value: string; label: string }[] {
  const year = new Date().getFullYear()
  const options: { value: string; label: string }[] = []
  for (let y = year - 1; y <= year + 1; y++) {
    options.push({ value: `spring_${y}`, label: `Spring ${y}` })
    options.push({ value: `fall_${y}`, label: `Fall ${y}` })
  }
  return options
}

// Returns every Wed, Fri, Sun in the semester in chronological order.
// Each Sunday from getSemesterWeeks anchors a triple: Wed (−4d), Fri (−2d), Sun.
export function getSemesterDates(semesterLabel: string): { date: string; slot: DGLAvailSlot }[] {
  const sundays = getSemesterWeeks(semesterLabel)
  const results: { date: string; slot: DGLAvailSlot }[] = []
  for (const sunday of sundays) {
    const wed = new Date(sunday); wed.setDate(wed.getDate() - 4)
    const fri = new Date(sunday); fri.setDate(fri.getDate() - 2)
    results.push({ date: toLocalDateStr(wed), slot: "wednesday" })
    results.push({ date: toLocalDateStr(fri), slot: "friday" })
    results.push({ date: toLocalDateStr(sunday), slot: "sunday" })
  }
  return results
}
