// An event that is HAPPENING RIGHT NOW belongs in the upcoming list, not the archive.
//
// The events agenda used to split on `start_date`: anything that had started was
// "past". A one-evening event survived that (it starts and ends the same day), so
// the bug only showed on MULTI-DAY events — Central's Aug 18–29 Welcome Week filed
// itself under "Past events" on Aug 19, with eleven days still to run.
//
// The split is now `isEventOver` (plan-tab.tsx) — the event's last ministry-zone
// calendar day, `end_day` INCLUSIVE for an all-day row (Convention #23). Two
// sibling sites already encoded that rule in SQL (`.gte("end_date", …)`); this
// guards the in-memory twin the list uses.
import { test, expect } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

// "Board" is load-bearing: classifyTeam (app/home/team-type.ts) routes a name
// matching STUDENT_ORG_RE to StudentOrgTeamHome, which is what renders
// EventsAgendaList and its "Past events" bar. A name that misses the regex falls
// to the MinistryCalendar branch — a different list with no archive at all, so
// the spec would be testing a surface the bug never lived on.
const TEAM = `${E2E_PREFIX}Ongoing Events Board`
const ONGOING = `${E2E_PREFIX}Ongoing Multi Day`
const FINISHED = `${E2E_PREFIX}Finished Last Week`
const FUTURE = `${E2E_PREFIX}Starts Next Month`

let teamId = ""
const eventIds: string[] = []

/** "YYYY-MM-DD", `days` from today, on the ministry's clock (America/New_York). */
function ymdOffset(days: number): string {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)          // noon-anchored: no offset can drag the date
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

test.use({ storageState: adminState })

test.beforeAll(async () => {
  const sb = sandbox()
  const adminId = await sb.adminUserId()

  const { data: team, error } = await sb.client
    .from("teams")
    .insert({ ministry_id: sb.ministryId, name: TEAM, description: "e2e", team_type: "standard", created_by: adminId })
    .select("id").single()
  if (error) throw error
  teamId = (team as { id: string }).id

  const { data: role } = await sb.client.from("team_roles")
    .insert({ team_id: teamId, name: "President", permissions: ["can_plan_events"], is_president: true })
    .select("id").single()
  await sb.client.from("team_members").insert({
    team_id: teamId, user_id: adminId, role_id: (role as { id: string }).id, added_by: adminId,
  })

  // All-day rows, the shape Welcome Week has: `start_day`/`end_day` are the truth
  // and `end_day` is INCLUSIVE, with the timestamptz pair derived for sorting.
  const rows = [
    // Started two days ago, runs another week — the case that regressed.
    { title: ONGOING, start: ymdOffset(-2), end: ymdOffset(7) },
    // Genuinely over: ended eight days ago.
    { title: FINISHED, start: ymdOffset(-12), end: ymdOffset(-8) },
    // Not started at all.
    { title: FUTURE, start: ymdOffset(30), end: ymdOffset(31) },
  ]
  const insert = async (title: string, start: string, end: string, parent: string | null = null) => {
    const { data, error: e } = await sb.client.from("calendar_events").insert({
      ministry_id: sb.ministryId, team_id: teamId, title,
      all_day: true, start_day: start, end_day: end,
      start_date: `${start}T04:00:00Z`, end_date: `${end}T23:59:59Z`,
      created_by: adminId, parent_event_id: parent,
    }).select("id").single()
    if (e) throw e
    const id = (data as { id: string }).id
    eventIds.push(id)
    return id
  }

  for (const r of rows) await insert(r.title, r.start, r.end)
})

test.afterAll(async () => {
  const sb = sandbox()
  if (eventIds.length) await sb.client.from("calendar_events").delete().in("id", eventIds)
  if (teamId) {
    await sb.client.from("team_members").delete().eq("team_id", teamId)
    await sb.client.from("team_roles").delete().eq("team_id", teamId)
    await sb.client.from("teams").delete().eq("id", teamId)
  }
})

test("an in-progress multi-day event stays in the upcoming list", async ({ page }) => {
  await page.goto(`/home?tab=plan&team=${teamId}&sotab=Events`)

  // Scope every assertion to the CONTENT column. The desktop sidebar lists every
  // event under its Events nav item regardless of past/upcoming, so a page-wide
  // "the finished one is absent" check can never pass — and would look like the
  // fix had failed when it had not.
  const content = page.locator(".shell-scroll")

  // The upcoming list renders eagerly; the past list is behind a collapse bar that
  // starts CLOSED whenever anything is upcoming. So "visible without touching the
  // bar" is exactly the assertion — it cannot pass by accident from the archive.
  await expect(content.getByText(ONGOING, { exact: true }).filter({ visible: true }).first())
    .toBeVisible({ timeout: 30_000 })
  await expect(content.getByText(FUTURE, { exact: true }).filter({ visible: true }).first())
    .toBeVisible()

  // …and the one that really ended is NOT in it.
  await expect(content.getByText(FINISHED, { exact: true }).filter({ visible: true })).toHaveCount(0)

  // The bar's own count is the second half of the proof: "1" means exactly the
  // finished event went to the archive. Before the fix this read "2".
  const pastBar = content.getByRole("button").filter({ hasText: "Past events" }).first()
  await expect(pastBar).toBeVisible()
  await expect(pastBar).toContainText("1")

  // Expanding it surfaces the finished event, so the archive is genuinely where it went.
  await pastBar.click()
  await expect(content.getByText(FINISHED, { exact: true }).filter({ visible: true }).first())
    .toBeVisible({ timeout: 10_000 })
})
