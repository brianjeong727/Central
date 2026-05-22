// Semester utility functions — client-safe (no "use server")

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
