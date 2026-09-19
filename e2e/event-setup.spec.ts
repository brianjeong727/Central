// Quick-path creation + "Set it up" (design pass R3, 2026-09-17).
//
// What this proves, as the sandbox ADMIN on the Student Org Board:
//  (a) "Quick social" asks for title, date and place — no description, no end date,
//      no countdown-ladder table in the modal — and the created plan's ladder is
//      picked from the horizon (an event three weeks out gets the SHORT ladder).
//  (b) The event's configuration lives behind ONE "Set it up" entry: switching an
//      optional module on adds its door; changing the ladder re-groups Countdown.
//      Both are staged behind Save.
//  (c) A member never sees the entry (phone hub).
import { test, expect, type Page } from "@playwright/test"
import { adminState, memberState, sandbox, E2E_PREFIX } from "./fixtures"

const TEAM_ID = "63a47f06-fdc2-49e1-9703-9ee5dca1ccae"
const TITLE = `${E2E_PREFIX}Setup quick social`
const SHOT = process.env.SETUP_SHOT_DIR

test.describe("quick create + Set it up", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })
  let hasLaneFixture = false
  test.beforeEach(() => { test.skip(!hasLaneFixture, "lane-1 fixture only") })
  test.beforeAll(async () => { hasLaneFixture = await sandbox().hasRow("teams", { id: TEAM_ID, ministry_id: sandbox().ministryId }) })
  test.afterAll(async () => {
    if (!hasLaneFixture) return
    const sb = sandbox()
    const { data: evs } = await sb.client.from("calendar_events").select("id").eq("ministry_id", sb.ministryId).like("title", `${E2E_PREFIX}Setup %`)
    for (const ev of ((evs ?? []) as { id: string }[])) {
      const { data: plans } = await sb.client.from("event_plans").select("id").eq("calendar_event_id", ev.id)
      for (const p of ((plans ?? []) as { id: string }[])) {
        await sb.client.from("event_confirmations").delete().eq("event_plan_id", p.id)
        await sb.client.from("event_tasks").delete().eq("event_plan_id", p.id)
        await sb.client.from("event_roles").delete().eq("event_plan_id", p.id)
        await sb.client.from("event_plans").delete().eq("id", p.id)
      }
      await sb.client.from("calendar_events").delete().eq("id", ev.id)
    }
  })

  const vis = (page: Page, sel: string) => page.locator(sel).filter({ visible: true })

  test("quick social is title + date + place; the ladder follows the horizon; Set it up owns the rest", async ({ page }) => {
    await page.goto(`/home?tab=plan&team=${TEAM_ID}`)
    const newEvent = page.getByRole("button", { name: "New Event", exact: true }).filter({ visible: true }).first()
    await expect(newEvent).toBeVisible({ timeout: 20_000 })
    await newEvent.click()
    await page.getByRole("button", { name: /^Quick social\b/ }).filter({ visible: true }).first().click()

    // (a) The quick form: one text input (title) + one (location), one date, two
    // times, the all-day box. No textarea, no second date, no ladder table.
    await expect(vis(page, "textarea")).toHaveCount(0)
    await expect(vis(page, "input[type=date]")).toHaveCount(1)
    await expect(page.getByText(/T−4 WEEKS|Long planning|Short planning/).filter({ visible: true })).toHaveCount(0)
    if (SHOT) await page.screenshot({ path: `${SHOT}/quick-create.png` })

    const titleInput = vis(page, "input:not([type=date]):not([type=time]):not([type=checkbox])").first()
    await titleInput.fill(TITLE)
    // Three weeks out → the SHORT ladder.
    const d = new Date(Date.now() + 20 * 86_400_000)
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    await vis(page, "input[type=date]").first().fill(ymd)
    await page.getByRole("button", { name: "Create event", exact: true }).click()
    await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible({ timeout: 20_000 })

    const sb = sandbox()
    const { data: ev } = await sb.client.from("calendar_events").select("id, start_day, end_day, end_date, start_date").eq("ministry_id", sb.ministryId).eq("title", TITLE).single()
    const { data: plan } = await sb.client.from("event_plans").select("id, countdown_phases, type_data").eq("calendar_event_id", (ev as { id: string }).id).single()
    const phases = (plan as { countdown_phases: { key: string }[] }).countdown_phases
    expect(phases.map((p) => p.key)).toEqual(["t1w", "t3d", "t1d", "after"])
    // Single-day: the end lands on the same calendar day as the start.
    expect(new Date((ev as { end_date: string }).end_date).toDateString()).toBe(new Date((ev as { start_date: string }).start_date).toDateString())

    // (b) Set it up — Overview carries the one entry; the hub carries no Acts door yet.
    await expect(page.getByRole("button", { name: "Acts", exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: /^Set it up\b/ }).filter({ visible: true }).first().click()
    await expect(page.getByText("Optional modules").filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText("Planning schedule").filter({ visible: true }).first()).toBeVisible()
    const save = page.getByRole("button", { name: "Save changes", exact: true }).filter({ visible: true }).first()
    await expect(save).toBeDisabled()
    await page.getByRole("switch", { name: "Performances" }).filter({ visible: true }).click()
    await page.getByRole("radio", { name: "Long planning" }).filter({ visible: true }).first().click()
    await expect(save).toBeEnabled()
    if (SHOT) await page.screenshot({ path: `${SHOT}/setup-desktop.png` })
    await save.click()

    // The Acts door appears, the ladder is now the long one, and the DB agrees.
    await expect(page.getByRole("button", { name: "Acts", exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(save).toHaveCount(0)
    await page.getByRole("button", { name: "Countdown", exact: true }).click()
    // "T−2 DAYS" exists only on the long ladder (short counts T−3 DAYS / T−1 DAY);
    // the T−4 WEEKS window is already past for a 20-day-out event, so it's folded.
    await expect(page.getByText(/T−2 DAYS/).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 })
    const { data: plan2 } = await sb.client.from("event_plans").select("countdown_phases, type_data").eq("id", (plan as { id: string }).id).single()
    expect((plan2 as { countdown_phases: { key: string }[] }).countdown_phases.map((p) => p.key)[0]).toBe("t4w")
    expect(((plan2 as { type_data: { extras?: string[] } }).type_data.extras ?? [])).toContain("acts")
  })

  test("phone: the admin hub carries the Set-up row and it opens the sheet", async ({ page }) => {
    const b = page.context().browser()!
    const admin = await (await b.newContext({ storageState: adminState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    await admin.goto(`/home?tab=plan&team=${TEAM_ID}`)
    await admin.getByText("Events", { exact: true }).filter({ visible: true }).first().click()
    await admin.getByText("Fall Coffeehouse", { exact: true }).filter({ visible: true }).first().click()
    const row = admin.getByText("Set it up", { exact: true }).filter({ visible: true }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()
    await expect(admin.getByText("Optional modules").filter({ visible: true }).first()).toBeVisible()
    if (SHOT) await admin.screenshot({ path: `${SHOT}/setup-mobile.png` })
    await admin.context().close()
  })
})
