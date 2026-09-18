// The event workspace has a member tier (design pass B2 §3.8 / decision 6a,
// 2026-09-17). As the sandbox MEMBER on an event where they hold tasks and roles:
//  (a) Countdown opens on "Yours" — only their own tasks — with a Yours | All
//      switch; All shows the whole plan (strictly more rows).
//  (b) Roles opens on "Yours" the same way, and the hub/phone copy says "You're on".
//  (c) Overview carries NO money card for a member (it used to render a redacted
//      "Treasurer only" card).
// A leader (the admin) never sees the switch — they always see the whole plan.
import { test, expect, type Page } from "@playwright/test"
import { adminState, memberState, sandbox } from "./fixtures"

// E2E Sandbox (lane 1) fixture: "Fall Coffeehouse" on the Student Org Board —
// the member holds 8 of 26 tasks and 2 of 7 roles. Lane 2 has no such fixture,
// so the spec is lane-1 only.
const TEAM_ID = "63a47f06-fdc2-49e1-9703-9ee5dca1ccae"
const EVENT = "Fall Coffeehouse"
const SHOT = process.env.EVENT_SHOT_DIR

async function openEvent(page: Page) {
  await page.goto(`/home?tab=plan&team=${TEAM_ID}`)
  const card = page.getByText(EVENT, { exact: true }).filter({ visible: true }).first()
  await expect(card).toBeVisible({ timeout: 20_000 })
  await card.click()
  await expect(page.getByRole("button", { name: "Overview", exact: true })).toBeVisible()
}
// The Countdown rule reports the SCOPED list: "n of m remaining".
const remaining = (page: Page) => page.getByText(/^\d+ of \d+ remaining$/).filter({ visible: true }).first()
const totalOf = async (page: Page) => Number((await remaining(page).textContent())!.match(/of (\d+) remaining/)![1])

// The sandbox member's team role ("Event Coordinator") carries can_plan_events,
// which makes them a planner, not a member, on this event. For the run they hold
// a temporary role WITHOUT it, restored in afterAll.
let originalRoleId: string | null = null
let tempRoleId: string | null = null
let memberId = ""

test.describe("event member tier", () => {
  test.skip(process.env.E2E_LANE === "2" || process.env.E2E_PORT === "3002", "lane-1 fixture only")

  test.beforeAll(async () => {
    const sb = sandbox()
    memberId = await sb.memberUserId()
    const { data: tm } = await sb.client.from("team_members").select("role_id").eq("team_id", TEAM_ID).eq("user_id", memberId).single()
    originalRoleId = tm?.role_id ?? null
    const { data: role, error } = await sb.client.from("team_roles").insert({ team_id: TEAM_ID, name: "E2E::Volunteer", permissions: ["can_track_attendance"], is_president: false }).select("id").single()
    if (error) throw error
    tempRoleId = role.id
    await sb.client.from("team_members").update({ role_id: tempRoleId }).eq("team_id", TEAM_ID).eq("user_id", memberId)
  })
  test.afterAll(async () => {
    const sb = sandbox()
    await sb.client.from("team_members").update({ role_id: originalRoleId }).eq("team_id", TEAM_ID).eq("user_id", memberId)
    if (tempRoleId) await sb.client.from("team_roles").delete().eq("id", tempRoleId)
  })

  test("member: Yours by default on Countdown and Roles, no money card", async ({ page }) => {
    const ctx = await page.context().browser()!.newContext({ storageState: memberState, viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()
    await openEvent(p)

    // (c) Overview: no money card for a member.
    await expect(p.getByText("Treasurer only").filter({ visible: true })).toHaveCount(0)

    // (a) Countdown lands on Yours.
    await p.getByRole("button", { name: "Countdown", exact: true }).click()
    const show = p.getByRole("radiogroup", { name: "Show" }).filter({ visible: true })
    await expect(show).toBeVisible({ timeout: 10_000 })
    await expect(show.getByRole("radio", { name: "Yours" })).toHaveAttribute("aria-checked", "true")
    await expect(remaining(p)).toBeVisible({ timeout: 10_000 })
    const yours = await totalOf(p)
    // Chase machinery is the planner's: no auto-DM chips, no reminder schedule.
    await expect(p.getByText(/Auto-DM|Confirm-taps|Nudged|Reminder schedule/).filter({ visible: true })).toHaveCount(0)
    if (SHOT) await p.screenshot({ path: `${SHOT}/desktop-countdown-yours.png` })
    await show.getByRole("radio", { name: "All" }).click()
    await expect.poll(() => totalOf(p)).toBeGreaterThan(yours)
    expect(yours).toBeGreaterThan(0)

    // (b) Roles lands on Yours too (the scope is one choice across spokes).
    await show.getByRole("radio", { name: "Yours" }).click()
    await p.getByRole("button", { name: "Roles", exact: true }).click()
    const showRoles = p.getByRole("radiogroup", { name: "Show" }).filter({ visible: true })
    await expect(showRoles).toBeVisible()
    await expect(showRoles.getByRole("radio", { name: "Yours" })).toHaveAttribute("aria-checked", "true")
    if (SHOT) await p.screenshot({ path: `${SHOT}/desktop-roles-yours.png` })
    await ctx.close()
  })

  test("member on a phone: hub says You're on, Countdown opens on Yours", async ({ page }) => {
    const ctx = await page.context().browser()!.newContext({ storageState: memberState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const p = await ctx.newPage()
    await p.goto(`/home?tab=plan&team=${TEAM_ID}`)
    // Phone width: the team is a hub; Events is a door.
    await p.getByText("Events", { exact: true }).filter({ visible: true }).first().click()
    const card = p.getByText(EVENT, { exact: true }).filter({ visible: true }).first()
    await expect(card).toBeVisible({ timeout: 20_000 })
    await card.click()
    await expect(p.getByText(/You're on /).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 })
    await expect(p.getByText(/of yours done/).filter({ visible: true }).first()).toBeVisible()
    await expect(p.getByText("Treasurer only").filter({ visible: true })).toHaveCount(0)
    if (SHOT) await p.screenshot({ path: `${SHOT}/mobile-hub.png` })
    await p.getByText("Countdown", { exact: true }).filter({ visible: true }).first().click()
    const yoursChip = p.getByRole("button", { name: "Yours", exact: true }).filter({ visible: true })
    await expect(yoursChip).toBeVisible({ timeout: 10_000 })
    if (SHOT) await p.screenshot({ path: `${SHOT}/mobile-countdown-yours.png`, fullPage: true })
    await ctx.close()
  })

  test("admin: no scope switch, the whole plan", async ({ page }) => {
    const ctx = await page.context().browser()!.newContext({ storageState: adminState, viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()
    await openEvent(p)
    await p.getByRole("button", { name: "Countdown", exact: true }).click()
    await expect(remaining(p)).toBeVisible({ timeout: 10_000 })
    await expect(p.getByRole("radiogroup", { name: "Show" })).toHaveCount(0)
    // …and the planner keeps the chase readouts (the inline auto-DM chips; the
    // rail's Reminder schedule card sits behind the collapsed AT A GLANCE strip).
    await expect(p.getByText(/Auto-DM|Confirm-taps/).filter({ visible: true }).first()).toBeVisible()
    await ctx.close()
  })
})
