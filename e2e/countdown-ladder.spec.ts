// Click-through coverage for the per-plan countdown LADDER — the T-minus
// structure that replaced `event_plans.plan_start_date` / `crunch_date`.
//
// Everything this spec needs it seeds itself (team, event, plan, tasks), so it
// runs on EVERY lane rather than skipping wherever a hand-seeded fixture is
// absent. All rows carry the E2E:: prefix and are dropped in afterAll.
//
// What it proves:
//   1. A plan renders its stored ladder's phase headings.
//   2. Switching preset in the Edit modal rewrites the ladder AND re-buckets the
//      existing tasks — the same task lands on a different rung.
//   3. A renamed rung persists and flips the picker to Custom.
//   4. Moving the event's DATE leaves the ladder byte-identical. This is the
//      property the whole refactor exists for: the old absolute plan/crunch pair
//      had to be shifted in lockstep with the tasks or every task collapsed into
//      Crunch. Offsets need no shift.
//   5. Creating an event with the Short preset seeds that ladder onto its plan.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"
import { COUNTDOWN_PRESETS } from "../app/home/event-presets-data.mjs"

// Name matters: classifyTeam() routes by name, and only a "board"-style team
// lands on the Events agenda whose cards this spec clicks. A plain name would
// classify as "standard" and render the ministry calendar instead.
const TEAM_NAME = `${E2E_PREFIX}Ladder Board`
const EVENT_TITLE = `${E2E_PREFIX}Ladder Event`
const CREATED_TITLE = `${E2E_PREFIX}Ladder Created`

// Tasks chosen so long and short bucket them DIFFERENTLY — that contrast is what
// makes the re-bucket assertion meaningful rather than incidental.
//   d=25 → long "T−4 WEEKS" · short "T−1 WEEK"
//   d=2  → long "T−2 DAYS"  · short "T−3 DAYS"
const TASK_FAR = `${E2E_PREFIX}Far task`
const TASK_NEAR = `${E2E_PREFIX}Near task`

let teamId = ""
let eventId = ""
let planId = ""
let eventYMD = ""

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Only visible matches. The app mounts desktop and mobile branches together, so
 *  an unscoped getByText can match a hidden twin and read as a false positive. */
function vis(loc: ReturnType<Page["getByText"]>) {
  return loc.filter({ visible: true })
}

/** The <input> inside the FormField whose eyebrow label is `label`. FormField
 *  renders <span>{label}</span> + control as siblings (no <label for>), so
 *  getByLabel does not reach these. Mirrors e2e/event-time-propagation.spec.ts. */
function fieldInput(page: Page, label: string) {
  return page.getByText(label, { exact: true }).filter({ visible: true })
    .locator("xpath=..").locator("input").first()
}

async function readLadder(): Promise<{ label: string; startDaysBefore: number }[]> {
  const sb = sandbox()
  const { data, error } = await sb.client.from("event_plans").select("countdown_phases").eq("id", planId).single()
  if (error) throw error
  return (data as { countdown_phases: { label: string; startDaysBefore: number }[] }).countdown_phases
}

