// N3 — Announcements & Forms. Feed at both widths as leader-tier (admin) and
// member; the create/edit modal; detail with the event / form / ack asides;
// forms list, builder, fill, responses.
import { test } from "@playwright/test"
import { adminState, memberState, sandbox } from "../e2e/fixtures"
import { attempt, capture, coveredBy, goHome, isMobile, restoreRoles, setRole, settle, skip, STATE, vis, type Role } from "./lib"

test.describe.configure({ mode: "serial" })

async function announcementIds() {
  const sb = sandbox()
  const { data } = await sb.client.from("announcements").select("id,title,is_event,requires_ack,status").eq("ministry_id", sb.ministryId).order("created_at", { ascending: false })
  const rows = data ?? []
  return {
    event: rows.find(a => a.is_event && a.status === "published")?.id,
    ack: rows.find(a => a.requires_ack)?.id,
    plain: rows.find(a => !a.is_event && !a.requires_ack && a.status === "published")?.id,
    withForm: (await sb.client.from("announcement_forms").select("announcement_id").eq("ministry_id", sb.ministryId).not("announcement_id", "is", null).limit(1).maybeSingle()).data?.announcement_id,
  }
}

test.describe("N3 as admin (leader-tier)", () => {
  test.use({ storageState: adminState })
  test.afterAll(async () => { await restoreRoles() })

  test("feed, filters, create, detail, forms", async ({ page }) => {
    await setRole("admin", "admin")
    const role: Role = "admin"
    const mobile = isMobile(page)
    const ids = await announcementIds()

    await goHome(page, { tab: "announcements" })
    await capture(page, mobile ? "N3.2" : "N3.1", { role, state: STATE, label: "Announcements feed" })
    coveredBy(page, ["N3.3"], mobile ? "N3.2" : "N3.1", role)

    // Filters.
    await attempt(page, `${mobile ? "N3.2" : "N3.1"}`, role, async () => {
      const filter = mobile ? page.getByRole("button", { name: /^events$/i }).filter({ visible: true }).first() : page.getByRole("button", { name: /^all$/i }).filter({ visible: true }).first()
      await filter.click({ timeout: 5_000 })
      await settle(page, 300)
      if (!mobile) { await page.getByRole("menuitem", { name: /events/i }).filter({ visible: true }).first().click({ timeout: 4_000 }).catch(() => page.getByText(/^events$/i).filter({ visible: true }).first().click()) ; await settle(page, 300) }
      await capture(page, mobile ? "N3.2" : "N3.1", { role, state: `${STATE}-events-filter`, label: "Feed · Events filter" })
    })
    if (!mobile) {
      await attempt(page, "N3.1", role, async () => {
        await goHome(page, { tab: "announcements" })
        await page.locator('[aria-label="Announcement layout"] button, [aria-label="Announcement layout"] [role="radio"], [aria-label="Announcement layout"] [role="tab"]').filter({ visible: true }).nth(1).click({ timeout: 4_000 })
        await settle(page, 300)
        await capture(page, "N3.1", { role, state: `${STATE}-list-layout`, label: "Feed · list layout" })
      })
    }

    // Create modal.
    await attempt(page, "N3.4", role, async () => {
      await goHome(page, { tab: "announcements" })
      const btn = mobile ? page.locator('button[aria-label="New announcement"], button[title="New announcement"]').filter({ visible: true }).first() : page.getByRole("button", { name: /new announcement/i }).filter({ visible: true }).first()
      await btn.click({ timeout: 6_000 }).catch(() => page.getByRole("button", { name: /new|create|\+/i }).filter({ visible: true }).first().click())
      await settle(page)
      await capture(page, "N3.4", { role, state: STATE, label: "Create announcement" })
      // Reveal the event fields.
      await page.getByText(/this is an event/i).filter({ visible: true }).first().click({ timeout: 4_000 }).catch(() => {})
      await settle(page, 300)
      await capture(page, "N3.4", { role, state: `${STATE}-event-on`, label: "Create announcement · event options" })
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: /discard|close|cancel/i }).filter({ visible: true }).first().click({ timeout: 2_000 }).catch(() => {})
    })

    // Details.
    for (const [key, id, label] of [["event", ids.event, "event"], ["ack", ids.ack, "acknowledgment"], ["withForm", ids.withForm, "with form"], ["plain", ids.plain, "plain"]] as const) {
      await attempt(page, "N3.5", role, async () => {
        if (!id) throw new Error(`no ${key} announcement seeded`)
        await goHome(page, { tab: "announcements", ann: id })
        await capture(page, "N3.5", { role, state: `${STATE}-${label.replace(/\s/g, "-")}`, label: `Announcement detail · ${label}` })
      })
    }
    await attempt(page, "N3.5.1", role, async () => {
      if (!ids.ack) throw new Error("no ack announcement")
      await goHome(page, { tab: "announcements", ann: ids.ack })
      await page.getByText(/haven.t|hasn.t|acknowledged/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N3.5.1", { role, state: STATE, label: "Who hasn't acknowledged", foldOnly: true })
      await page.keyboard.press("Escape")
    })
    // Edit variant via kebab on a card.
    await attempt(page, "N3.4", role, async () => {
      await goHome(page, { tab: "announcements" })
      const kebab = page.locator('button[aria-label="More actions"], button[title="More actions"]').filter({ visible: true }).first()
      await kebab.click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N3.3", { role, state: `${STATE}-kebab`, label: "Card action menu", foldOnly: true })
      await page.getByRole("menuitem", { name: /edit/i }).filter({ visible: true }).first().click({ timeout: 4_000 }).catch(() => page.getByText(/^edit$/i).filter({ visible: true }).first().click())
      await settle(page)
      await capture(page, "N3.4", { role, state: `${STATE}-edit`, label: "Edit announcement" })
      await page.keyboard.press("Escape")
    })

    // Forms.
    await goHome(page, { tab: "forms" })
    await capture(page, "N3.7", { role, state: STATE, label: "Forms list" })
    await attempt(page, "N3.8", role, async () => {
      const btn = mobile ? page.locator("button[aria-label*='reate'], button[title*='reate'], button[aria-label*='ew form']").first() : page.getByRole("button", { name: /create form/i }).filter({ visible: true }).first()
      await btn.click({ timeout: 6_000 })
      await settle(page)
      await capture(page, "N3.8", { role, state: STATE, label: "Form builder (new)" })
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: /discard|close|cancel/i }).filter({ visible: true }).first().click({ timeout: 2_000 }).catch(() => {})
    })
    await attempt(page, "N3.8", role, async () => {
      await goHome(page, { tab: "forms" })
      await page.getByRole("button", { name: /^edit$/i }).filter({ visible: true }).first().click({ timeout: 6_000 })
      await settle(page)
      await capture(page, "N3.8", { role, state: `${STATE}-edit-locked`, label: "Form builder (edit, has responses)" })
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: /discard|close|cancel/i }).filter({ visible: true }).first().click({ timeout: 2_000 }).catch(() => {})
    })
    await attempt(page, "N3.10", role, async () => {
      const sb = sandbox()
      const { data: f } = await sb.client.from("announcement_forms").select("id").eq("ministry_id", sb.ministryId).eq("title", "Fall Retreat sign-up").maybeSingle()
      if (!f) throw new Error("no retreat form")
      await goHome(page, { tab: "forms", fresp: f.id })
      await capture(page, "N3.10", { role, state: STATE, label: "Form responses" })
      if (mobile) {
        await page.getByRole("button", { name: /summary/i }).filter({ visible: true }).first().click({ timeout: 4_000 })
        await settle(page, 300)
        await capture(page, "N3.10", { role, state: `${STATE}-summary`, label: "Form responses · summary" })
      }
    })
    skip(page, "N3.6", role, "/announcements/<id> is a redirect stub to the tab — nothing renders.")
  })
})

