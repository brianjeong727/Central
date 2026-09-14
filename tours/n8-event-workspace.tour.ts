// N8 — Event workspace. Opens each seeded event from the board's Events list
// (there is no event-id URL param — the workspace is reached by click) and walks
// every section via ?evtab (desktop) or the mobile hub rows.
import { test } from "@playwright/test"
import { adminState, memberState, sandbox } from "../e2e/fixtures"
import { attempt, capture, coveredBy, goHome, isMobile, restoreRoles, setRole, settle, skip, STATE, type Role } from "./lib"

test.describe.configure({ mode: "serial" })

const SECTION_ROW: Record<string, string> = {
  overview: "Overview", checklist: "Countdown", roles: "Roles", runsheet: "Run of Show",
  sub_events: "Sub-events", acts: "Acts", teams: "Teams", transport: "Transport",
}

async function boardId() {
  const sb = sandbox()
  const { data } = await sb.client.from("teams").select("id").eq("ministry_id", sb.ministryId).eq("name", "Student Org Board").single()
  return data!.id
}

/** Open an event's workspace from the board Events list. */
async function openEvent(page: import("@playwright/test").Page, team: string, title: string) {
  if (isMobile(page)) {
    await goHome(page, { tab: "plan", team })
    await page.getByText("Events", { exact: true }).filter({ visible: true }).first().click({ timeout: 8_000 })
    await settle(page)
  } else {
    await goHome(page, { tab: "plan", team, sotab: "Events" })
  }
  await page.getByText(title, { exact: true }).filter({ visible: true }).first().click({ timeout: 8_000 })
  await settle(page)
}

async function openSection(page: import("@playwright/test").Page, section: string) {
  if (isMobile(page)) {
    // Back to the hub if we're drilled, then tap the row.
    const row = page.getByText(SECTION_ROW[section], { exact: true }).filter({ visible: true }).first()
    if (!(await row.isVisible().catch(() => false))) {
      await page.locator(".back-chevron").first().click({ timeout: 4_000 }).catch(() => {})
      await settle(page, 300)
    }
    await row.click({ timeout: 6_000 })
    await settle(page)
  } else {
    await page.getByRole("tab", { name: SECTION_ROW[section] }).filter({ visible: true }).first().click({ timeout: 6_000 }).catch(async () => {
      await page.getByText(SECTION_ROW[section], { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 })
    })
    await settle(page)
  }
}

