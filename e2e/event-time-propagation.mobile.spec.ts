// Phone-width (390×844) coverage for the SAME fix as event-time-propagation.spec.ts.
//
// This viewport matters specifically: before 016069e the "Edit event" affordance
// was gated behind an `onEditEvent` prop that PlanTab passed ONLY to the desktop
// StudentOrgTeamHome instance, so mobile had no Edit at all. Moving the modal
// inside the component exposed it on BOTH viewports — this spec is the first time
// that mobile button has ever been exercised.
//
// TIMEZONE CONVENTION (current — same as the desktop spec): `start_date`/`end_date`
// hold TRUE INSTANTS; a time typed into the modal is a wall clock in the MINISTRY's
// zone (`ministries.timezone`), converted through `lib/tz.ts`, and every surface —
// the modal's own read-back included — renders it back in that same zone. So the
// wall clocks below are the constants and the expected instant is derived at run
// time: a hardcoded `+00:00`/`-04:00` literal would break the moment the ministry
// crosses into EST.
import { test, expect, type Page, type Locator } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"
import { resolveMinistryTimezone, zonedTimeToISO } from "../lib/tz"

const TEAM_ID = "63a47f06-fdc2-49e1-9703-9ee5dca1ccae"
const PARENT_TITLE = `${E2E_PREFIX}TP Mobile Week`
const CHILD_TITLE = `${E2E_PREFIX}TP Mobile Child`
// Fixture baseline as MINISTRY-ZONE WALL CLOCKS.
const PARENT_START_LOCAL = { ymd: "2026-08-03", hhmm: "14:00" }
const PARENT_END_LOCAL = { ymd: "2026-08-07", hhmm: "20:00" }
const CHILD_START_LOCAL = { ymd: "2026-08-04", hhmm: "16:00" }
const CHILD_END_LOCAL = { ymd: "2026-08-04", hhmm: "18:00" }

/** The sandbox ministry's IANA zone, read from the DB in beforeAll. */
let zone = ""
/** A ministry-zone wall clock → the instant the timestamptz column holds. */
const at = (ymd: string, hhmm: string) => zonedTimeToISO(ymd, hhmm, zone)
const atLocal = (w: { ymd: string; hhmm: string }) => at(w.ymd, w.hhmm)
/** PostgREST returns "+00:00", `lib/tz.ts` returns "Z" — compare the instants. */
const iso = (v: string) => new Date(v).toISOString()

const SHOTS = ".claude/task-context/event-time-propagation/shots"

let parentId = ""
let childId = ""
let parentPlanId = ""
let childPlanId = ""

function vis(l: Locator) { return l.filter({ visible: true }).first() }
function fieldInput(page: Page, label: string) {
  return vis(page.getByText(label, { exact: true })).locator("xpath=..").locator("input").first()
}
async function expectModalOpen(page: Page) {
  await expect(vis(page.getByText("Title *", { exact: true }))).toBeVisible({ timeout: 15_000 })
}
async function expectModalClosed(page: Page) {
  await expect(page.getByText("Title *", { exact: true }).filter({ visible: true })).toHaveCount(0, { timeout: 20_000 })
}
async function readEvent(id: string) {
  const sb = sandbox()
  const { data, error } = await sb.client.from("calendar_events").select("id, start_date, end_date").eq("id", id).single()
  if (error) throw error
  return data as { id: string; start_date: string; end_date: string }
}

