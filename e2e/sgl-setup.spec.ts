// Small Group Leaders — the president's set-up sits behind one row (design pass R3,
// SGL pass 2026-09-18). As the sandbox ADMIN (president of Small Group Leaders):
//  (a) Phone hub: a SET-UP group with "Rotation & availability" and "Roster".
//  (b) Schedule opens on the doing plane — the team-availability summary and the
//      Rotation Assigner are hidden until "Set it up" is tapped; from the hub's
//      Set-up row they arrive already open.
//  (c) Desktop Schedule carries the same disclosure as an ActionCard.
import { test, expect } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

const SHOT = process.env.SGL_SHOT_DIR
let teamId = ""

test.describe("SGL set-up", () => {
  test.beforeAll(async () => {
    const sb = sandbox()
    const { data } = await sb.client.from("teams").select("id").eq("ministry_id", sb.ministryId).eq("name", "Small Group Leaders").maybeSingle()
    teamId = (data as { id: string } | null)?.id ?? ""
  })
  test.beforeEach(() => { test.skip(!teamId, "lane-1 fixture only") })

  test("phone: Set-up group on the hub; Schedule hides the assigner until Set it up", async ({ page }) => {
    const p = await (await page.context().browser()!.newContext({ storageState: adminState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    await p.goto(`/home?tab=plan&team=${teamId}`)
    await expect(p.getByText("Rotation & availability", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
    await expect(p.getByText(/^set-up$/i).filter({ visible: true }).first()).toBeVisible()
    if (SHOT) await p.screenshot({ path: `${SHOT}/hub.png`, fullPage: true })

    // Plain Schedule: no assigner, a Set it up row.
    await p.getByText("Schedule", { exact: true }).filter({ visible: true }).first().click()
    await expect(p.getByText("Mark when you", { exact: false }).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 })
    await expect(p.getByText("Rotation Assigner", { exact: true }).filter({ visible: true })).toHaveCount(0)
    const row = p.getByText("Set it up", { exact: true }).filter({ visible: true }).first()
    await expect(row).toBeVisible()
    if (SHOT) await p.screenshot({ path: `${SHOT}/schedule-closed.png`, fullPage: true })
    await row.click()
    await expect(p.getByText("Rotation Assigner", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 })
    if (SHOT) await p.screenshot({ path: `${SHOT}/schedule-open.png`, fullPage: true })

    // From the hub's Set-up row it opens already expanded.
    await p.goto(`/home?tab=plan&team=${teamId}`)
    await p.getByText("Rotation & availability", { exact: true }).filter({ visible: true }).first().click()
    await expect(p.getByText("Rotation Assigner", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 })
    await p.context().close()
  })

  test("desktop: the disclosure on Schedule", async ({ page }) => {
    const d = await (await page.context().browser()!.newContext({ storageState: adminState, viewport: { width: 1440, height: 900 } })).newPage()
    await d.goto(`/home?tab=plan&team=${teamId}`)
    await d.getByRole("button", { name: "Schedule", exact: true }).filter({ visible: true }).first().click()
    await expect(d.getByText("Rotation Assigner", { exact: true }).filter({ visible: true })).toHaveCount(0)
    const card = d.getByRole("button", { name: /^Set it up\b/ }).filter({ visible: true }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    await card.click()
    await expect(d.getByText("Rotation Assigner", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 })
    if (SHOT) await d.screenshot({ path: `${SHOT}/desktop-open.png` })
    await d.context().close()
  })
})
