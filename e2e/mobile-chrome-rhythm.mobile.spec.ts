// Phone-width CHROME RHYTHM contract: every mobile screen opens its title at the
// same height. Ratified 2026-08-05 at the SubpageShell/PocketChrome value —
// `POCKET_CHROME_PAD_Y` = 12px above the title, 10px below.
//
// This shipped as four hand-typed copies of the same box and they drifted:
//
//     Home            padTop 14  (--space-6, one step deep)
//     Workspace hub   padTop  0  + a wrapper's 24  → title at 25
//     Events list     padTop  0  + a wrapper's 24  → title at 26
//     Directory       pt-14 (56px)                 → title at 61
//
// …so drilling between screens visibly bounced the title up and down. All four now
// consume the shared constant. This spec is the guard on the CONTRACT, not on any
// one screen: if it fails, a screen has hand-rolled its chrome padding again — fix
// it to use POCKET_CHROME_PAD_Y, never loosen the band.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

const MOBILE = { viewport: { width: 390, height: 844 } } as const

// The title's box starts at the chrome row's 12px content edge. It can sit a few px
// lower when the row is taller than the title itself — a 34px back chevron or avatar
// with `align-items: center` pushes a 22px title down by (34-22)/2 = 6. The band is
// that centering slack and nothing more; 20+ means someone added padding.
const MIN_TOP = 12
const MAX_TOP = 19

async function titleTop(page: Page): Promise<{ top: number; text: string } | null> {
  return page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll("span, div, h1, h2, p"))) {
      const r = el.getBoundingClientRect()
      if (r.top < 0 || r.top > 260 || r.height < 12 || r.width < 40) continue
      const s = getComputedStyle(el)
      if (s.display === "none" || s.visibility === "hidden") continue
      if (parseFloat(s.fontSize) < 19) continue
      const text = (el.textContent ?? "").trim()
      if (!text || el.children.length > 1) continue
      return { top: Math.round(r.top), text: text.slice(0, 30) }
    }
    return null
  })
}

async function expectRhythm(page: Page, label: string) {
  const t = await titleTop(page)
  expect(t, `${label}: no header title found — navigation missed, not a pass`).not.toBeNull()
  expect(
    t!.top,
    `${label}: header title "${t!.text}" starts at ${t!.top}px; the chrome row is 12px ` +
    `(POCKET_CHROME_PAD_Y) so it must land in [${MIN_TOP}, ${MAX_TOP}]`,
  ).toBeGreaterThanOrEqual(MIN_TOP)
  expect(t!.top).toBeLessThanOrEqual(MAX_TOP)
}

test.describe("mobile chrome rhythm (one 12px top gap, every screen)", () => {
  test.use({ storageState: adminState, ...MOBILE })

  let teamId = ""
  let eventTitle = ""
  // Seeded, not discovered: a skipped test proves nothing, and this file's whole
  // job is to catch a screen drifting off the shared rhythm.
  let financeTeamId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const { data: ev } = await sb.client
      .from("calendar_events").select("title, team_id")
      .eq("ministry_id", sb.ministryId).not("team_id", "is", null).is("parent_event_id", null)
      .order("start_date", { ascending: false }).limit(1).maybeSingle()
    if (ev) { teamId = (ev as { team_id: string }).team_id; eventTitle = (ev as { title: string }).title }

    const adminId = await sb.adminUserId()
    const { data: team } = await sb.client
      .from("teams")
      .insert({ ministry_id: sb.ministryId, name: `${E2E_PREFIX}Rhythm Finance`, description: "e2e", team_type: "finance", created_by: adminId })
      .select("id").single()
    if (team) {
      financeTeamId = (team as { id: string }).id
      const { data: role } = await sb.client
        .from("team_roles")
        .insert({ team_id: financeTeamId, name: "Treasurer", permissions: ["can_view_finances"], is_president: true })
        .select("id").single()
      if (role) {
        await sb.client.from("team_members")
          .insert({ team_id: financeTeamId, user_id: adminId, role_id: (role as { id: string }).id, added_by: adminId })
      }
    }
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (financeTeamId) {
      await sb.client.from("team_members").delete().eq("team_id", financeTeamId)
      await sb.client.from("team_roles").delete().eq("team_id", financeTeamId)
      await sb.client.from("teams").delete().eq("id", financeTeamId)
    }
  })

  test("every tab root opens its title at the same height", async ({ page }) => {
    test.setTimeout(180_000)
    for (const [tab, label] of [
      ["home", "Home"], ["announcements", "Announcements"], ["chats", "Chats"],
      ["directory", "Directory"], ["profile", "Profile"], ["settings", "Church settings"],
      ["give", "Give"], ["forms", "Forms"], ["network", "Network"], ["plan", "Plan picker"],
    ] as const) {
      await page.goto(`/home?tab=${tab}`)
      await page.waitForTimeout(1800)
      await expectRhythm(page, label)
    }
  })

  test("drilled-in plan screens hold the same height as the roots", async ({ page }) => {
    test.setTimeout(180_000)
    test.skip(!teamId, "no team-owned event in this lane's sandbox")

    await page.goto(`/home?tab=plan&team=${teamId}`)
    await page.waitForTimeout(2500)
    await expectRhythm(page, "team hub")

    const events = page.getByText("Events", { exact: true }).filter({ visible: true }).first()
    if (await events.count()) { await events.click(); await page.waitForTimeout(1800) }
    await expectRhythm(page, "events list")

    const card = page.getByText(eventTitle, { exact: true }).filter({ visible: true }).first()
    await card.waitFor({ state: "visible", timeout: 25_000 })
    await card.click()
    await page.getByText("Jump into planning", { exact: true }).filter({ visible: true }).first()
      .waitFor({ state: "visible", timeout: 25_000 })
    await expectRhythm(page, "event hub")

    await page.getByText("Overview", { exact: true }).filter({ visible: true }).first().click()
    await page.waitForTimeout(1500)
    await expectRhythm(page, "Overview spoke")
  })

  // Finance drills through a DIFFERENT component than the event workspace, and it
  // was the gap this spec missed on its first pass: its sections used a short
  // `PocketBackRow` labelled with the TEAM name, so the header both shrank and read
  // "Finance" on every section. Covered explicitly now — a contract only holds over
  // the screens the test actually walks.
  test("finance sections hold the rhythm and name themselves", async ({ page }) => {
    test.setTimeout(180_000)
    test.skip(!financeTeamId, "finance team could not be seeded")

    await page.goto(`/home?tab=plan&team=${financeTeamId}`)
    await page.waitForTimeout(2500)
    await expectRhythm(page, "finance hub")

    for (const section of ["Allocation", "Budget", "Reimbursements"] as const) {
      const row = page.getByText(section, { exact: true }).filter({ visible: true }).first()
      await row.waitFor({ state: "visible", timeout: 20_000 })
      await row.click()
      await page.waitForTimeout(1600)
      await expectRhythm(page, `finance → ${section}`)

      // …and the header must name the SECTION, not the team it belongs to.
      const t = await titleTop(page)
      expect(t?.text, `finance → ${section}: header should say "${section}", not the team name`)
        .toContain(section)

      await page.getByLabel(/^Back$|^Back to /).filter({ visible: true }).first().click()
        .catch(async () => { await page.goBack() })
      await page.waitForTimeout(1400)
    }
  })
})
