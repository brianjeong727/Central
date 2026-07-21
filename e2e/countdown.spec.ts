// Click-through coverage for the Countdown tab (feat/run-sheet-countdown).
//
// Countdown REPLACED the old Checklist tab: the same event_tasks data
// re-presented as a T-minus timeline with three augmentations — trigger badges
// (nudge state), playbook whispers (event_tasks.brief), and load-aware reassign
// — plus a right rail (Readiness · Reminder schedule · Load this month). The day-of
// "Run of show" tab was renamed "Showtime". New file app/home/tabs/countdown-tab.tsx,
// wired into app/home/tabs/plan-tab.tsx.
//
// This spec drives the SEEDED E2E-sandbox fixture (team "Student Org Board",
// event "Summer Retreat 2026", 8 T-minus tasks — 2 done/fired, 1 overdue, 3+
// briefs; load E2E Admin 6 · E2E Member 0) exactly as a leader would: enter the
// team workspace on desktop, open the event plan, click the Countdown sub-tab,
// and assert every augmentation renders + the reused CRUD still works. It does
// NOT create the fixture (Brian seeded it); it only toggles/adds and restores.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

// Seeded fixture ids (E2E sandbox tenant). Deep-link ?team= is honored by
// home-app (activeTeamId inits from the URL); the event itself is opened by a
// click since its id is not URL-synced.
const TEAM_ID = "63a47f06-fdc2-49e1-9703-9ee5dca1ccae"
const EVENT_ID = "7eaa840d-c666-4d69-a345-4b2fb136da91"
const EVENT_TITLE = "Summer Retreat 2026"
const OVERDUE_TITLE = "Collect dietary restrictions & allergies"
const TOGGLE_TITLE = "Confirm final headcount with the center"
const DONE_TITLE = "Book retreat center & sign contract"
const PROBE_TITLE = "E2E:: probe countdown task"

