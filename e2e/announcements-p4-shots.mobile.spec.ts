// Phase-4 (Announcements family) mobile screenshot capture + draft-visibility
// proof. Seeds a published event, a published update, and a DRAFT (author =
// admin) in the sandbox, then screenshots the four Announcements surfaces at
// 390×844 and exercises the RSVP round-trip + draft resume. A nested member-
// session block proves the app hides drafts from members on the feed AND Home,
// while a raw member-authed Supabase query proves the announcements RLS itself
// still returns the draft row (app-code WHERE clauses are the sole gate — see
// build-report-p4.md). Evidence + assertions; shots guarded on ANN_SHOT_DIR.
import { test, expect, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { sandbox, E2E_PREFIX, memberState } from "./fixtures"

const SHOT_DIR = process.env.ANN_SHOT_DIR

async function shot(page: Page, name: string) {
  if (!SHOT_DIR) return
  await page.screenshot({ path: `${SHOT_DIR}/ann-${name}.png`, fullPage: false })
}
function vis(page: Page, text: string, exact = true) {
  return page.getByText(text, { exact }).filter({ visible: true })
}

const EVENT = `${E2E_PREFIX}P4 Fall Retreat`
const UPDATE = `${E2E_PREFIX}P4 Parking Lot Closed`
const DRAFT = `${E2E_PREFIX}P4 Draft Winter Conference`

let eventId = ""
let draftId = ""

test.describe("mobile Announcements family (P4) screenshots", () => {
  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    // A published event (future-dated so the detail EVENT card renders a date),
    // a published non-event update, and a DRAFT authored by the admin/leader.
    const ev = await sb.createAnnouncement({
      title: EVENT, body: "Join us for a weekend of worship and rest at Laurel Ridge. Buses leave Friday at 5pm.",
      is_event: true, event_date: new Date(Date.now() + 12 * 864e5).toISOString(), created_by: adminId,
    })
    eventId = ev.id
    await sb.createAnnouncement({
      title: UPDATE, body: "The east lot is closed this Sunday for repaving — please use the garage on Fifth.",
      created_by: adminId,
    })
    // Draft — inserted directly (the createAnnouncement fixture is published-only).
    // Newest created_at so, pre-fix, it would have been the Home up-next fallback.
    const { data: draft, error } = await sb.client
      .from("announcements")
      .insert({ title: DRAFT, body: "Save the date — details to follow once the venue is confirmed.", is_event: false, audience: "all", status: "draft", ministry_id: sb.ministryId, created_by: adminId })
      .select("id").single()
    if (error) throw error
    draftId = draft.id
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.deleteAnnouncementsByPrefix()
  })

  test("feed — DRAFTS tray + published cards (leader)", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await expect(vis(page, "Announcements").first()).toBeVisible({ timeout: 15000 })
    await expect(vis(page, "Drafts").first()).toBeVisible({ timeout: 15000 })
    await expect(vis(page, DRAFT, false).first()).toBeVisible({ timeout: 15000 })
    await expect(vis(page, EVENT, false).first()).toBeVisible({ timeout: 15000 })
    await shot(page, "feed-all")
  })

  test("feed — Events filter", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await expect(vis(page, EVENT, false).first()).toBeVisible({ timeout: 15000 })
    await page.getByRole("button", { name: "Events", exact: true }).filter({ visible: true }).first().click()
    await expect(vis(page, EVENT, false).first()).toBeVisible({ timeout: 10000 })
    await expect(vis(page, UPDATE, false)).toHaveCount(0)
    await shot(page, "feed-events")
  })

  test("detail — RSVP round-trip (toggle twice)", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await vis(page, EVENT, false).first().click()
    // Detail body (serif 17) + EVENT card render.
    await expect(vis(page, "weekend of worship", false).first()).toBeVisible({ timeout: 15000 })
    await shot(page, "detail")
    // Toggle on → "Going", toggle off → back to "RSVP" (Convention #10 toggle).
    const rsvp = page.getByRole("button", { name: "RSVP", exact: true }).filter({ visible: true }).first()
    await rsvp.click()
    await expect(vis(page, "Going — tap to undo", false).first()).toBeVisible({ timeout: 10000 })
    await shot(page, "detail-going")
    await vis(page, "Going — tap to undo", false).first().click()
    await expect(page.getByRole("button", { name: "RSVP", exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
  })

  test("compose — full-screen New announcement", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await page.getByRole("button", { name: "New announcement" }).filter({ visible: true }).first().click()
    await expect(vis(page, "Headline").first()).toBeVisible({ timeout: 10000 })
    await expect(vis(page, "Audience").first()).toBeVisible({ timeout: 10000 })
    await shot(page, "compose")
  })

  test("draft resume — tapping a draft card opens the composer", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await vis(page, DRAFT, false).first().click()
    // Editing surface with the draft's headline pre-filled, and a Publish action.
    await expect(page.locator(`input[value="${DRAFT}"]`).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button", { name: "Publish", exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 })
    await shot(page, "draft-resume")
  })

  // ── Member draft-invisibility (the ratified feature's hard requirement) ──────
  test.describe("member state — drafts are invisible", () => {
    test.use({ storageState: memberState })

    test("draft hidden on the member Announcements feed", async ({ page }) => {
      await page.goto("/home?tab=announcements")
      await expect(vis(page, EVENT, false).first()).toBeVisible({ timeout: 15000 })
      await expect(vis(page, "Drafts")).toHaveCount(0)
      await expect(vis(page, DRAFT, false)).toHaveCount(0)
      await shot(page, "member-feed")
    })

    test("draft hidden on the member Home (hero / digest / up-next)", async ({ page }) => {
      await page.goto("/home?tab=home")
      await expect(page.locator("body")).toBeVisible({ timeout: 15000 })
      await page.waitForTimeout(1500)
      await expect(vis(page, DRAFT, false)).toHaveCount(0)
      await shot(page, "member-home")
    })

    test("RLS still returns the draft to a member — app-code is the sole gate", async () => {
      // Proves the announcements SELECT policy is ministry-scoped only (does NOT
      // gate on status): a member-authed query DOES return the draft row. The UI
      // never surfaces it because every app read path filters status. Documented
      // as a defense-in-depth gap for the rls-reviewer in build-report-p4.md.
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const email = process.env.E2E_MEMBER_EMAIL!
      const password = process.env.E2E_PASSWORD!
      const c = createClient(url, anon)
      const { error: signErr } = await c.auth.signInWithPassword({ email, password })
      expect(signErr).toBeNull()
      const { data, error } = await c.from("announcements").select("id, status").eq("id", draftId).maybeSingle()
      expect(error).toBeNull()
      // The row IS readable at the DB level (RLS is status-agnostic) — confirming
      // the app WHERE clauses are load-bearing, not redundant.
      expect(data?.status).toBe("draft")
      await c.auth.signOut()
    })
  })
})
