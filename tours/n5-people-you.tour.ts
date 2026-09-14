// N5 — People & You: directory, member sheet (+ actions menu → report modal),
// profile (desktop sections; mobile settings drills), journal (three tabs +
// editors), congregation (pastor), give (admin edit + member).
import { test } from "@playwright/test"
import { adminState, memberState, sandbox } from "../e2e/fixtures"
import { attempt, capture, coveredBy, goHome, isMobile, restoreRoles, setRole, settle, skip, STATE, type Role } from "./lib"

test.describe.configure({ mode: "serial" })

async function ghostId(name: string) {
  const sb = sandbox()
  const { data } = await sb.client.from("profiles").select("id").eq("ministry_id", sb.ministryId).eq("name", name).maybeSingle()
  return data?.id
}

test.describe("N5 as admin / pastor", () => {
  test.use({ storageState: adminState })
  test.afterAll(async () => { await restoreRoles() })

  test("directory, member sheet, profile, journal, give", async ({ page }) => {
    await setRole("admin", "admin")
    const role: Role = "admin"
    const mobile = isMobile(page)
    const sarah = await ghostId("Sarah Kim")

    await goHome(page, { tab: "directory" })
    await capture(page, mobile ? "N5.2" : "N5.1", { role, state: STATE, label: "Directory" })
    await attempt(page, "N5.3", role, async () => {
      if (!sarah) throw new Error("no Sarah Kim")
      await goHome(page, { tab: "directory", member: sarah })
      if (mobile) { await page.getByText("Sarah Kim", { exact: true }).filter({ visible: true }).first().click({ timeout: 5_000 }).catch(() => {}); await settle(page) }
      await capture(page, "N5.3", { role, state: STATE, label: "Member sheet" })
      const kebab = page.locator("button[aria-label*='ctions'], button[aria-label*='ore'], button[title*='ctions']").filter({ visible: true }).first()
      await kebab.click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N5.3.1", { role, state: STATE, label: "Member actions menu", foldOnly: true })
      await page.getByRole("menuitem", { name: /report/i }).filter({ visible: true }).first().click({ timeout: 4_000 }).catch(() => page.getByText(/^report$/i).filter({ visible: true }).first().click())
      await settle(page, 300)
      await capture(page, "N2.10", { role, state: STATE, label: "Report content modal", foldOnly: true })
      await page.keyboard.press("Escape")
    })
    await attempt(page, "N5.3.2", role, async () => {
      // From a chat: tap a sender's avatar/name → global overlay.
      const sb = sandbox()
      const { data: g } = await sb.client.from("groups").select("id").eq("ministry_id", sb.ministryId).eq("name", "Tuesday Night DG").single()
      await goHome(page, { tab: "chats", chat: g!.id })
      await settle(page, 900)
      await page.getByText("Grace Lee", { exact: true }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N5.3.2", { role, state: STATE, label: "Member overlay from chat" })
      await page.keyboard.press("Escape")
    })

    await goHome(page, { tab: "profile" })
    await capture(page, mobile ? "N5.5" : "N5.4", { role, state: STATE, label: "Profile" })
    if (!mobile) coveredBy(page, ["N2.7"], "N5.4", role)
    if (mobile) {
      for (const [id, pset, label] of [["N5.5.1", "hub", "Settings hub"], ["N5.5.2", "notifications", "Notifications"], ["N5.5.3", "account", "Account & support"], ["N5.5.4", "danger", "Danger zone"]] as const) {
        await attempt(page, id, role, async () => {
          await goHome(page, { tab: "profile", pset })
          await capture(page, id, { role, state: STATE, label: `Profile · ${label}` })
        })
      }
      coveredBy(page, ["N2.7"], "N5.5.2", role)
    } else {
      await attempt(page, "N5.4", role, async () => {
        await page.getByRole("button", { name: /^edit$/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
        await settle(page, 300)
        await capture(page, "N5.4", { role, state: `${STATE}-editing`, label: "Profile · editing" })
        await page.getByRole("button", { name: /cancel/i }).filter({ visible: true }).first().click({ timeout: 3_000 }).catch(() => {})
      })
    }

    // Journal
    for (const [id, jtab, label] of [["N5.6.1", null, "Devotionals"], ["N5.6.2", "prayers", "Prayers"], ["N5.6.3", "verses", "Verses"]] as const) {
      await attempt(page, id, role, async () => {
        await goHome(page, jtab ? { tab: "profile", section: "journal", jtab } : { tab: "profile", section: "journal" })
        await capture(page, id, { role, state: STATE, label: `Journal · ${label}` })
      })
    }
    coveredBy(page, ["N5.6"], "N5.6.1", role)
    await attempt(page, "N5.6.1", role, async () => {
      await goHome(page, { tab: "profile", section: "journal" })
      await page.getByRole("button", { name: /new|write|add/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N5.6.1", { role, state: `${STATE}-editor`, label: "Journal · devotional editor" })
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: /cancel|close|discard/i }).filter({ visible: true }).first().click({ timeout: 2_000 }).catch(() => {})
    })

    // Give (admin sees edit fields)
    await goHome(page, { tab: "give" })
    await capture(page, "N5.9", { role, state: STATE, label: "Give (admin)" })
  })

  test("congregation as pastor", async ({ page }) => {
    await setRole("admin", "pastor")
    const role: Role = "pastor"
    await goHome(page, { tab: "congregation" })
    await capture(page, "N5.8.1", { role, state: STATE, label: "Congregation · list" })
    coveredBy(page, ["N5.8"], "N5.8.1", role)
    await attempt(page, "N5.8.3", role, async () => {
      const sb = sandbox()
      const { data: q } = await sb.client.from("congregation_questions").select("id").eq("ministry_id", sb.ministryId).eq("question_type", "poll").limit(1).single()
      await goHome(page, { tab: "congregation", cq: q!.id })
      await capture(page, "N5.8.3", { role, state: STATE, label: "Congregation · detail" })
    })
    await attempt(page, "N5.8.2", role, async () => {
      await goHome(page, { tab: "congregation" })
      await page.getByRole("button", { name: /new question|ask|create/i }).filter({ visible: true }).first().click({ timeout: 5_000 }).catch(async () => {
        await page.locator("button[aria-label*='ew question'], button[title*='ew question']").first().click({ timeout: 5_000 })
      })
      await settle(page)
      await capture(page, "N5.8.2", { role, state: STATE, label: "Congregation · create" })
    })
  })
})

test.describe("N5 as member", () => {
  test.use({ storageState: memberState })
  test.afterAll(async () => { await restoreRoles() })
  test("directory, own sheet, profile, give, class-change", async ({ page }) => {
    await setRole("member", "member")
    const role: Role = "member"
    const mobile = isMobile(page)
    await goHome(page, { tab: "directory" })
    await capture(page, mobile ? "N5.2" : "N5.1", { role, state: STATE, label: "Directory (member)" })
    await attempt(page, "N5.3", role, async () => {
      const sb = sandbox()
      const me = await sb.memberUserId()
      await goHome(page, { tab: "directory", member: me })
      if (mobile) { await page.getByText("E2E Member", { exact: true }).filter({ visible: true }).first().click({ timeout: 5_000 }).catch(() => {}); await settle(page) }
      await capture(page, "N5.3", { role, state: `${STATE}-self`, label: "Member sheet (self)" })
    })
    await goHome(page, { tab: "profile" })
    await capture(page, mobile ? "N5.5" : "N5.4", { role, state: STATE, label: "Profile (member)" })
    await goHome(page, { tab: "give" })
    await capture(page, "N5.9", { role, state: STATE, label: "Give (member)" })
    skip(page, "N5.7", role, "Class-change prompt fires on a graduation-year transition; reviewed from code.")
  })
})