test.describe("N8 as admin (can_plan_events)", () => {
  test.use({ storageState: adminState })
  test.afterAll(async () => { await restoreRoles() })

  test("kickoff — every core section + modals", async ({ page }) => {
    await setRole("admin", "admin")
    const role: Role = "admin"
    const mobile = isMobile(page)
    const board = await boardId()

    await openEvent(page, board, "Fall Kickoff Night")
    if (mobile) { await capture(page, "N8.0", { role, state: STATE, label: "Event hub (mobile)" }) }
    for (const [id, section] of [["N8.1", "overview"], ["N8.2", "checklist"], ["N8.3", "roles"], ["N8.4", "runsheet"]] as const) {
      await attempt(page, id, role, async () => {
        await openSection(page, section)
        await capture(page, id, { role, state: STATE, label: `Event · ${SECTION_ROW[section]}` })
      })
    }
    coveredBy(page, ["N8.11"], "N8.1", role)

    // Overview: edit event modal
    await attempt(page, "N8.1", role, async () => {
      await openSection(page, "overview")
      await page.getByRole("button", { name: /edit event/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N8.1", { role, state: `${STATE}-edit-event`, label: "Event · edit modal" })
      await page.keyboard.press("Escape")
    })
    // Countdown: add task row, ladder editor, edit task
    await attempt(page, "N8.2", role, async () => {
      await openSection(page, "checklist")
      // The add-task row is an always-present inline input ("Add to <phase>…"); typing reveals its controls.
      const addInput = page.getByPlaceholder(/^Add to /).filter({ visible: true }).first()
      await addInput.click({ timeout: 5_000 })
      await addInput.fill("Book the room")
      await settle(page, 300)
      await capture(page, "N8.2", { role, state: `${STATE}-add-task`, label: "Countdown · add task" })
      await page.keyboard.press("Escape")
    })
    await attempt(page, "N8.2.1", role, async () => {
      await openSection(page, "checklist")
      await openSection(page, "overview")
      await page.getByRole("button", { name: /edit event/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 400)
      await page.getByText(/countdown|ladder|phases/i).filter({ visible: true }).first().scrollIntoViewIfNeeded().catch(() => {})
      await capture(page, "N8.2.1", { role, state: STATE, label: "Countdown ladder editor (inside Edit event)" })
      await page.keyboard.press("Escape")
    })
    await attempt(page, "N8.2", role, async () => {
      await openSection(page, "checklist")
      const kebab = page.locator("button[aria-label*='ctions'], button[aria-label*='ore'], button[title*='ctions']").filter({ visible: true }).first()
      await kebab.click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N8.2", { role, state: `${STATE}-task-menu`, label: "Countdown · task menu", foldOnly: true })
      await page.getByRole("menuitem", { name: /edit/i }).filter({ visible: true }).first().click({ timeout: 4_000 }).catch(() => page.getByText(/^edit$/i).filter({ visible: true }).first().click())
      await settle(page, 300)
      await capture(page, "N8.2", { role, state: `${STATE}-edit-task`, label: "Countdown · edit task" })
      await page.keyboard.press("Escape")
    })
    // Roles: add role form
    await attempt(page, "N8.3", role, async () => {
      await openSection(page, "roles")
      await page.locator('button[aria-label="Add role"]').filter({ visible: true }).first().click({ timeout: 3_000 }).catch(() => page.getByText(/add a role|add the first role/i).filter({ visible: true }).first().click({ timeout: 4_000 }))
      await settle(page, 300)
      await capture(page, "N8.3", { role, state: `${STATE}-add-role`, label: "Roles · add role" })
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: /cancel/i }).filter({ visible: true }).first().click({ timeout: 2_000 }).catch(() => {})
    })
    // Run of Show: add block + compile
    await attempt(page, "N8.4", role, async () => {
      await openSection(page, "runsheet")
      await page.getByText(/add a block/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N8.4", { role, state: `${STATE}-add-block`, label: "Run of Show · add block" })
      await page.keyboard.press("Escape")
    })
    await attempt(page, "N8.4.1", role, async () => {
      await openSection(page, "runsheet")
      await page.getByText(/compile playbook/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N8.4.1", { role, state: STATE, label: "Compile playbook" })
      await page.keyboard.press("Escape")
    })
  })

  test("extra tabs on typed events", async ({ page }) => {
    const role: Role = "admin"
    const board = await boardId()
    for (const [title, section, id] of [["Fall Coffeehouse", "acts", "N8.7"], ["Turkey Bowl", "teams", "N8.8"], ["Fall Retreat", "transport", "N8.9"], ["Fall Retreat", "runsheet", "N8.4"]] as const) {
      await attempt(page, id, role, async () => {
        await openEvent(page, board, title)
        await openSection(page, section)
        await capture(page, id, { role, state: section === "runsheet" ? `${STATE}-multiday` : STATE, label: `${title} · ${SECTION_ROW[section]}` })
      })
    }
    // Container: Welcome Week (past season — still the only container).
    await attempt(page, "N8.5", role, async () => {
      if (isMobile(page)) {
        await goHome(page, { tab: "plan", team: board })
        await page.getByText("Events", { exact: true }).filter({ visible: true }).first().click({ timeout: 8_000 })
      } else {
        await goHome(page, { tab: "plan", team: board, sotab: "Events" })
      }
      await settle(page)
      // Past seasons live behind the season filter.
      await page.getByText(/^20\d\d[–-]\d\d$/).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await page.getByText(/^2025[–-]26$/).filter({ visible: true }).first().click({ timeout: 4_000 })
      await settle(page, 300)
      await page.getByText("Welcome Week", { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 })
      await settle(page)
      await openSection(page, "sub_events")
      await capture(page, "N8.5", { role, state: STATE, label: "Welcome Week · Sub-events" })
      await openSection(page, "runsheet")
      await capture(page, "N8.6.1", { role, state: STATE, label: "Container · week timeline" })
      await openSection(page, "roles")
      await capture(page, "N8.6.2", { role, state: STATE, label: "Container · staffing" })
      await openSection(page, "checklist")
      await capture(page, "N8.6.3", { role, state: STATE, label: "Container · task roll-up" })
      await openSection(page, "sub_events")
      await page.getByText("Welcoming Night", { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 })
      await settle(page)
      await capture(page, "N8.12", { role, state: STATE, label: "Sub-event workspace (Welcoming Night)" })
    })
  })
})

test.describe("N8 as member (event coordinator on the board)", () => {
  test.use({ storageState: memberState })
  test.afterAll(async () => { await restoreRoles() })
  test("kickoff as member", async ({ page }) => {
    await setRole("member", "member")
    const role: Role = "member"
    const board = await boardId()
    await attempt(page, "N8.1", role, async () => {
      await openEvent(page, board, "Fall Kickoff Night")
      if (isMobile(page)) await capture(page, "N8.0", { role, state: STATE, label: "Event hub (member)" })
      await openSection(page, "overview")
      await capture(page, "N8.1", { role, state: STATE, label: "Event · Overview (member)" })
      await openSection(page, "checklist")
      await capture(page, "N8.2", { role, state: STATE, label: "Event · Countdown (member)" })
      await openSection(page, "roles")
      await capture(page, "N8.3", { role, state: STATE, label: "Event · Roles (member)" })
    })
    skip(page, "N8.10", role, "Gov-view read-only mat needs a governance admin who is NOT a team member; captured in the empty-state lane instead if reachable.")
  })
})
