// N7 — Plan workspaces: the picker, Student Org Board (every section), Small
// Group Leaders (every section, as president AND as a plain DGL), the standard
// calendar team, team settings, rotations, groups generator, receipts, and the
// member-tier volunteer workspace.
import { test } from "@playwright/test"
import { adminState, memberState, sandbox } from "../e2e/fixtures"
import { attempt, capture, coveredBy, goHome, isMobile, restoreRoles, setRole, settle, skip, STATE, type Role } from "./lib"

test.describe.configure({ mode: "serial" })

async function teamIds() {
  const sb = sandbox()
  const { data } = await sb.client.from("teams").select("id,name").eq("ministry_id", sb.ministryId)
  const by = (n: string) => data?.find(t => t.name === n)?.id
  return { board: by("Student Org Board")!, dgl: by("Small Group Leaders")!, finance: by("Finance")!, outreach: by("Campus Outreach")! }
}

/** Mobile: tap a hub row by its title; desktop: the URL param already selects the section. */
async function openSection(page: import("@playwright/test").Page, team: string, param: Record<string, string>, mobileRowTitle: string) {
  if (isMobile(page)) {
    await goHome(page, { tab: "plan", team })
    await page.getByText(mobileRowTitle, { exact: true }).filter({ visible: true }).first().click({ timeout: 8_000 })
    await settle(page)
  } else {
    await goHome(page, { tab: "plan", team, ...param })
  }
}

