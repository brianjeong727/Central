// Click-through coverage for the season-rollover model.
//
// The Events page carries a season filter (chips derived from the events'
// academic seasons) and a leader-gated "Start next season" button that copies
// every RECURRING top-level event of the latest season forward one year —
// exact plan copy (checklist, roles, run-of-show, sub-events), same-weekday
// dates, completion reset, every lead unassigned. One-offs stay put. The New
// Event modal is quick presets + free-form only (the per-event shelf is gone);
// recurring events carry a repeat mark.
//
// Drives the seeded fixture (scripts/seed-ccsf-events.mjs): completed 2025–26
// season, 12 recurring top-level events + 7 Welcome Week sub-events. The
// rollover this spec performs is CLEANED UP in afterAll (exact titles, next
// season only) so the fixture returns to its pre-rollover state.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

const FIXTURE_TITLES = [
  "Welcome Week", "The FAIR", "First DGs", "Churchwide Picnic", "Coffeehouse",
  "Girls Turkeybowl", "Guys Turkeybowl", "Men's Retreat", "Guys Appreciation Night (GAN)",
  "EM Retreat", "EMKM Field Day", "Senior Send-off (SSO)",
  // Welcome Week sub-events
  "Popsicle Social (CMU)", "Popsicle Social (Pitt)", "Game Day", "Pitt Involvement Fair",
  "Sports Day (Pitt)", "First Praise Night", "Welcoming Night",
]

let teamId = ""

// Remove any 2026–27 copies of the fixture events (rollover output only —
// everything seeded lives in 2025–26 and is untouched).
async function cleanupRolled() {
  const sb = sandbox()
  const { data: evs } = await sb.client
    .from("calendar_events").select("id")
    .eq("ministry_id", sb.ministryId).eq("team_id", teamId)
    .in("title", FIXTURE_TITLES).gte("start_date", "2026-07-01")
  const ids = (evs ?? []).map((e: { id: string }) => e.id)
  if (!ids.length) return
  const { data: plans } = await sb.client.from("event_plans").select("id").in("calendar_event_id", ids)
  const planIds = (plans ?? []).map((p: { id: string }) => p.id)
  if (planIds.length) {
    await sb.client.from("event_tasks").delete().in("event_plan_id", planIds)
    await sb.client.from("event_roles").delete().in("event_plan_id", planIds)
    await sb.client.from("event_blocks").delete().in("event_plan_id", planIds)
    await sb.client.from("event_plans").delete().in("id", planIds)
  }
  // children (sub-events) cascade via parent_event_id, but delete explicitly anyway
  await sb.client.from("calendar_events").delete().in("id", ids)
}