test.describe("N3 as member", () => {
  test.use({ storageState: memberState })
  test.afterAll(async () => { await restoreRoles() })

  test("feed, detail, form fill", async ({ page }) => {
    await setRole("member", "member")
    const role: Role = "member"
    const mobile = isMobile(page)
    const ids = await announcementIds()
    await goHome(page, { tab: "announcements" })
    await capture(page, mobile ? "N3.2" : "N3.1", { role, state: STATE, label: "Announcements feed (member)" })
    await attempt(page, "N3.5", role, async () => {
      if (!ids.event) throw new Error("no event announcement")
      await goHome(page, { tab: "announcements", ann: ids.event })
      await capture(page, "N3.5", { role, state: `${STATE}-event`, label: "Announcement detail · event (member)" })
    })
    await attempt(page, "N3.9", role, async () => {
      if (!ids.withForm) throw new Error("no form announcement")
      await goHome(page, { tab: "announcements", ann: ids.withForm })
      await capture(page, "N3.5", { role, state: `${STATE}-with-form`, label: "Announcement detail · with form (member)" })
      await page.getByText(/fill out form/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N3.9", { role, state: STATE, label: "Form fill" })
      await page.keyboard.press("Escape")
    })
    await attempt(page, "N3.5", role, async () => {
      if (!ids.ack) throw new Error("no ack announcement")
      await goHome(page, { tab: "announcements", ann: ids.ack })
      await capture(page, "N3.5", { role, state: `${STATE}-ack`, label: "Announcement detail · ack (member)" })
    })
  })
})
