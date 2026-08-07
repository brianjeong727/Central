// The Workspace tab for a member with NO planning team — the majority of a
// congregation. Covers all three branches: the "nothing assigned yet" state, the
// staffed-event scope once a leader assigns them, and the unchanged team
// workspace for someone who does have a team.
//
// ⚠️ THIS SPEC MUTATES SHARED FIXTURES. The sandbox has exactly two users and BOTH
// are on teams, so the only way to reach the team-less code path is to detach the
// member for the duration and put the rows back. It also parks their pre-existing
// task assignments (other specs leave some behind) so "unassigned" is really
// unassigned. Both are restored FIRST in afterAll — before any other teardown —
// because every other spec in the suite assumes the member is on a team. Playwright
// runs afterAll even when a test fails; the one unhandled case is the process being
// hard-killed mid-run, which would leave the member team-less until the next run of
// this file. If that ever bites, re-add them via Workspace → team settings.
import { test, expect, type Page } from "@playwright/test"
import { adminState, memberState, sandbox, E2E_PREFIX } from "./fixtures"

const SHOT = process.env.PANE_SHOT_DIR
const TEAM_NAME = `${E2E_PREFIX}Vol Board`
const EVENT = `${E2E_PREFIX}Vol Coffeehouse`

let teamId = ""
let eventId = ""
let planId = ""
let memberId = ""
const taskIds: string[] = []
// The sandbox has exactly two users and BOTH are on teams, so the only way to
// exercise the team-less path is to detach the member for the run and put the
// rows back verbatim afterwards. Captured whole so the restore is byte-exact.
let savedMemberships: Record<string, unknown>[] = []
// Pre-existing task assignments belonging to the member, parked for the run.
let parkedTaskIds: string[] = []

async function shot(page: Page, n: string) {
  if (SHOT) await page.screenshot({ path: `${SHOT}/${n}.png`, fullPage: true })
}

