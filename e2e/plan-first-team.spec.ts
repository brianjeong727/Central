// Plan's day-one landing for leader tier (design pass K11; Brian 2026-09-18, §8.5 (a)).
//
// In a ministry with NO teams, an admin opening Workspace used to be auto-entered
// into Receipts and told "No teams yet. Join or govern a team". Now they land on
// "Set up your first team": the three presets as choice rows and one plum create
// that opens the New-workspace surface. A member sees the quiet "not on a team".
//
// Runs against the LANE-2 tenant (E2E Sandbox 2 has zero teams): E2E_LANE=2.
import { test, expect } from "@playwright/test"
import { adminState, memberState, sandbox } from "./fixtures"

const SHOT = process.env.FIRST_SHOT_DIR

test.describe("plan — first-team landing", () => {
  let zeroTeams = false
  test.beforeAll(async () => {
    const sb = sandbox()
    const { count } = await sb.client.from("teams").select("id", { count: "exact", head: true }).eq("ministry_id", sb.ministryId)
    zeroTeams = (count ?? 0) === 0
  })
  test.beforeEach(() => { test.skip(!zeroTeams, "needs a tenant with zero teams (lane 2)") })

  test("admin: the landing, not Receipts; the create opens New workspace (desktop + phone)", async ({ page }) => {
    const b = page.context().browser()!
    const d = await (await b.newContext({ storageState: adminState, viewport: { width: 1440, height: 900 } })).newPage()
    await d.goto("/home?tab=plan")
    await expect(d.getByRole("heading", { name: "Set up your first team" }).filter({ visible: true })).toBeVisible({ timeout: 20_000 })
    await expect(d.getByText("Join or govern a team").filter({ visible: true })).toHaveCount(0)
    for (const n of ["Small Group Leaders", "Student Org Board", "Finance"]) {
      await expect(d.getByText(n, { exact: true }).filter({ visible: true }).first()).toBeVisible()
    }
    if (SHOT) await d.screenshot({ path: `${SHOT}/desktop.png` })
    await d.getByRole("button", { name: "Create your first team" }).filter({ visible: true }).click()
    await expect(d.getByRole("heading", { name: "New workspace" }).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 })
    await d.context().close()

    const m = await (await b.newContext({ storageState: adminState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    await m.goto("/home?tab=plan")
    await expect(m.getByRole("heading", { name: "Set up your first team" }).filter({ visible: true })).toBeVisible({ timeout: 20_000 })
    if (SHOT) await m.screenshot({ path: `${SHOT}/mobile.png`, fullPage: true })
    await m.getByRole("button", { name: "Create your first team" }).filter({ visible: true }).click()
    await expect(m.getByText("New workspace", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 })
    await m.context().close()
  })

  test("member: the volunteer 'Nothing assigned yet', no create", async ({ page }) => {
    const b = page.context().browser()!
    const d = await (await b.newContext({ storageState: memberState, viewport: { width: 1440, height: 900 } })).newPage()
    await d.goto("/home?tab=plan")
    await expect(d.getByText("Nothing assigned yet").filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
    await expect(d.getByRole("button", { name: "Create your first team" })).toHaveCount(0)
    await d.context().close()
  })
})
