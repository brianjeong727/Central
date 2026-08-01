// Click-through + DB coverage for the 3-state planning-chat button (feat/planning-chat).
//
// The event Roles & Leads header carries a 3-state icon button:
//   none   — no chat yet (ivory chip, plum icon)          → confirm → create
//   synced — chat members match the roster (sage dot)      → opens the chat
//   stale  — roster changed since creation (plum + danger) → confirm → sync
//
// This drives the SEEDED E2E-sandbox event ("Summer Retreat 2026", plan
// 4f555e33…) as a leader (E2E Admin, admin-tier → passes the requirePlanPlanner
// gate). It SEEDS two roles (assigned to E2E Admin + E2E Member) in beforeAll and
// restores exactly in afterAll. It proves membership reconciles to the roster via
// direct DB reads, and that a non-planner (E2E Member) never sees the button.
import { test, expect, type Page } from "@playwright/test"
import { adminState, memberState, sandbox } from "./fixtures"

const TEAM_ID = "63a47f06-fdc2-49e1-9703-9ee5dca1ccae"
const EVENT_ID = "7eaa840d-c666-4d69-a345-4b2fb136da91"
const EVENT_TITLE = "Summer Retreat 2026"
const SHOTS = ".claude/task-context/mobile-redesign-p1/screenshots-planning-chat"

const AL_NONE = "Create planning chat"
const AL_SYNCED = "Open planning chat"
const AL_STALE = "Roster changed — update chat"

