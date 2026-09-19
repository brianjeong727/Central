// The team workspace hub has a Set-up group (design pass R3, phase 3, 2026-09-17).
//  (a) Phone: the Student Org Board hub ends in a SET-UP group carrying Team
//      settings and Season; the Events screen no longer carries the "Start next
//      season" pill beside New Event.
//  (b) Desktop: the Events content header has a ghost "Set it up" menu to the
//      LEFT of New Event that offers Team settings and Start next season, and the
//      old rollover pill is gone.
//  (c) Phone: the Finance hub lists Allocation under SET-UP, not Sections.
import { test, expect } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

const TEAM_ID = "63a47f06-fdc2-49e1-9703-9ee5dca1ccae"
const SHOT = process.env.HUB_SHOT_DIR

test.describe("workspace Set-up", () => {
  test.use({ storageState: adminState })
  let ok = false
  test.beforeAll(async () => { ok = await sandbox().hasRow("teams", { id: TEAM_ID, ministry_id: sandbox().ministryId }) })
  test.beforeEach(() => { test.skip(!ok, "lane-1 fixture only") })

  test("phone hub: SET-UP group with Team settings + Season; Events has no rollover pill", async ({ page }) => {
    const p = await (await page.context().browser()!.newContext({ storageState: adminState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    await p.goto(`/home?tab=plan&team=${TEAM_ID}`)
    await expect(p.getByText("Team settings", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
    await expect(p.getByText("Season", { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await expect(p.getByText(/^set-up$/i).filter({ visible: true }).first()).toBeVisible()
    if (SHOT) await p.screenshot({ path: `${SHOT}/board-hub-mobile.png`, fullPage: true })
    await p.getByText("Season", { exact: true }).filter({ visible: true }).first().click()
    await expect(p.getByRole("heading", { name: "Start next season" }).or(p.getByText("Start next season", { exact: true })).filter({ visible: true }).first()).toBeVisible()
    // A fresh load rather than dismissing the confirm: the veil under a
    // CentralModal swallows synthetic taps in this emulated context.
    await p.goto(`/home?tab=plan&team=${TEAM_ID}`)
    await p.getByText("Events", { exact: true }).filter({ visible: true }).first().click()
    await expect(p.getByRole("button", { name: "New event", exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 })
    await expect(p.getByText("Start next season").filter({ visible: true })).toHaveCount(0)
    await p.context().close()
  })

  test("desktop: Set it up menu beside New Event, no rollover pill", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/home?tab=plan&team=${TEAM_ID}`)
    const newEvent = page.getByRole("button", { name: "New Event", exact: true }).filter({ visible: true }).first()
    await expect(newEvent).toBeVisible({ timeout: 20_000 })
    const setup = page.getByRole("button", { name: "Set it up", exact: true }).filter({ visible: true }).first()
    await expect(setup).toBeVisible()
    expect((await setup.boundingBox())!.x).toBeLessThan((await newEvent.boundingBox())!.x)
    await expect(page.getByText("Start next season").filter({ visible: true })).toHaveCount(0)
    await setup.click()
    await expect(page.getByRole("menuitem", { name: /Start next season/ }).or(page.getByText(/Start next season/)).filter({ visible: true }).first()).toBeVisible()
    if (SHOT) await page.screenshot({ path: `${SHOT}/board-desktop-menu.png` })
    await page.keyboard.press("Escape")
  })

  test("phone finance hub: Allocation under SET-UP", async ({ page }) => {
    const sb = sandbox()
    const { data: fin } = await sb.client.from("teams").select("id").eq("ministry_id", sb.ministryId).eq("team_type", "finance").limit(1).maybeSingle()
    test.skip(!fin, "no finance team in this tenant")
    const p = await (await page.context().browser()!.newContext({ storageState: adminState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    await p.goto(`/home?tab=plan&team=${(fin as { id: string }).id}`)
    const alloc = p.getByText("Allocation", { exact: true }).filter({ visible: true }).first()
    await expect(alloc).toBeVisible({ timeout: 20_000 })
    const setup = p.getByText(/^set-up$/i).filter({ visible: true }).first()
    await expect(setup).toBeVisible()
    expect((await setup.boundingBox())!.y).toBeLessThan((await alloc.boundingBox())!.y)
    await p.context().close()
  })
})
