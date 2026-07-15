// AFTER-screenshot capture for the §2.2b "full-bleed subpages consume the screen"
// rework. Seeds the minimum sandbox data to reach each full-bleed subpage on
// mobile and screenshots it, so Brian can confirm the parent chrome row no longer
// stacks above the subpage's own header. Not a regression assertion suite — it
// captures evidence (guarded on FULLBLEED_SHOT_DIR; skips entirely if unset).
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

const MOBILE = { viewport: { width: 390, height: 844 } } as const
const SHOT_DIR = process.env.FULLBLEED_SHOT_DIR

function vis(page: Page, text: string, exact = true) {
  return page.getByText(text, { exact }).filter({ visible: true })
}
async function shot(page: Page, name: string) {
  if (!SHOT_DIR) return
  await page.screenshot({ path: `${SHOT_DIR}/fullbleed-${name}.png`, fullPage: false })
}

test.describe("mobile §2.2b full-bleed subpage screenshots", () => {
  test.use({ storageState: adminState, ...MOBILE })

  let financeTeamId = ""
  let formId = ""
  let annId = ""
  const FIN_NAME = `${E2E_PREFIX}Fullbleed Finance`
  const FORM_TITLE = `${E2E_PREFIX}Fullbleed Survey`

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()

    // Finance team (admin = treasurer/president) + one pending receipt so the
    // Reimbursements inbox has a row to open into the detail subpage.
    const { data: team, error } = await sb.client
      .from("teams")
      .insert({ ministry_id: sb.ministryId, name: FIN_NAME, description: "e2e", team_type: "finance", created_by: adminId })
      .select().single()
    if (error) throw error
    financeTeamId = team.id
    const { data: role, error: re } = await sb.client
      .from("team_roles")
      .insert({ team_id: financeTeamId, name: "Treasurer", permissions: ["can_view_finances"], is_president: true })
      .select().single()
    if (re) throw re
    await sb.client.from("team_members").insert({ team_id: financeTeamId, user_id: adminId, role_id: role.id, added_by: adminId })
    await sb.client.from("receipts").insert({
      ministry_id: sb.ministryId, team_id: financeTeamId, submitted_by: adminId,
      submitted_by_name: "E2E Admin", event_name: `${E2E_PREFIX}Retreat snacks`,
      category: "Supplies", fund: "general", amount: 42.5,
      purchase_date: new Date().toISOString().slice(0, 10), status: "pending",
    })

    // A form with one field + one response so the Responses subpage renders.
    // form_responses.announcement_id is NOT NULL, so link the form to a real
    // announcement and stamp the response with it.
    const ann = await sb.createAnnouncement({ title: "Fullbleed Form Host", body: "e2e" })
    annId = ann.id
    const { data: form, error: fe } = await sb.client
      .from("announcement_forms")
      .insert({ ministry_id: sb.ministryId, title: FORM_TITLE, announcement_id: annId, created_by: adminId })
      .select("id").single()
    if (fe) throw fe
    formId = form.id
    const { data: field } = await sb.client
      .from("form_fields")
      .insert({ form_id: formId, label: "How was it?", type: "text", options: [], required: false, order_index: 0 })
      .select("id").single()
    const { data: resp, error: rpe } = await sb.client
      .from("form_responses")
      .insert({ form_id: formId, announcement_id: annId, ministry_id: sb.ministryId, user_id: adminId })
      .select("id").single()
    if (rpe) throw rpe
    if (field && resp) {
      await sb.client.from("form_answers").insert({ response_id: resp.id, field_id: field.id, value: "It was great", values: [] })
    }
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (financeTeamId) {
      await sb.client.from("receipts").delete().eq("team_id", financeTeamId)
      await sb.client.from("team_members").delete().eq("team_id", financeTeamId)
      await sb.client.from("team_roles").delete().eq("team_id", financeTeamId)
      await sb.client.from("teams").delete().eq("id", financeTeamId)
    }
    if (formId) {
      const { data: resps } = await sb.client.from("form_responses").select("id").eq("form_id", formId)
      for (const r of resps ?? []) await sb.client.from("form_answers").delete().eq("response_id", r.id)
      await sb.client.from("form_responses").delete().eq("form_id", formId)
      await sb.client.from("form_fields").delete().eq("form_id", formId)
      await sb.client.from("announcement_forms").delete().eq("id", formId)
    }
    if (annId) await sb.client.from("announcements").delete().eq("id", annId)
  })

  test("team settings from picker gear (no Workspace chrome above)", async ({ page }) => {
    await page.goto(`/home?tab=plan&team=${financeTeamId}`)
    // Finance hub renders; open team settings via the hub gear.
    await expect(vis(page, "Reimbursements").first()).toBeVisible({ timeout: 15000 })
    const gear = page.getByTitle("Team settings").filter({ visible: true }).first()
    await gear.click()
    await expect(vis(page, "Settings").first()).toBeVisible({ timeout: 10000 })
    // The generic "Workspace" chrome title must NOT remain above the subpage.
    await expect(page.getByText("Workspace", { exact: true }).filter({ visible: true })).toHaveCount(0)
    await shot(page, "team-settings")
  })

  test("drilled church-settings section (only its own back row above)", async ({ page }) => {
    await page.goto("/home?tab=settings")
    await expect(vis(page, "Church Settings").first()).toBeVisible({ timeout: 15000 })
    // Drill the "People" hub row.
    await vis(page, "People").first().click()
    const back = page.getByRole("button", { name: "Settings" }).filter({ visible: true }).first()
    await expect(back).toBeVisible({ timeout: 10000 })
    // The hub title "Church Settings" is suppressed while drilled.
    await expect(page.getByRole("heading", { name: "Church Settings" }).filter({ visible: true })).toHaveCount(0)
    await shot(page, "church-settings-section")
  })

  test("finance reimbursement detail (single SubpageShell back)", async ({ page }) => {
    await page.goto(`/home?tab=plan&team=${financeTeamId}`)
    // Hub -> Reimbursements section -> the seeded receipt row -> detail subpage.
    await vis(page, "Reimbursements").first().click()
    const row = vis(page, "$42.50", false).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()
    await expect(page.getByRole("button", { name: "Reimbursements" }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
    await shot(page, "finance-detail")
  })

  test("forms responses subpage (own header, no Forms chrome above)", async ({ page }) => {
    await page.goto("/home?tab=forms")
    await expect(vis(page, FORM_TITLE, false).first()).toBeVisible({ timeout: 15000 })
    // Open the responses view for the seeded form.
    await vis(page, "View responses", false).first().click()
    await expect(vis(page, "Responses", false).first()).toBeVisible({ timeout: 10000 })
    await shot(page, "forms-responses")
  })
})