test.describe("volunteer workspace", () => {
  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()

    const { data: team, error } = await sb.client
      .from("teams").insert({ ministry_id: sb.ministryId, name: TEAM_NAME, description: "e2e", team_type: "standard", created_by: adminId })
      .select().single()
    if (error) throw error
    teamId = team.id
    const { data: role } = await sb.client
      .from("team_roles").insert({ team_id: teamId, name: "President", permissions: ["can_plan_events"], is_president: true })
      .select().single()
    // ONLY the admin joins the team — the member stays team-less on purpose.
    await sb.client.from("team_members").insert({ team_id: teamId, user_id: adminId, role_id: role!.id, added_by: adminId })

    const start = new Date(Date.now() + 21 * 864e5)
    start.setUTCHours(21, 0, 0, 0)
    const { data: ev, error: ee } = await sb.client.from("calendar_events").insert({
      ministry_id: sb.ministryId, team_id: teamId, title: EVENT,
      description: "Fall talent show.", location: "Rangos Hall, CMU",
      start_date: start.toISOString(), end_date: new Date(start.getTime() + 2 * 36e5).toISOString(),
      category: "social", created_by: adminId,
    }).select().single()
    if (ee) throw ee
    eventId = ev.id
    const { data: plan, error: pe } = await sb.client.from("event_plans")
      .insert({ ministry_id: sb.ministryId, calendar_event_id: eventId, created_by: adminId })
      .select().single()
    if (pe) throw pe
    planId = plan.id

    // A run of show + another staffed person, so "Run of show" and "Who else" fill.
    await sb.client.from("event_blocks").insert([
      { ministry_id: sb.ministryId, event_plan_id: planId, day_index: 0, time_label: "1:30 PM", title: "Doors / setup", sort_order: 0, status: "pending", created_by: adminId },
      { ministry_id: sb.ministryId, event_plan_id: planId, day_index: 0, time_label: "2:00 PM", title: "Act practices", sort_order: 1, status: "pending", created_by: adminId },
    ])
    await sb.client.from("event_roles").insert({
      event_plan_id: planId, role_name: "President", notes: "Owns the pipeline.", created_by: adminId, assigned_to: adminId,
    })

    // Detach the member from every team so hasRealWorkspace is false for them.
    const { data: mems } = await sb.client.from("team_members").select("*").eq("user_id", memberId)
    savedMemberships = (mems ?? []) as Record<string, unknown>[]
    if (savedMemberships.length) await sb.client.from("team_members").delete().eq("user_id", memberId)

    // …and park their PRE-EXISTING task assignments (other specs' fixtures leave
    // some behind), so the unassigned case is genuinely unassigned. Re-pointed,
    // not deleted — restored verbatim in afterAll.
    const { data: pre } = await sb.client.from("event_tasks").select("id").eq("assigned_to", memberId)
    parkedTaskIds = ((pre ?? []) as { id: string }[]).map(t => t.id)
    if (parkedTaskIds.length) await sb.client.from("event_tasks").update({ assigned_to: null }).in("id", parkedTaskIds)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    // Put the member's team rows back FIRST — every other spec in the suite
    // assumes they are on a team, so this must happen even if the rest fails.
    if (savedMemberships.length) {
      await sb.client.from("team_members").upsert(savedMemberships, { onConflict: "id" })
      savedMemberships = []
    }
    if (parkedTaskIds.length) {
      await sb.client.from("event_tasks").update({ assigned_to: memberId }).in("id", parkedTaskIds)
      parkedTaskIds = []
    }
    if (planId) {
      await sb.client.from("event_tasks").delete().eq("event_plan_id", planId)
      await sb.client.from("event_roles").delete().eq("event_plan_id", planId)
      await sb.client.from("event_blocks").delete().eq("event_plan_id", planId)
      await sb.client.from("event_plans").delete().eq("id", planId)
    }
    if (eventId) await sb.client.from("calendar_events").delete().eq("id", eventId)
    if (teamId) {
      await sb.client.from("team_members").delete().eq("team_id", teamId)
      await sb.client.from("team_roles").delete().eq("team_id", teamId)
      await sb.client.from("teams").delete().eq("id", teamId)
    }
  })

  test.describe("unassigned member", () => {
    test.use({ storageState: memberState, viewport: { width: 390, height: 844 } })

    test("Workspace tab exists and explains itself", async ({ page }) => {
      test.setTimeout(120_000)
      await page.goto("/home?tab=plan")
      await page.waitForTimeout(3000)
      await shot(page, "V1-empty")
      await expect(page.getByText("Nothing assigned yet").filter({ visible: true }).first()).toBeVisible()
      await expect(page.getByText(/When a leader puts you on an event/).filter({ visible: true }).first()).toBeVisible()
    })
  })

  test.describe("assigned volunteer", () => {
    test.use({ storageState: memberState, viewport: { width: 390, height: 844 } })

    test.beforeAll(async () => {
      const sb = sandbox()
      const adminId = await sb.adminUserId()
      const { error: re } = await sb.client.from("event_roles").insert({
        event_plan_id: planId, role_name: "Sound Lead",
        notes: "Church PA + Ideate loans (5× SM-58, 3× DI boxes). Runs line check.",
        created_by: adminId, assigned_to: memberId,
      })
      if (re) throw re
      const { data: ts } = await sb.client.from("event_tasks").insert([
        { event_plan_id: planId, title: `${E2E_PREFIX}Line check before act practices`, phase: "pre_event", sort_order: 0, completed: false, created_by: adminId, assigned_to: memberId, due_date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) },
        { event_plan_id: planId, title: `${E2E_PREFIX}Collect DI boxes`, phase: "pre_event", sort_order: 1, completed: false, created_by: adminId, assigned_to: memberId },
      ]).select("id")
      for (const t of (ts ?? [])) taskIds.push(t.id)
    })

    test("sees the event, their role, tasks, run of show and who else", async ({ page }) => {
      test.setTimeout(120_000)
      await page.goto("/home?tab=plan")
      await page.waitForTimeout(3000)
      await shot(page, "V2-list")
      const row = page.getByText(EVENT, { exact: true }).filter({ visible: true }).first()
      await expect(row).toBeVisible({ timeout: 20_000 })
      await row.click()
      await page.waitForTimeout(2000)
      await shot(page, "V3-detail")

      await expect(page.getByText("Sound Lead").filter({ visible: true }).first()).toBeVisible()
      await expect(page.getByText(/Church PA \+ Ideate loans/).filter({ visible: true }).first()).toBeVisible()
      await expect(page.getByText(/Line check before act practices/).filter({ visible: true }).first()).toBeVisible()
      await expect(page.getByText("Doors / setup").filter({ visible: true }).first()).toBeVisible()
      await expect(page.getByText("Who else").filter({ visible: true }).first()).toBeVisible()

      // The one write: tick a task.
      const box = page.getByLabel("Mark complete").filter({ visible: true }).first()
      await box.click()
      await page.waitForTimeout(2500)
      const sb = sandbox()
      const { data } = await sb.client.from("event_tasks").select("completed").eq("id", taskIds[0]).single()
      expect((data as { completed: boolean }).completed, "ticking must persist").toBe(true)
    })
  })

  test.describe("admin unaffected", () => {
    test.use({ storageState: adminState, viewport: { width: 390, height: 844 } })

    test("a teamed user still gets the real workspace", async ({ page }) => {
      test.setTimeout(120_000)
      await page.goto("/home?tab=plan")
      await page.waitForTimeout(3000)
      await shot(page, "V4-admin")
      await expect(page.getByText("Nothing assigned yet").filter({ visible: true })).toHaveCount(0)
    })
  })
})
