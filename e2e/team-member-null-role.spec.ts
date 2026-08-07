// Regression guard: a ROLELESS team member (`team_members.role_id IS NULL`).
//
// The column has no NOT NULL constraint and roleless rows exist in production —
// a member added before the team had roles, or one whose role was later deleted
// (deleting a `team_roles` row leaves the membership behind). The local type
// declared `role_id: string` anyway, so the team-settings dropdown was rendered
// as `<select value={null}>`. React silently downgrades that to UNCONTROLLED,
// which displays the FIRST option — so a member with no role was shown to
// managers as holding whichever role happened to sort first, and the only outward
// symptom was a console warning.
//
// Both viewports carry their own copy of the row (the desktop table and the
// mobile settings list are separate JSX), so both are asserted here.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

const TEAM_NAME = `${E2E_PREFIX}Null Role Board`
// Named so the failure mode is unmistakable: under the bug the roleless member
// rendered as holding FIRST_ROLE purely because it sorts first.
const FIRST_ROLE = "Aardvark Lead"
const SECOND_ROLE = "President"

let teamId = ""

test.describe("roleless team member (team_members.role_id IS NULL)", () => {
  test.use({ storageState: adminState })

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const memberId = await sb.memberUserId()

    const { data: team, error } = await sb.client
      .from("teams")
      .insert({ ministry_id: sb.ministryId, name: TEAM_NAME, description: "e2e", team_type: "standard", created_by: adminId })
      .select().single()
    if (error) throw error
    teamId = team.id

    const { error: e1 } = await sb.client
      .from("team_roles").insert({ team_id: teamId, name: FIRST_ROLE, permissions: [], is_president: false })
    if (e1) throw e1
    const { data: pres, error: e2 } = await sb.client
      .from("team_roles").insert({ team_id: teamId, name: SECOND_ROLE, permissions: ["can_plan_events"], is_president: true })
      .select().single()
    if (e2) throw e2

    // Admin holds a real role (so the settings view is reachable and the role
    // dropdown renders at all — it is gated on roles.length > 1); the member is
    // the roleless row under test.
    const { error: e3 } = await sb.client.from("team_members").insert([
      { team_id: teamId, user_id: adminId, role_id: pres.id, added_by: adminId },
      { team_id: teamId, user_id: memberId, role_id: null, added_by: adminId },
    ])
    if (e3) throw e3
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (teamId) {
      await sb.client.from("team_members").delete().eq("team_id", teamId)
      await sb.client.from("team_roles").delete().eq("team_id", teamId)
      await sb.client.from("teams").delete().eq("id", teamId)
    }
  })

  async function openSettings(page: Page) {
    const errors: string[] = []
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()) })
    page.on("pageerror", e => errors.push(e.message))
    await page.goto(`/home?tab=plan&team=${teamId}`)
    const gear = page.getByTitle("Team settings").filter({ visible: true }).first()
    await gear.waitFor({ state: "visible", timeout: 30_000 })
    await gear.click()
    await page.getByText("Members", { exact: true }).filter({ visible: true }).first()
      .waitFor({ state: "visible", timeout: 20_000 })
    await page.waitForTimeout(1200)
    return errors
  }

  // Both trees are co-mounted (Tailwind hides one via CSS rather than unmounting),
  // so narrow to the visible one — see e2e/mobile-plan-workspace.spec.ts.
  function rolelessSelect(page: Page) {
    return page.locator("select")
      .filter({ has: page.locator(`option[value=""]`) })
      .filter({ visible: true })
      .first()
  }

  function assertNoNullWarning(errors: string[]) {
    const nullWarn = errors.filter(e => /value.*should not be null/i.test(e))
    expect(nullWarn, `null-value warnings:\n${nullWarn.join("\n")}`).toEqual([])
  }

  test("desktop: reads 'No role', never the first role", async ({ page }) => {
    const errors = await openSettings(page)
    const sel = rolelessSelect(page)
    await expect(sel).toBeVisible()
    await expect(sel).toHaveValue("")
    const shown = (await sel.locator("option:checked").textContent())?.trim()
    expect(shown).toBe("No role")
    expect(shown).not.toBe(FIRST_ROLE)
    assertNoNullWarning(errors)
  })

  test("mobile: reads 'No role', never the first role", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const errors = await openSettings(page)
    const sel = rolelessSelect(page)
    await expect(sel).toBeVisible()
    await expect(sel).toHaveValue("")
    const shown = (await sel.locator("option:checked").textContent())?.trim()
    expect(shown).toBe("No role")
    expect(shown).not.toBe(FIRST_ROLE)
    assertNoNullWarning(errors)
  })
})