test.describe("Season rollover (Start next season)", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  test.beforeAll(async () => {
    const sb = sandbox()
    const { data: team, error } = await sb.client
      .from("teams").select("id").eq("ministry_id", sb.ministryId).eq("name", "Student Org Board").single()
    if (error) throw error
    teamId = (team as { id: string }).id
    await cleanupRolled()
  })

  test.afterAll(async () => {
    await cleanupRolled()
  })

  async function openEvents(page: Page) {
    await page.goto(`/home?tab=plan&team=${teamId}`)
    // The sidebar + list follow the ACTIVE season now, so a season-agnostic
    // anchor is the Season dropdown itself (present whenever 2+ seasons exist).
    await expect(page.getByLabel("Season")).toBeVisible({ timeout: 20000 })
  }

  test("season dropdown renders and recurring events carry the repeat mark", async ({ page }) => {
    await openEvents(page)
    const seasonTrigger = page.getByLabel("Season")
    await expect(seasonTrigger).toBeVisible()
    await seasonTrigger.click()
    await page.getByRole("button", { name: "2025–26", exact: true }).click()
    await expect(page.getByRole("img", { name: "Recurring every year" }).first()).toBeVisible()
    expect(await page.getByRole("img", { name: "Recurring every year" }).count()).toBeGreaterThan(3)
  })

  test("New Event modal: no shelf — quick presets + free-form only", async ({ page }) => {
    await openEvents(page)
    await page.getByRole("button", { name: "New Event" }).click()
    await expect(page.getByText("Start something new")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("Run it back — past seasons")).toHaveCount(0)
    await expect(page.getByRole("button", { name: /Quick social/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Start from scratch/ })).toBeVisible()
    // Free-form path exposes the recurring toggle
    await page.getByRole("button", { name: /Start from scratch/ }).click()
    await expect(page.getByText("Recurring every year")).toBeVisible()
  })

  test("Start next season copies the recurring year forward — weekday-matched, leads reset", async ({ page }) => {
    await openEvents(page)
    await page.getByRole("button", { name: "Start next season" }).click()
    await expect(page.getByText(/Carries 12 recurring events from 2025–26/)).toBeVisible({ timeout: 10000 })
    await page.getByRole("button", { name: "Start season", exact: true }).click()
    // Wait for the confirm modal itself to close — the success signal. (The
    // button label changes while busy, so waiting on the HEADING is the only
    // reliable completion marker.)
    await expect(page.getByRole("heading", { name: "Start next season" })).toHaveCount(0, { timeout: 180000 })
    // The filter flips to the new season and the copied events render.
    await expect(page.getByLabel("Season")).toContainText("2026–27", { timeout: 30000 })
    await expect(page.getByRole("button", { name: /Coffeehouse/ }).first()).toBeVisible()

    // DB truth.
    const sb = sandbox()
    const { data: rolled } = await sb.client
      .from("calendar_events")
      .select("id, title, start_date, recurring, parent_event_id")
      .eq("ministry_id", sb.ministryId).eq("team_id", teamId)
      .in("title", FIXTURE_TITLES).gte("start_date", "2026-07-01")
    const tops = (rolled ?? []).filter((e) => !e.parent_event_id)
    const subs = (rolled ?? []).filter((e) => e.parent_event_id)
    expect(tops.length).toBe(12)
    expect(subs.length).toBe(7)
    for (const t of tops) expect(t.recurring).toBe(true)
    for (const c of subs) expect(c.recurring).toBe(false)

    // Weekday match: each new event lands on the same weekday as its source.
    const { data: src } = await sb.client
      .from("calendar_events").select("title, start_date")
      .eq("ministry_id", sb.ministryId).eq("team_id", teamId)
      .in("title", tops.map((t) => t.title)).lt("start_date", "2026-07-01").is("parent_event_id", null)
    const srcDow = new Map((src ?? []).map((e) => [e.title, new Date(e.start_date).getUTCDay()]))
    for (const t of tops) expect(new Date(t.start_date).getUTCDay()).toBe(srcDow.get(t.title))

    // Copied plan: tasks uncompleted + unassigned, roles unassigned.
    const coffee = tops.find((t) => t.title === "Coffeehouse")!
    const { data: plan } = await sb.client.from("event_plans").select("id").eq("calendar_event_id", coffee.id).single()
    const { data: tasks } = await sb.client.from("event_tasks").select("completed, assigned_to").eq("event_plan_id", (plan as { id: string }).id)
    const { data: roles } = await sb.client.from("event_roles").select("assigned_to").eq("event_plan_id", (plan as { id: string }).id)
    expect((tasks ?? []).length).toBeGreaterThanOrEqual(20)
    expect((roles ?? []).length).toBeGreaterThanOrEqual(6)
    for (const t of tasks ?? []) { expect(t.completed).toBe(false); expect(t.assigned_to).toBeNull() }
    for (const r of roles ?? []) expect(r.assigned_to).toBeNull()
  })

  test("pressing it again refuses — the new season is still ahead", async ({ page }) => {
    await openEvents(page)
    await page.getByRole("button", { name: "Start next season" }).click()
    await page.getByRole("button", { name: "Start season", exact: true }).click()
    await expect(page.getByText(/still ahead|already been started/)).toBeVisible({ timeout: 60000 })
  })
})
