// The workspace Calendar's LIST view is headed "Upcoming" — so it has to be.
//
// It rendered every event the team had ever had, oldest first, with no separation
// of past from future: opening Calendar on Central's board landed you on last
// August with today far below. It also listed a multi-day event's individual
// NIGHTS beside their parent (the events list has always excluded those — a
// sub-event is an interior part of its parent's plan, not a sibling of it), and
// the right rail counted the lot: "Events · 36" against a handful of real ones.
//
// Now: top-level only, not-yet-over first (the same `isEventOver` rule the events
// list uses), past behind a collapsed archive, rail matching the list.
//
// The MONTH grid is deliberately untouched — a past day and a night's dot both
// belong on a calendar.
//
// TEAM NAME MATTERS. classifyTeam (app/home/team-type.ts) routes a preset-matching
// name elsewhere: a "Board" goes to StudentOrgTeamHome, whose General section is a
// month grid, not this list. Only a name matching NO preset falls through to
// MinistryCalendar, which is the component under test.
import { test, expect } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

const TEAM = `${E2E_PREFIX}Outreach Crew`
const ONGOING = `${E2E_PREFIX}Cal Ongoing Week`
const NIGHT = `${E2E_PREFIX}Cal Night One`
const FINISHED = `${E2E_PREFIX}Cal Finished Retreat`
const FUTURE = `${E2E_PREFIX}Cal Fall Kickoff`

let teamId = ""
const eventIds: string[] = []

/** "YYYY-MM-DD", `days` from today. Noon-anchored so no offset drags the date. */
function ymdOffset(days: number): string {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
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
    .insert({ team_id: teamId, name: "Lead", permissions: ["can_plan_events"], is_president: true })
    .select("id").single()
  await sb.client.from("team_members").insert({
    team_id: teamId, user_id: adminId, role_id: (role as { id: string }).id, added_by: adminId,
  })

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

  // Deliberately inserted oldest-LAST, so an "ascending from the beginning of
  // time" regression cannot be mistaken for insertion order.
  const ongoingId = await insert(ONGOING, ymdOffset(-2), ymdOffset(7))
  await insert(NIGHT, ymdOffset(1), ymdOffset(1), ongoingId)
  await insert(FUTURE, ymdOffset(40), ymdOffset(40))
  await insert(FINISHED, ymdOffset(-200), ymdOffset(-198))
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

test("the Calendar list is upcoming, top-level, with its own archive", async ({ page }) => {
  await page.goto(`/home?tab=plan&team=${teamId}`)
  // The desktop sidebar names every event regardless of past/upcoming, so every
  // assertion is scoped to the content column — a page-wide absence check could
  // never pass and would read as the fix having failed.
  const content = page.locator(".shell-scroll")

  await expect(content.getByText(ONGOING, { exact: true }).filter({ visible: true }).first())
    .toBeVisible({ timeout: 30_000 })
  await expect(content.getByText(FUTURE, { exact: true }).filter({ visible: true }).first())
    .toBeVisible()

  // Neither the long-finished event nor the sub-event is in the upcoming list.
  await expect(content.getByText(FINISHED, { exact: true }).filter({ visible: true })).toHaveCount(0)
  await expect(content.getByText(NIGHT, { exact: true }).filter({ visible: true })).toHaveCount(0)

  // The rail counts exactly what the list shows — two, not all four rows.
  await expect(content.getByText(/^Upcoming · \d+$/).filter({ visible: true }).first())
    .toHaveText("Upcoming · 2")

  // The archive holds only the genuinely-finished event; the night stays out of it
  // too, because a sub-event is never a top-level row on either side of the bar.
  const pastBar = content.getByRole("button").filter({ hasText: "Past events" }).first()
  await expect(pastBar).toContainText("1")
  await pastBar.click()
  await expect(content.getByText(FINISHED, { exact: true }).filter({ visible: true }).first())
    .toBeVisible({ timeout: 10_000 })
  await expect(content.getByText(NIGHT, { exact: true }).filter({ visible: true })).toHaveCount(0)
})

test("the Month grid still shows past days and sub-events", async ({ page }) => {
  // The counterpart assertion: narrowing the LIST must not narrow the calendar.
  // Without this, "fixing" the grid the same way would look like an improvement.
  await page.goto(`/home?tab=plan&team=${teamId}`)
  const content = page.locator(".shell-scroll")
  await content.getByRole("button", { name: "Month" }).click()

  await expect(content.getByText(ONGOING, { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(content.getByText(NIGHT, { exact: true }).first()).toBeVisible()
})
