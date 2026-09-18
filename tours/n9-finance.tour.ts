// N9 — Finance workspace: allocation, budget, reimbursements inbox + detail,
// submit-receipt modal, the decline dialog (opened, never confirmed).
import { test } from "@playwright/test"
import { adminState, memberState, sandbox } from "../e2e/fixtures"
import { attempt, capture, coveredBy, goHome, isMobile, restoreRoles, setRole, settle, skip, STATE, type Role } from "./lib"

test.describe.configure({ mode: "serial" })

async function financeId() {
  const sb = sandbox()
  const { data } = await sb.client.from("teams").select("id").eq("ministry_id", sb.ministryId).eq("name", "Finance").single()
  return data!.id
}

test.describe("N9 as treasurer (admin)", () => {
  test.use({ storageState: adminState })
  test.afterAll(async () => { await restoreRoles() })

  test("sections, inbox, detail, submit", async ({ page }) => {
    await setRole("admin", "admin")
    const role: Role = "admin"
    const mobile = isMobile(page)
    const fin = await financeId()

    await goHome(page, { tab: "plan", team: fin })
    await capture(page, mobile ? "N9.0" : "N9.1", { role, state: STATE, label: mobile ? "Finance hub" : "Finance · Allocation" })
    for (const [id, fsec, row] of [["N9.1", "allocation", "Allocation"], ["N9.2", "budget", "Budget"], ["N9.3", "reimbursements", "Reimbursements"]] as const) {
      await attempt(page, id, role, async () => {
        if (mobile) {
          await goHome(page, { tab: "plan", team: fin })
          await page.getByText(row, { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 })
          await settle(page)
        } else {
          await goHome(page, { tab: "plan", team: fin, fsec })
        }
        await capture(page, id, { role, state: STATE, label: `Finance · ${row}` })
      })
    }
    await attempt(page, "N9.3.1", role, async () => {
      if (mobile) { await goHome(page, { tab: "plan", team: fin }); await page.getByText("Reimbursements", { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 }); await settle(page) }
      else await goHome(page, { tab: "plan", team: fin, fsec: "reimbursements" })
      await page.getByText(/Coffeehouse/i).filter({ visible: true }).first().click({ timeout: 6_000 }).catch(() => page.getByText("James Park", { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 }))
      await settle(page)
      await capture(page, "N9.3.1", { role, state: `${STATE}-split-pending`, label: "Inbox detail · split, pending" })
      coveredBy(page, ["N9.3.2"], "N9.3.1", role)
      await page.getByRole("button", { name: /decline/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N9.3.3", { role, state: STATE, label: "Decline with reason", foldOnly: true })
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: /cancel/i }).filter({ visible: true }).first().click({ timeout: 2_000 }).catch(() => {})
    })
    await attempt(page, "N9.3.1", role, async () => {
      if (mobile) { await goHome(page, { tab: "plan", team: fin }); await page.getByText("Reimbursements", { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 }); await settle(page) }
      else await goHome(page, { tab: "plan", team: fin, fsec: "reimbursements" })
      await page.getByRole("button", { name: /all|filter|status/i }).filter({ visible: true }).first().click({ timeout: 4_000 }).catch(() => {})
      await settle(page, 300)
      await page.getByRole("menuitem", { name: /reimbursed|closed|done/i }).filter({ visible: true }).first().click({ timeout: 4_000 }).catch(() => page.keyboard.press("Escape"))
      await settle(page, 300)
      await page.getByText(/camp deposit/i).filter({ visible: true }).first().click({ timeout: 6_000 }).catch(() => page.getByText("Hannah Choi", { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 }))
      await settle(page)
      await capture(page, "N9.3.1", { role, state: `${STATE}-reimbursed`, label: "Inbox detail · reimbursed (posted)" })
    })
    await attempt(page, "N9.4", role, async () => {
      // The submit sheet lives in the Receipts workspace (per-team categories), not in Finance.
      const sb = sandbox()
      const { data: t } = await sb.client.from("teams").select("id").eq("ministry_id", sb.ministryId).eq("name", "Student Org Board").single()
      await goHome(page, { tab: "plan", team: "receipts", rteam: t!.id })
      if (mobile) { await page.getByText("Student Org Board", { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 }).catch(() => {}); await settle(page) }
      await page.getByText(/submit a receipt/i).filter({ visible: true }).first().click({ timeout: 6_000 })
      await settle(page)
      await capture(page, "N9.4", { role, state: STATE, label: "Submit a receipt" })
      await page.keyboard.press("Escape")
    })
    skip(page, "N9.3.4", role, "Undo toast appears only after an approve; approve is a real write — not exercised.")
  })
})

test.describe("N9 as member (submitter, no finance access)", () => {
  test.use({ storageState: memberState })
  test.afterAll(async () => { await restoreRoles() })
  test("receipts entry for a plain member", async ({ page }) => {
    await setRole("member", "member")
    const role: Role = "member"
    await goHome(page, { tab: "plan", team: "receipts" })
    await capture(page, isMobile(page) ? "N7.9.2" : "N7.9.1", { role, state: STATE, label: "Receipts workspace (member)" })
    await attempt(page, "N9.4", role, async () => {
      const sb = sandbox()
      const { data: t } = await sb.client.from("teams").select("id").eq("ministry_id", sb.ministryId).eq("name", "Student Org Board").single()
      await goHome(page, { tab: "plan", team: "receipts", rteam: t!.id })
      if (isMobile(page)) { await page.getByText("Student Org Board", { exact: true }).filter({ visible: true }).first().click({ timeout: 6_000 }).catch(() => {}); await settle(page) }
      await capture(page, "N7.9.3", { role, state: `${STATE}-member`, label: "Receipts · team categories (member)" })
      await page.getByText(/submit a receipt/i).filter({ visible: true }).first().click({ timeout: 6_000 })
      await settle(page)
      await capture(page, "N9.4", { role, state: `${STATE}-member`, label: "Submit a receipt (member)" })
      await page.keyboard.press("Escape")
    })
  })
})