function watchConsole(page: Page) {
  const errors: string[] = []
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`) })
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

test.describe("Planning chat 3-state button (feat/planning-chat)", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  let planId = ""
  let adminId = ""
  let memberId = ""
  let roleAdminId = ""
  let roleMemberId = ""

  async function chatMemberIds(groupId: string): Promise<string[]> {
    const sb = sandbox()
    const { data } = await sb.client.from("group_members").select("user_id").eq("group_id", groupId)
    return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id).sort()
  }
  async function planningGroupId(): Promise<string | null> {
    const sb = sandbox()
    const { data } = await sb.client.from("event_plans").select("planning_group_id").eq("id", planId).single()
    return (data as { planning_group_id: string | null }).planning_group_id
  }
  async function resetToNone() {
    const sb = sandbox()
    const gid = await planningGroupId()
    if (gid) await sb.client.from("groups").delete().eq("id", gid)
    await sb.client.from("event_plans").update({ planning_group_id: null }).eq("id", planId)
  }
  async function setMemberAssigned(assigned: boolean) {
    const sb = sandbox()
    await sb.client.from("event_roles").update({ assigned_to: assigned ? memberId : null }).eq("id", roleMemberId)
  }

  // Lane guard: the TEAM_ID/EVENT_ID above are hand-seeded LANE-1 rows. Lane 2 (slot s2,
  // port 3002) carries the tenant and two users only, so this spec must SKIP there rather
  // than fail — a normally-red suite trains everyone to ignore red, and a real regression
  // then hides in the noise. See sandbox().hasRow.
  let hasLaneFixture = false

  test.beforeEach(() => {
    test.skip(!hasLaneFixture, "lane-1 fixture only (hand-seeded team/event) — see sandbox().hasRow")
  })

  test.beforeAll(async () => {
    const sb = sandbox()
    hasLaneFixture = await sb.hasRow("teams", { id: TEAM_ID, ministry_id: sb.ministryId })
    if (!hasLaneFixture) return
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    const { data: plan } = await sb.client.from("event_plans").select("id").eq("calendar_event_id", EVENT_ID).single()
    planId = (plan as { id: string }).id
    // Clean any leftover state, then seed two assigned roles (E2E:: cleanup namespace).
    await resetToNone()
    await sb.client.from("event_roles").delete().eq("event_plan_id", planId).like("role_name", "E2E::%")
    const { data: r1 } = await sb.client.from("event_roles")
      .insert({ event_plan_id: planId, role_name: "E2E:: Worship Lead", assigned_to: adminId, created_by: adminId }).select("id").single()
    const { data: r2 } = await sb.client.from("event_roles")
      .insert({ event_plan_id: planId, role_name: "E2E:: Setup Crew", assigned_to: memberId, created_by: adminId }).select("id").single()
    roleAdminId = (r1 as { id: string }).id
    roleMemberId = (r2 as { id: string }).id
  })

  test.afterAll(async () => {
    if (!hasLaneFixture) return
    const sb = sandbox()
    await resetToNone()
    if (roleAdminId) await sb.client.from("event_roles").delete().eq("id", roleAdminId)
    if (roleMemberId) await sb.client.from("event_roles").delete().eq("id", roleMemberId)
    await sb.client.from("event_roles").delete().eq("event_plan_id", planId).like("role_name", "E2E::%")
  })

  async function openRoles(page: Page) {
    await page.goto(`/home?tab=plan&team=${TEAM_ID}`)
    const card = page.getByRole("heading", { name: EVENT_TITLE }).first()
    await expect(card).toBeVisible({ timeout: 20_000 })
    await card.click()
    const rolesTab = page.getByRole("button", { name: "Roles & Leads", exact: true })
    await expect(rolesTab).toBeVisible()
    await rolesTab.click()
    await expect.poll(() => page.url()).toContain("evtab=roles")
    // Wait out the plan's async load ("Loading…") so the Roles body + button render.
    await expect(page.getByRole("heading", { name: "Roles", exact: true })).toBeVisible({ timeout: 20_000 })
  }

  // Reach the mobile Roles section. isMobile is viewport-driven, so open on desktop
  // first (event card is a heading there) then resize to 390 — the resize lands on
  // the mobile event hub; click the Roles section row to render the shared header.
  async function openRolesMobile(page: Page) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openRoles(page)
    await page.setViewportSize({ width: 390, height: 844 })
    const hubRow = page.getByText("Roles & Leads", { exact: true }).filter({ visible: true }).first()
    await expect(hubRow).toBeVisible({ timeout: 10_000 })
    await hubRow.click()
    await expect(page.getByRole("heading", { name: "Roles", exact: true })).toBeVisible()
  }

  test("desktop: none → create → synced → stale → update, membership matches roster", async ({ page }) => {
    const errors = watchConsole(page)
    await resetToNone()
    await setMemberAssigned(true)

    await openRoles(page)

    // ── none ──
    const noneBtn = page.getByRole("button", { name: AL_NONE })
    await expect(noneBtn).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/desktop-1-none.png`, fullPage: true })

    // Confirm dialog lists You + the assignees.
    await noneBtn.click()
    await expect(page.getByText("Create planning chat?", { exact: true })).toBeVisible()
    await expect(page.getByText("You", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("E2E Member", { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/desktop-2-create-dialog.png`, fullPage: true })
    await page.getByRole("button", { name: "Create chat", exact: true }).click()

    // ── synced (create adds admin + member) ──
    await expect.poll(() => planningGroupId(), { timeout: 15_000 }).not.toBeNull()
    // The create flow opens the chat overlay; close it, then re-open roles.
    await page.keyboard.press("Escape").catch(() => {})
    await openRoles(page)
    await expect(page.getByRole("button", { name: AL_SYNCED })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/desktop-3-synced.png`, fullPage: true })

    const gid = await planningGroupId()
    expect(gid).toBeTruthy()
    expect(await chatMemberIds(gid!)).toEqual([adminId, memberId].sort())

    // ── stale (unassign the member's role → roster shrinks to {admin}) ──
    await setMemberAssigned(false)
    await openRoles(page)
    const staleBtn = page.getByRole("button", { name: AL_STALE })
    await expect(staleBtn).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/desktop-4-stale.png`, fullPage: true })

    // Update dialog spells out who is removed.
    await staleBtn.click()
    await expect(page.getByText("Update planning chat?", { exact: true })).toBeVisible()
    await expect(page.getByText("Removing", { exact: true })).toBeVisible()
    await expect(page.getByText("− E2E Member", { exact: true })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/desktop-5-update-dialog.png`, fullPage: true })
    await page.getByRole("button", { name: "Update chat", exact: true }).click()

    // ── synced again; member removed, admin (creator/caller) retained ──
    await expect(page.getByRole("button", { name: AL_SYNCED })).toBeVisible({ timeout: 15_000 })
    expect(await chatMemberIds(gid!)).toEqual([adminId])

    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })

  test("mobile: none / synced / stale states + PocketSheet confirm", async ({ page }) => {
    await resetToNone()
    await setMemberAssigned(true)

    await openRolesMobile(page)
    await expect(page.getByRole("button", { name: AL_NONE })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/mobile-1-none.png`, fullPage: true })

    // Open the PocketSheet (create) and screenshot it, then confirm.
    await page.getByRole("button", { name: AL_NONE }).click()
    await expect(page.getByText("Create planning chat?", { exact: true })).toBeVisible()
    await expect(page.getByText("Members", { exact: true })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/mobile-2-sheet-create.png`, fullPage: true })
    await page.getByRole("button", { name: "Create chat", exact: true }).click()

    await expect.poll(() => planningGroupId(), { timeout: 15_000 }).not.toBeNull()
    await page.keyboard.press("Escape").catch(() => {})
    await page.setViewportSize({ width: 1440, height: 900 })
    await openRolesMobile(page)
    await expect(page.getByRole("button", { name: AL_SYNCED })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/mobile-3-synced.png`, fullPage: true })

    // Stale + update sheet.
    await setMemberAssigned(false)
    await openRolesMobile(page)
    const staleBtn = page.getByRole("button", { name: AL_STALE })
    await expect(staleBtn).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/mobile-4-stale.png`, fullPage: true })
    await staleBtn.click()
    await expect(page.getByText("Update planning chat?", { exact: true })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/mobile-5-sheet-update.png`, fullPage: true })
  })

  // Negative UI guard: a non-planner member never sees the planning-chat button
  // (canEdit is false). The server gate (requirePlanPlanner) is proven separately.
  test.describe("member (non-planner) cannot see the button", () => {
    test.use({ storageState: memberState })
    test("no planning-chat control renders for a member", async ({ page }) => {
      await resetToNone()
      await setMemberAssigned(true)
      await page.goto(`/home?tab=plan&team=${TEAM_ID}`)
      // Best-effort: if the member can open the plan, the button must be absent.
      const card = page.getByRole("heading", { name: EVENT_TITLE }).first()
      if (await card.count()) {
        await card.click().catch(() => {})
        const rolesTab = page.getByRole("button", { name: "Roles & Leads", exact: true })
        if (await rolesTab.count()) await rolesTab.click().catch(() => {})
      }
      await expect(page.getByRole("button", { name: AL_NONE })).toHaveCount(0)
      await expect(page.getByRole("button", { name: AL_SYNCED })).toHaveCount(0)
      await expect(page.getByRole("button", { name: AL_STALE })).toHaveCount(0)
    })
  })
})