test.describe("N7 as admin / president", () => {
  test.use({ storageState: adminState })
  test.afterAll(async () => { await restoreRoles() })

  test("picker, board, dgl, standard, settings, receipts", async ({ page }) => {
    await setRole("admin", "admin")
    const role: Role = "admin"
    const mobile = isMobile(page)
    const T = await teamIds()

    // Picker
    await goHome(page, { tab: "plan" })
    await capture(page, "N7.1", { role, state: STATE, label: "All workspaces" })
    await attempt(page, "N7.1.1", role, async () => {
      const add = page.getByText(/add workspace/i).filter({ visible: true }).first()
      await add.click({ timeout: 6_000 })
      await settle(page)
      await capture(page, "N7.1.1", { role, state: STATE, label: "Add workspace" })
      await page.keyboard.press("Escape")
    })

    // Student Org Board
    await goHome(page, { tab: "plan", team: T.board })
    await capture(page, "N7.2", { role, state: STATE, label: "Student Org Board · landing" })
    if (mobile) coveredBy(page, ["N7.2.1"], "N7.2", role); else coveredBy(page, ["N7.1.2"], "N7.2", role)
    for (const [id, sotab, row, label] of [
      ["N7.2.2", "General", "Calendar", "Board · Calendar"],
      ["N7.2.3", "Events", "Events", "Board · Events"],
      ["N7.2.4", "Resources", "Resources", "Board · Resources"],
      ["N7.2.5", "Groups", "Groups", "Board · Groups"],
      ["N7.2.6", "Rotations", "Rotations", "Board · Rotations"],
      ["N7.2.7", "Meeting Notes", "Meeting notes", "Board · Meeting notes"],
    ] as const) {
      await attempt(page, id, role, async () => {
        await openSection(page, T.board, { sotab }, row)
        await capture(page, id, { role, state: STATE, label })
      })
    }
    coveredBy(page, ["N7.7"], "N7.2.6", role)
    // Meeting note detail
    await attempt(page, "N7.2.8", role, async () => {
      await openSection(page, T.board, { sotab: "Meeting Notes" }, "Meeting notes")
      await page.getByText(/Board Meeting|Semester kickoff planning/i).filter({ visible: true }).first().click({ timeout: 6_000 })
      await settle(page)
      await capture(page, "N7.2.8", { role, state: STATE, label: "Meeting note detail" })
    })
    // Events → add event modal (path chooser → details → custom module picker)
    await attempt(page, "N7.3", role, async () => {
      await openSection(page, T.board, { sotab: "Events" }, "Events")
      const btn = mobile ? page.locator("button[aria-label*='ew event'], button[title*='ew event'], button[aria-label*='dd event']").first() : page.getByRole("button", { name: /new event|add event/i }).filter({ visible: true }).first()
      await btn.click({ timeout: 6_000 })
      await settle(page)
      await capture(page, "N7.3.1", { role, state: STATE, label: "New event · path chooser" })
      await page.getByText(/quick social/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N7.3.2", { role, state: STATE, label: "New event · details (quick)" })
      await page.keyboard.press("Escape")
      await settle(page, 300)
      await btn.click({ timeout: 6_000 })
      await settle(page)
      await page.getByText(/start from scratch/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 400)
      await capture(page, "N7.3.3", { role, state: STATE, label: "New event · from scratch (module picker)" })
      await page.keyboard.press("Escape")
    })
    coveredBy(page, ["N7.3.4"], "N8.1", role)
    // Groups generator wizard
    await attempt(page, "N7.8", role, async () => {
      await openSection(page, T.board, { sotab: "Groups" }, "Groups")
      await page.getByRole("button", { name: /generate|new group set|new set/i }).filter({ visible: true }).first().click({ timeout: 6_000 })
      await settle(page)
      await capture(page, "N7.8.1", { role, state: STATE, label: "Group generator · pick pool" })
      await page.getByRole("button", { name: /next|continue|configure/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N7.8.2", { role, state: STATE, label: "Group generator · configure" })
      await page.getByRole("button", { name: /^generate$/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 1500)
      await capture(page, "N7.8.3", { role, state: STATE, label: "Group generator · preview" })
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: /cancel|close|discard/i }).filter({ visible: true }).first().click({ timeout: 2_000 }).catch(() => {})
    })
    await attempt(page, "N7.8.4", role, async () => {
      await openSection(page, T.board, { sotab: "Groups" }, "Groups")
      await page.getByText(/Fall Small Groups/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N7.8.4", { role, state: STATE, label: "Group session view" })
    })
    // Rotations: new semester modal
    await attempt(page, "N7.7.1", role, async () => {
      await openSection(page, T.board, { sotab: "Rotations" }, "Rotations")
      await page.getByRole("button", { name: /new semester/i }).filter({ visible: true }).first().click({ timeout: 6_000 })
      await settle(page, 300)
      await capture(page, "N7.7.1", { role, state: STATE, label: "New semester" })
      await page.keyboard.press("Escape")
    })
    // Team settings overlay (gear)
    await attempt(page, "N7.6", role, async () => {
      await goHome(page, { tab: "plan", team: T.board })
      await page.locator("button[title='Team settings']").filter({ visible: true }).first().click({ timeout: 6_000 })
      await settle(page)
      await capture(page, "N7.6", { role, state: STATE, label: "Team settings" })
      coveredBy(page, ["N7.6.1", "N7.6.2", "N7.6.3"], "N7.6", role)
    })

    // Small Group Leaders (as president)
    await goHome(page, { tab: "plan", team: T.dgl })
    await settle(page, 1500)
    await capture(page, "N7.4", { role, state: STATE, label: "Small Group Leaders · landing" })
    if (mobile) coveredBy(page, ["N7.4.1"], "N7.4", role)
    await attempt(page, "N7.4.2", role, async () => {
      await openSection(page, T.dgl, { sgltab: "home" }, "Home")
      await capture(page, "N7.4.2", { role, state: STATE, label: "SGL · Home (assignments, roster, groups, availability)" })
      coveredBy(page, ["N7.4.3", "N7.4.4", "N7.4.5"], "N7.4.2", role)
    })
    await attempt(page, "N7.4.6", role, async () => {
      await openSection(page, T.dgl, { sgltab: "schedule" }, "Schedule")
      await capture(page, "N7.4.6", { role, state: STATE, label: "SGL · Schedule" })
      coveredBy(page, ["N7.4.7"], "N7.4.6", role)
    })
    await attempt(page, "N7.4.8", role, async () => {
      await openSection(page, T.dgl, { sgltab: "bible_study" }, "Bible Study")
      await capture(page, "N7.4.8", { role, state: STATE, label: "SGL · Bible study" })
      await page.getByText(/Week 1 — Romans 8/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N7.4.9", { role, state: STATE, label: "SGL · Bible study sheet" })
    })

    // Standard team (calendar)
    await goHome(page, { tab: "plan", team: T.outreach })
    await capture(page, "N7.5", { role, state: STATE, label: "Standard team · landing" })
    if (mobile) {
      await attempt(page, "N7.5.3", role, async () => {
        await page.getByText("Calendar", { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 })
        await settle(page)
        await capture(page, "N7.5.3", { role, state: STATE, label: "Standard team · calendar spoke" })
        coveredBy(page, ["N7.5.4"], "N7.5.3", role)
      })
    } else {
      coveredBy(page, ["N7.5.1"], "N7.5", role)
      await attempt(page, "N7.5.2", role, async () => {
        await page.getByRole("button", { name: /timeline|list/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
        await settle(page, 300)
        await capture(page, "N7.5.2", { role, state: STATE, label: "Standard team · timeline" })
      })
    }

    // Receipts workspace
    await goHome(page, { tab: "plan", team: "receipts" })
    await capture(page, mobile ? "N7.9.2" : "N7.9.1", { role, state: STATE, label: "Receipts workspace" })
    await attempt(page, "N7.9.3", role, async () => {
      await goHome(page, { tab: "plan", team: "receipts", rteam: T.board })
      if (mobile) { await page.getByText("Student Org Board", { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 }).catch(() => {}); await settle(page) }
      await capture(page, "N7.9.3", { role, state: STATE, label: "Receipts · team categories" })
      await page.getByText(/Kickoff signage|Retreat — speaker gift|Kickoff dessert/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N7.9.4", { role, state: STATE, label: "Receipt detail" })
    })
    skip(page, "N7.9.5", role, "Delete-category confirm is destructive on seeded categories; reviewed from code + the ConfirmDialog pattern shot (N6.1.3).")
  })
})

test.describe("N7 as member (DGL, not president) + volunteer", () => {
  test.use({ storageState: memberState })
  test.afterAll(async () => {
    await restoreRoles()
    // Restore the member's team seats if the volunteer step removed them.
    const sb = sandbox()
    const memberId = await sb.memberUserId()
    const stash = (globalThis as { __dpStash?: { team_id: string; role_id: string | null; added_by: string }[] }).__dpStash
    if (stash?.length) await sb.client.from("team_members").upsert(stash.map(r => ({ ...r, user_id: memberId })), { onConflict: "team_id,user_id", ignoreDuplicates: true })
  })

  test("dgl as plain member, picker, volunteer workspace", async ({ page }) => {
    await setRole("member", "member")
    const role: Role = "member"
    const mobile = isMobile(page)
    const T = await teamIds()
    await goHome(page, { tab: "plan" })
    await capture(page, "N7.1", { role, state: STATE, label: "All workspaces (member)" })
    await goHome(page, { tab: "plan", team: T.dgl })
    await capture(page, "N7.4", { role, state: STATE, label: "SGL landing (DGL)" })
    await attempt(page, "N7.4.2", role, async () => {
      await openSection(page, T.dgl, { sgltab: "home" }, "Home")
      await capture(page, "N7.4.2", { role, state: STATE, label: "SGL · Home (DGL)" })
    })
    await attempt(page, "N7.4.8", role, async () => {
      await openSection(page, T.dgl, { sgltab: "bible_study" }, "Bible Study")
      await capture(page, "N7.4.8", { role, state: STATE, label: "SGL · Bible study (DGL)" })
    })
    await goHome(page, { tab: "plan", team: T.board })
    await capture(page, "N7.2", { role, state: STATE, label: "Board landing (event coordinator)" })

    // Volunteer workspace: temporarily remove the member from every team.
    await attempt(page, "N7.0", role, async () => {
      const sb = sandbox()
      const memberId = await sb.memberUserId()
      const { data: seats } = await sb.client.from("team_members").select("team_id,role_id,added_by").eq("user_id", memberId)
      ;(globalThis as { __dpStash?: unknown }).__dpStash = seats ?? []
      await sb.client.from("team_members").delete().eq("user_id", memberId)
      await goHome(page, { tab: "plan" })
      await capture(page, "N7.0", { role, state: STATE, label: "Volunteer workspace" })
      await page.getByText(/Fall Kickoff Night/i).filter({ visible: true }).first().click({ timeout: 6_000 }).catch(() => {})
      await settle(page)
      await capture(page, "N7.0", { role, state: `${STATE}-event`, label: "Volunteer workspace · event" })
      await sb.client.from("team_members").upsert((seats ?? []).map(r => ({ ...r, user_id: memberId })), { onConflict: "team_id,user_id", ignoreDuplicates: true })
    })
  })
})
