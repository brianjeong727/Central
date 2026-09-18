// N6 — Church Settings. Admin-only; captured as admin AND pastor (pastor sees the
// same sections; the difference is the Home-section Congregation item, so one
// pass as admin covers N6 and a pastor pass is only taken on the hub). Every
// section is reached by URL (?tab=settings&stab=…); modals and confirm surfaces
// are opened by click where a stable label exists.
import { test } from "@playwright/test"
import { adminState } from "../e2e/fixtures"
import { attempt, capture, coveredBy, goHome, isMobile, restoreRoles, setRole, settle, skip, STATE, vis } from "./lib"

test.describe.configure({ mode: "serial" })

const SECTIONS: [string, string | null, string][] = [
  ["N6.1", null, "General"],
  ["N6.2", "people", "People"],
  ["N6.3", "governance", "Governance"],
  ["N6.4", "automations", "Automations"],
  ["N6.5", "chat", "Chat"],
  ["N6.6", "reports", "Reports"],
  ["N6.7", "workspace", "Workspace"],
  ["N6.8", "audit", "Audit Log"],
]

test.describe("N6 settings as admin", () => {
  test.use({ storageState: adminState })
  test.afterAll(async () => { await restoreRoles() })

  test("hub + every section", async ({ page }) => {
    await setRole("admin", "admin")
    const role = "admin"
    const mobile = isMobile(page)

    if (mobile) {
      await goHome(page, { tab: "settings" })
      await capture(page, "N6.0", { role, state: STATE, label: "Settings hub (mobile)" })
    }

    for (const [id, stab, label] of SECTIONS) {
      await attempt(page, id, role, async () => {
        await goHome(page, stab ? { tab: "settings", stab } : { tab: "settings" })
        await capture(page, id, { role, state: STATE, label: `Settings · ${label}` })
      })
    }
    // Sub-surfaces that are visible inside the section captures.
    coveredBy(page, ["N6.1.1", "N6.1.2", "N6.1.3", "N6.1.4", "N6.1.5", "N6.1.6"], "N6.1", role)
    coveredBy(page, ["N6.2.1", "N6.2.2"], "N6.2", role)
    coveredBy(page, ["N6.3.1", "N6.3.2"], "N6.3", role)
    coveredBy(page, ["N6.7.1", "N6.7.3", "N6.7.4", "N6.7.5", "N6.7.6", "N6.7.7"], "N6.7", role)
    coveredBy(page, ["N6.9"], "N6.1", role)

    // People: filter sheet (mobile) / the row action menu + role-change confirm.
    await attempt(page, "N6.2.1", role, async () => {
      if (!mobile) throw new Error("desktop tiles are covered by N6.2")
      await goHome(page, { tab: "settings", stab: "people" })
      await page.getByRole("button", { name: /filter/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N6.2.1", { role, state: `${STATE}-sheet`, label: "People · filter sheet", foldOnly: true })
      await page.keyboard.press("Escape")
    })
    await attempt(page, "N6.2.2", role, async () => {
      await goHome(page, { tab: "settings", stab: "people" })
      const kebab = page.locator('button[aria-label="More actions"]').filter({ visible: true }).first()
      await kebab.click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N6.2.2", { role, state: `${STATE}-menu`, label: "People · row action menu", foldOnly: true })
      await page.getByRole("menuitem", { name: /set role|change role/i }).filter({ visible: true }).first().click({ timeout: 4_000 }).catch(async () => {
        await page.getByText(/set role/i).filter({ visible: true }).first().click({ timeout: 4_000 })
      })
      await settle(page, 300)
      await capture(page, "N6.2.3", { role, state: STATE, label: "People · set role", foldOnly: true })
      await page.keyboard.press("Escape")
    })

    // Edit mode on General (the Edit → Cancel/Save + confirm pattern).
    await attempt(page, "N6.9", role, async () => {
      await goHome(page, { tab: "settings" })
      await page.getByRole("button", { name: /^edit$/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N6.9", { role, state: `${STATE}-editing`, label: "Section edit mode" })
      const name = page.locator("input").filter({ visible: true }).first()
      await name.fill((await name.inputValue()) + " ")
      await page.getByRole("button", { name: /^save/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N6.9", { role, state: `${STATE}-confirm`, label: "Section save confirm", foldOnly: true })
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: /cancel/i }).filter({ visible: true }).first().click({ timeout: 3_000 }).catch(() => {})
    })

    // Workspace: invite share modal.
    await attempt(page, "N6.7.2", role, async () => {
      await goHome(page, { tab: "settings", stab: "workspace" })
      await page.getByRole("button", { name: /share|qr|invite link/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N6.7.2", { role, state: STATE, label: "Invite share modal (settings)", foldOnly: true })
      await page.keyboard.press("Escape")
    })
    // Schools: remove confirm.
    await attempt(page, "N6.1.3", role, async () => {
      await goHome(page, { tab: "settings" })
      await page.getByRole("button", { name: /^edit$/i }).filter({ visible: true }).first().click({ timeout: 4_000 }).catch(() => {})
      const remove = page.locator('button:has-text("×")').filter({ visible: true }).first()
      await remove.click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N6.1.3", { role, state: `${STATE}-confirm`, label: "Schools · remove confirm", foldOnly: true })
      await page.keyboard.press("Escape")
    })
  })
})

test.describe("N6 hub as pastor", () => {
  test.use({ storageState: adminState })
  test.afterAll(async () => { await restoreRoles() })
  test("settings as pastor", async ({ page }) => {
    await setRole("admin", "pastor")
    await goHome(page, { tab: "settings" })
    await capture(page, isMobile(page) ? "N6.0" : "N6.1", { role: "pastor", state: STATE, label: "Settings (pastor)" })
    skip(page, "N6.2.4", "pastor", "Excommunicate is destructive; not exercised. Reviewed from code + the row menu shot.")
  })
})