function watchConsole(page: Page) {
  const errors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`)
  })
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  return errors
}

test.describe("Countdown tab (feat/run-sheet-countdown)", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  let planId: string
  let toggleTaskId: string

  test.beforeAll(async () => {
    const sb = sandbox()
    const { data: plan, error: pe } = await sb.client
      .from("event_plans").select("id").eq("calendar_event_id", EVENT_ID).single()
    if (pe) throw pe
    planId = (plan as { id: string }).id
    const { data: hc, error: he } = await sb.client
      .from("event_tasks").select("id").eq("event_plan_id", planId).eq("title", TOGGLE_TITLE).single()
    if (he) throw he
    toggleTaskId = (hc as { id: string }).id
  })

  test.afterAll(async () => {
    // Restore the seed exactly: un-complete the toggled task, drop any probe adds.
    const sb = sandbox()
    if (toggleTaskId) await sb.client.from("event_tasks").update({ completed: false, completed_at: null }).eq("id", toggleTaskId)
    if (planId) await sb.client.from("event_tasks").delete().eq("event_plan_id", planId).like("title", "E2E::%")
  })

  // Enter the workspace → open the event plan → land on the Countdown sub-tab.
  async function openCountdown(page: Page) {
    await page.goto(`/home?tab=plan&team=${TEAM_ID}`)
    // Desktop student-org landing is the Events agenda; click the agenda CARD
    // (its heading) to open the plan — not the sidebar nav item of the same name.
    const eventCard = page.getByRole("heading", { name: EVENT_TITLE }).first()
    await expect(eventCard).toBeVisible({ timeout: 20_000 })
    await eventCard.click()
    // Plan workspace opens (Overview). The underline sub-tab strip carries the
    // renamed labels; click Countdown.
    const countdownTab = page.getByRole("button", { name: "Countdown", exact: true })
    await expect(countdownTab).toBeVisible()
    await countdownTab.click()
    await expect.poll(() => page.url()).toContain("evtab=checklist")
  }

  test("Countdown timeline, augmentations, right rail, and reused CRUD all work", async ({ page }) => {
    const errors = watchConsole(page)
    await openCountdown(page)

    // ── Tab labels: Countdown (not Checklist) + Showtime (not Run of show) ──
    await expect(page.getByRole("button", { name: "Countdown", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Showtime", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Checklist", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Run of show", exact: true })).toHaveCount(0)

    // ── Phase group headers + timeline rows ──
    await expect(page.getByText(/WEEKS/).first()).toBeVisible()   // T−4/T−3 WEEKS
    await expect(page.getByText(/DAYS/).first()).toBeVisible()    // T−2 DAYS
    // "· this week" marker now sits on the phase holding the NEXT upcoming deadline
    // — T−3 WEEKS in the seed (next due 07-17) — never a fully-past bucket.
    await expect(page.getByText(/3 WEEKS.*this week/).first()).toBeVisible()
    await expect(page.getByText(OVERDUE_TITLE, { exact: true })).toBeVisible()
    await expect(page.getByText(TOGGLE_TITLE, { exact: true })).toBeVisible()
    await expect(page.getByText(DONE_TITLE, { exact: true })).toBeVisible()
    await expect(page.getByText("Confirm-taps to all drivers & leads", { exact: true })).toBeVisible()

    // ── Trigger badges ──
    // overdue (red-outline) — genuine escalation, computed from due<today (no ledger).
    await expect(page.getByText(/Nudged 2.*no reply/).first()).toBeVisible()
    // armed (upcoming auto-fire) — computed from due dates; several rows carry it.
    await expect(page.getByText(/Auto-DM fires/).first()).toBeVisible()
    // fired (ledger) — REGRESSION CHECK for the new notification_ledger SELECT policy.
    // With the policy live, the client read returns the 3 seeded rows, so fired pills
    // ("Auto-DM sent") now light. Key case: "Finalize transportation" is INCOMPLETE
    // yet ledger-fired → it must show FIRED, not the armed "Auto-DM fires …".
    await expect(page.getByText("Auto-DM sent").filter({ visible: true }).first()).toBeVisible()
    const finalizeRow = page.getByText("Finalize transportation & confirm drivers", { exact: true })
      .filter({ visible: true }).first().locator("xpath=ancestor::div[1]")
    await expect(finalizeRow.getByText("Auto-DM sent")).toBeVisible()
    await expect(finalizeRow.getByText(/Auto-DM fires/)).toHaveCount(0)

    // done row struck through — driven by task.completed, independent of the badge.
    const doneTitle = page.getByText(DONE_TITLE, { exact: true })
    await expect(doneTitle).toHaveCSS("text-decoration-line", "line-through")

    // ── Playbook whisper (event_tasks.brief on a cream-3 callout) ──
    await expect(page.getByText(/severe allergy surfaced on-site/).first()).toBeVisible()

    // ── Right rail: Readiness · Reminder schedule · Load this month (scope to the <aside>) ──
    const rail = page.getByRole("complementary")
    await expect(rail.getByText("Readiness")).toBeVisible()
    await expect(rail.getByText("2 of 8 done")).toBeVisible()
    await expect(rail.getByText(/Reminder schedule/)).toBeVisible()
    const loadCard = rail.locator("div").filter({ hasText: /^Load this month/ }).last()
    await expect(loadCard).toBeVisible()
    await expect(loadCard.getByText("E2E Admin").first()).toBeVisible() // sole load row → top
    await expect(loadCard.getByText("6", { exact: true })).toBeVisible() // its open-task count

    // ── Screenshots (evidence for Brian) — captured pre-mutation for clean shots ──
    await page.screenshot({ path: ".claude/task-context/countdown/shots/countdown-desktop-1440.png", fullPage: true })
    // Resize into the phone breakpoint (isMobile is viewport-driven). A live
    // resize lands on the mobile event HUB (the desktop tab selection doesn't
    // carry across the breakpoint flip), so drill into the Countdown row to reach
    // the mobile timeline, then screenshot it.
    await page.setViewportSize({ width: 390, height: 844 })
    const hubCountdownRow = page.getByText("Countdown", { exact: true }).filter({ visible: true }).first()
    await expect(hubCountdownRow).toBeVisible()
    await hubCountdownRow.click()
    await expect(page.getByText("COUNTDOWN", { exact: true }).filter({ visible: true }).first()).toBeVisible() // mobile PocketKicker
    await expect(page.getByText(/WEEKS/).filter({ visible: true }).first()).toBeVisible()
    await page.screenshot({ path: ".claude/task-context/countdown/shots/countdown-mobile-390.png", fullPage: true })
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole("button", { name: "Countdown", exact: true })).toBeVisible()

    // ── Reassign-by-load popover, now anchored INSIDE the overdue row's meta cluster
    //    (button renamed "Reassign by load" → "Reassign"). Open + assert, do NOT pick. ──
    const overdueRow = page.getByText(OVERDUE_TITLE, { exact: true })
      .filter({ visible: true }).first().locator("xpath=ancestor::div[1]")
    const reassignBtn = overdueRow.getByRole("button", { name: "Reassign", exact: true })
    await expect(reassignBtn).toBeVisible() // anchored in the row (proves it's not a detached button)
    await reassignBtn.click()
    await expect(page.getByText("Lightest load first")).toBeVisible()
    await expect(page.getByText("E2E Member", { exact: true }).first()).toBeVisible() // low-load suggestion
    await expect(page.getByText("0 open").first()).toBeVisible()                       // E2E Member = 0
    await page.keyboard.press("Escape")
    await expect(page.getByText("Lightest load first")).toHaveCount(0)

    // NOTE: the desktop + mobile trees are BOTH mounted (Tailwind hides one via
    // CSS), so scope CRUD locators to the visible (desktop) tree + the rail.
    const rail2 = page.getByRole("complementary") // desktop-only <aside>

    // ── Reused CRUD #1: toggle a task complete (optimistic + persisted), then restore ──
    const toggleTitle = page.getByText(TOGGLE_TITLE, { exact: true }).filter({ visible: true }).first()
    const toggleCheckbox = toggleTitle.locator("xpath=ancestor::div[1]/button[1]")
    await expect(toggleCheckbox).toBeEnabled()
    await toggleCheckbox.click()
    await expect(rail2.getByText("3 of 8 done")).toBeVisible()            // readiness updated
    await expect.poll(async () => {                                        // persisted to DB
      const sb = sandbox()
      const { data } = await sb.client.from("event_tasks").select("completed").eq("id", toggleTaskId).single()
      return (data as { completed: boolean } | null)?.completed
    }, { timeout: 10_000 }).toBe(true)
    await toggleCheckbox.click()                                          // restore
    await expect(rail2.getByText("2 of 8 done")).toBeVisible()

    // ── Reused CRUD #2: inline add-row per phase → new row appears ──
    const addInput = page.getByPlaceholder(/^Add to/).filter({ visible: true }).first()
    await addInput.click()
    await addInput.fill(PROBE_TITLE)
    await page.getByRole("button", { name: "Add", exact: true }).filter({ visible: true }).first().click()
    await expect(page.getByText(PROBE_TITLE, { exact: true }).filter({ visible: true }).first()).toBeVisible()

    // No uncaught console / page errors across the whole Countdown flow.
    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })
})