test.describe("event time propagation — mobile Edit affordance (016069e)", () => {
  test.use({ storageState: adminState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    // The zone is a property of the MINISTRY, so read it rather than assume it.
    const { data: min, error: ze } = await sb.client
      .from("ministries").select("timezone").eq("id", sb.ministryId).single()
    if (ze) throw ze
    zone = resolveMinistryTimezone((min as { timezone: string | null }).timezone)

    const { data: parent, error: pe } = await sb.client.from("calendar_events").insert({
      ministry_id: sb.ministryId, team_id: TEAM_ID, title: PARENT_TITLE,
      description: "e2e mobile parent", location: "E2E Hall",
      start_date: atLocal(PARENT_START_LOCAL), end_date: atLocal(PARENT_END_LOCAL), all_day: false,
      category: "welcoming", event_type: "welcome_week", recurring: false, created_by: adminId,
    }).select("id").single()
    if (pe) throw pe
    parentId = (parent as { id: string }).id

    const { data: child, error: ce } = await sb.client.from("calendar_events").insert({
      ministry_id: sb.ministryId, team_id: null, parent_event_id: parentId, title: CHILD_TITLE,
      description: "e2e mobile child", location: "E2E Room",
      start_date: atLocal(CHILD_START_LOCAL), end_date: atLocal(CHILD_END_LOCAL), all_day: false,
      category: "social", event_type: "social", recurring: false, created_by: adminId,
    }).select("id").single()
    if (ce) throw ce
    childId = (child as { id: string }).id

    for (const [evId, which] of [[parentId, "p"], [childId, "c"]] as const) {
      const { data: plan, error } = await sb.client.from("event_plans")
        .insert({ ministry_id: sb.ministryId, calendar_event_id: evId, created_by: adminId })
        .select("id").single()
      if (error) throw error
      if (which === "p") parentPlanId = (plan as { id: string }).id
      else childPlanId = (plan as { id: string }).id
    }
  })

  test.afterAll(async () => {
    const sb = sandbox()
    for (const id of [childPlanId, parentPlanId]) {
      if (!id) continue
      await sb.client.from("event_tasks").delete().eq("event_plan_id", id)
      await sb.client.from("event_roles").delete().eq("event_plan_id", id)
      await sb.client.from("event_plans").delete().eq("id", id)
    }
    for (const id of [childId, parentId]) if (id) await sb.client.from("calendar_events").delete().eq("id", id)
  })

  test("mobile: drill parent → sub-event → Overview → Edit writes the CHILD", async ({ page }) => {
    const sb = sandbox()
    await sb.client.from("calendar_events").update({ start_date: atLocal(CHILD_START_LOCAL), end_date: atLocal(CHILD_END_LOCAL) }).eq("id", childId)
    await sb.client.from("calendar_events").update({ start_date: atLocal(PARENT_START_LOCAL), end_date: atLocal(PARENT_END_LOCAL) }).eq("id", parentId)
    const parentBefore = await readEvent(parentId)

    await page.goto(`/home?tab=plan&team=${TEAM_ID}`)

    // Team hub → Events spoke.
    await vis(page.getByRole("button", { name: /Events/ })).click()
    await expect(vis(page.getByText(PARENT_TITLE, { exact: true }))).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: `${SHOTS}/mobile-390-01-events-timeline.png`, fullPage: false, animations: "disabled" })

    // Parent event hub.
    await vis(page.getByText(PARENT_TITLE, { exact: true })).click()
    await expect(vis(page.getByText("Jump into planning", { exact: true }))).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: `${SHOTS}/mobile-390-02-parent-event-hub.png`, fullPage: false, animations: "disabled" })

    // Sub-events spoke → drill into the child.
    await vis(page.getByRole("button", { name: /Sub-events/ })).click()
    await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("evtab=sub_events")
    await page.screenshot({ path: `${SHOTS}/mobile-390-03-sub-events-list.png`, fullPage: false, animations: "disabled" })
    await vis(page.getByText(CHILD_TITLE, { exact: true })).click()

    // The child lands on ITS hub; Overview is where the Edit affordance lives.
    await expect(vis(page.getByText("Jump into planning", { exact: true }))).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: `${SHOTS}/mobile-390-04-child-event-hub.png`, fullPage: false, animations: "disabled" })
    await vis(page.getByRole("button", { name: /Overview/ })).click()

    // ── the affordance that did not exist on mobile before this commit ──
    // Phone width uses the Pocket primitive and the terser label ("Edit"), per
    // mobile_design_system.md §4/§5; desktop keeps "Edit event". Match both.
    const editBtn = vis(page.getByRole("button", { name: /^Edit( event)?$/ }))
    await expect(editBtn).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: `${SHOTS}/mobile-390-05-child-overview-edit-button.png`, fullPage: false, animations: "disabled" })
    const box = await editBtn.boundingBox()
    console.log(`[mobile edit button] box=${JSON.stringify(box)} viewport=390x844`)
    expect(box, "Edit event button must have a layout box").not.toBeNull()
    // Layout sanity only (not taste): inside the 390px column, tappable height.
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    // PocketButton's contract is minHeight 42 (mobile_design_system.md §4).
    expect(box!.height).toBeGreaterThanOrEqual(42)

    await editBtn.click()
    await expectModalOpen(page)
    await expect(fieldInput(page, "Title *")).toHaveValue(CHILD_TITLE)
    await page.screenshot({ path: `${SHOTS}/mobile-390-06-edit-modal-sheet.png`, fullPage: false, animations: "disabled" })

    await fieldInput(page, "Start time").fill("11:45")
    await vis(page.getByRole("button", { name: "Save changes" })).click()
    await expectModalClosed(page)

    expect(iso((await readEvent(childId)).start_date)).toBe(iso(at("2026-08-04", "11:45")))
    expect((await readEvent(parentId)).start_date, "PARENT must not move").toBe(parentBefore.start_date)
    await page.screenshot({ path: `${SHOTS}/mobile-390-07-after-save.png`, fullPage: false, animations: "disabled" })
  })
})