test.describe("Countdown ladder (replaces plan-start / crunch)", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()

    const { data: team, error: te } = await sb.client
      .from("teams")
      .insert({ ministry_id: sb.ministryId, name: TEAM_NAME, team_type: "standard", created_by: adminId })
      .select("id").single()
    if (te) throw te
    teamId = (team as { id: string }).id

    // A team_members row alone is NOT enough to enter the workspace: without a
    // role the board renders as "view only · needs a president" and the ?team=
    // deep link bounces to the workspace picker. Mirror the Student Org Board
    // preset's President role (app/home/workspace-presets.ts).
    const { data: role, error: re } = await sb.client
      .from("team_roles")
      .insert({
        team_id: teamId, name: "President", is_president: true,
        permissions: ["can_plan_events", "can_view_finances", "can_manage_members", "can_track_attendance", "can_manage_team"],
      })
      .select("id").single()
    if (re) throw re
    await sb.client.from("team_members").insert({
      team_id: teamId, user_id: adminId, added_by: adminId, role_id: (role as { id: string }).id,
    })

    // Far enough out that every rung of both ladders is still in the future.
    const today = new Date().toISOString().slice(0, 10)
    eventYMD = addDays(today, 60)
    const { data: ev, error: ee } = await sb.client
      .from("calendar_events")
      .insert({
        ministry_id: sb.ministryId, team_id: teamId, title: EVENT_TITLE,
        start_date: `${eventYMD}T18:00:00Z`, end_date: `${eventYMD}T21:00:00Z`,
        created_by: adminId,
      })
      .select("id").single()
    if (ee) throw ee
    eventId = (ev as { id: string }).id

    const { data: plan, error: pe } = await sb.client
      .from("event_plans")
      .insert({
        ministry_id: sb.ministryId, calendar_event_id: eventId, created_by: adminId,
        countdown_phases: COUNTDOWN_PRESETS.long.phases,
      })
      .select("id").single()
    if (pe) throw pe
    planId = (plan as { id: string }).id

    await sb.client.from("event_tasks").insert([
      { event_plan_id: planId, title: TASK_FAR, due_date: addDays(eventYMD, -25), phase: "pre_event", sort_order: 0, created_by: adminId },
      { event_plan_id: planId, title: TASK_NEAR, due_date: addDays(eventYMD, -2), phase: "day_of", sort_order: 1, created_by: adminId },
    ])
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (planId) {
      await sb.client.from("event_tasks").delete().eq("event_plan_id", planId)
      await sb.client.from("event_plans").delete().eq("id", planId)
    }
    // The event created through the UI in test 5 lives under the same team.
    if (teamId) {
      const { data: evs } = await sb.client.from("calendar_events").select("id").eq("team_id", teamId)
      const ids = (evs ?? []).map((e: { id: string }) => e.id)
      if (ids.length) {
        const { data: plans } = await sb.client.from("event_plans").select("id").in("calendar_event_id", ids)
        const pids = (plans ?? []).map((p: { id: string }) => p.id)
        if (pids.length) {
          await sb.client.from("event_tasks").delete().in("event_plan_id", pids)
          await sb.client.from("event_roles").delete().in("event_plan_id", pids)
          await sb.client.from("event_plans").delete().in("id", pids)
        }
        await sb.client.from("calendar_events").delete().in("id", ids)
      }
      await sb.client.from("team_members").delete().eq("team_id", teamId)
      await sb.client.from("teams").delete().eq("id", teamId)
    }
  })

  /** Open the event's plan workspace; lands on the Overview sub-tab. */
  async function openEvent(page: Page, title = EVENT_TITLE) {
    await page.goto(`/home?tab=plan&team=${teamId}`)
    const card = page.getByRole("heading", { name: title }).first()
    await expect(card).toBeVisible({ timeout: 20_000 })
    await card.click()
    await expect(page.getByRole("button", { name: "Countdown", exact: true })).toBeVisible({ timeout: 15_000 })
  }

  async function goToTab(page: Page, name: string) {
    await page.getByRole("button", { name, exact: true }).click()
  }

  /** "Edit event" is an Overview affordance (the identity card), not a Countdown one. */
  async function openEditModal(page: Page) {
    await goToTab(page, "Overview")
    await page.getByRole("button", { name: /Edit event/ }).first().click()
    // The ladder editor's first row is the async-load signal — the modal gates
    // its write on it, so every later interaction must wait for it too.
    await expect(page.getByLabel("Phase 1 label")).toBeEnabled({ timeout: 15_000 })
  }

  test("1. the stored ladder's phases render, and a preset switch re-buckets tasks", async ({ page }) => {
    await openEvent(page)
    await goToTab(page, "Countdown")

    // Long ladder: the far task sits under T−4 WEEKS, the near one under T−2 DAYS.
    await expect(vis(page.getByText("T−4 WEEKS")).first()).toBeVisible()
    await expect(vis(page.getByText("T−2 DAYS")).first()).toBeVisible()
    await expect(vis(page.getByText(TASK_FAR, { exact: true })).first()).toBeVisible()

    // Switch to Short planning.
    await openEditModal(page)
    await expect(page.getByLabel("Phase 1 label")).toHaveValue("T−4 WEEKS")
    await page.getByRole("radio", { name: "Short planning" }).click()
    await expect(page.getByLabel("Phase 1 label")).toHaveValue("T−1 WEEK")
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0, { timeout: 20_000 })

    // DB truth: the short ladder replaced the long one.
    await expect.poll(async () => (await readLadder()).map(p => p.label), { timeout: 10_000 })
      .toEqual(COUNTDOWN_PRESETS.short.phases.map(p => p.label))

    // UI truth: the SAME tasks now sit on short-ladder rungs. T−4 WEEKS is gone
    // (no such rung), and the near task moved to T−3 DAYS.
    await goToTab(page, "Countdown")
    await expect(vis(page.getByText("T−4 WEEKS"))).toHaveCount(0, { timeout: 15_000 })
    await expect(vis(page.getByText("T−3 DAYS")).first()).toBeVisible()
    await expect(vis(page.getByText(TASK_NEAR, { exact: true })).first()).toBeVisible()
  })

  test("2. a renamed rung persists and reads as Custom", async ({ page }) => {
    await openEvent(page)
    await openEditModal(page)

    await page.getByLabel("Phase 1 label").fill("KICKOFF")
    // Renaming diverges from both presets → the picker gains a Custom segment.
    await expect(page.getByRole("radio", { name: "Custom" })).toBeVisible()
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0, { timeout: 20_000 })

    await expect.poll(async () => (await readLadder())[0].label, { timeout: 10_000 }).toBe("KICKOFF")
    await goToTab(page, "Countdown")
    await expect(vis(page.getByText("KICKOFF")).first()).toBeVisible({ timeout: 15_000 })
  })

  test("3. moving the event's DATE leaves the ladder untouched", async ({ page }) => {
    const before = await readLadder()

    await openEvent(page)
    await openEditModal(page)
    const moved = addDays(eventYMD, 5)
    await fieldInput(page, "End date *").fill(moved)
    await fieldInput(page, "Start date *").fill(moved)
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0, { timeout: 30_000 })

    // The ladder is relative — a date move re-bases nothing.
    expect(await readLadder(), "ladder must survive a date move byte-identical").toEqual(before)
  })

  test("4. creating an event with the Short preset seeds that ladder", async ({ page }) => {
    await page.goto(`/home?tab=plan&team=${teamId}`)
    await page.getByRole("button", { name: /New Event/i }).first().click()
    await page.getByRole("button", { name: /Start from scratch/ }).click()

    await fieldInput(page, "Title *").fill(CREATED_TITLE)
    const when = addDays(new Date().toISOString().slice(0, 10), 21)
    await fieldInput(page, "Start date *").fill(when)
    await fieldInput(page, "End date *").fill(when)

    await expect(page.getByLabel("Phase 1 label")).toHaveValue("T−4 WEEKS")
    await page.getByRole("radio", { name: "Short planning" }).click()
    await page.getByRole("button", { name: /^(Create event|Save)/ }).first().click()

    // DB truth: the new plan carries the short ladder, not the default.
    await expect.poll(async () => {
      const sb = sandbox()
      const { data: ev } = await sb.client.from("calendar_events").select("id")
        .eq("team_id", teamId).eq("title", CREATED_TITLE).maybeSingle()
      if (!ev) return null
      const { data: p } = await sb.client.from("event_plans").select("countdown_phases")
        .eq("calendar_event_id", (ev as { id: string }).id).maybeSingle()
      const phases = (p as { countdown_phases: { label: string }[] } | null)?.countdown_phases
      return phases ? phases.map(x => x.label) : null
    }, { timeout: 25_000 }).toEqual(COUNTDOWN_PRESETS.short.phases.map(p => p.label))
  })
})
