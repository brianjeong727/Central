/**
 * Fiscal year — the single definition of Central's Jun 1 – May 31 budget year.
 *
 * This was copy-pasted verbatim in three places (`app/actions/budget-planning.ts`,
 * `app/home/components/finance-workspace.tsx`, `app/home/tabs/plan-tab.tsx`), so a
 * change to the roll-over month had to be made three times or it silently diverged.
 *
 * This is a plain module (no "use server" directive), following the `lib/roles.ts`
 * precedent: a "use server" file may only export async functions (Convention #6), so
 * a sync helper shared by client components AND server actions has to live in a plain
 * module both can import.
 *
 * Deliberately NOT routed through `lib/tz.ts`. A fiscal year is a calendar-day
 * concept, not an instant: `"2026-2027"` and the `YYYY-MM-DD` bounds it produces are
 * tz-immune values (Convention #23), and pushing them through a zone conversion is
 * exactly the round-trip that bug warns about. The local-clock `new Date()` read here
 * is the pre-existing behavior and is preserved byte-for-byte.
 */

/** Label for the fiscal year containing today, e.g. `"2026-2027"`. Rolls June 1. */
export function currentFiscalYear(): string {
  const now = new Date()
  const y = now.getFullYear()
  // Fiscal year runs Jun 1 – May 31; on June 1 the label rolls to the next pair.
  // Month >= 5 (0-indexed June) → the year that just started.
  return now.getMonth() >= 5 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

/** Inclusive `YYYY-MM-DD` bounds of a fiscal-year label. Plain date strings — no zone. */
export function fiscalYearToDateRange(fiscalYear: string): { start: string; end: string } {
  const [startYear, endYear] = fiscalYear.split("-").map(Number)
  return {
    start: `${startYear}-06-01`,
    end:   `${endYear}-05-31`,
  }
}
