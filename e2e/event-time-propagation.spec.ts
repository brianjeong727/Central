// Regression coverage for the drilled-sub-event edit bug (commit 016069e).
//
// BEFORE the fix: opening an event's Sub-events tab, drilling into a child, and
// pressing "Edit event" opened an AddEventModal bound to `studentOrgPlanningEvent`
// — the PARENT. handleSave's `.eq("id", existing.id)` therefore wrote the parent
// row: the child's time never changed (the timeline kept the old value) and the
// parent silently moved. This spec asserts the write lands on the CHILD and the
// PARENT is untouched.
//
// TIMEZONE CONVENTION (current — this spec asserts it):
// `calendar_events.start_date`/`end_date` hold TRUE INSTANTS. A time typed into
// AddEventModal is a wall clock in the MINISTRY's own zone (`ministries.timezone`)
// and is converted to an instant through `lib/tz.ts`; every display surface —
// including the edit modal's own read-back — renders that instant back in the same
// ministry zone. So typing 16:00 stores 20:00Z in August (EDT) and reads back as
// 16:00, everywhere, on any device.
//
// Consequently NOTHING below hardcodes a stored UTC literal or a fixed offset —
// a `+00:00`/`-04:00` literal would silently start failing when the ministry
// crosses into EST. Wall clocks are the constants; the expected instant is
// derived at run time with `at(ymd, hhmm)` against the zone read from the DB.
//
// NOTE: both the desktop ("hidden md:flex…") and mobile ("md:hidden") plan trees
// are always co-mounted (Tailwind hides one via CSS). Every locator is narrowed
// with `.filter({ visible: true })`.
import { test, expect, type Page, type Locator } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"
import { resolveMinistryTimezone, zonedTimeToISO } from "../lib/tz"

// The E2E sandbox's one team; classifyTeam routes "Student Org Board" to
// StudentOrgTeamHome (the component this fix changed).
const TEAM_ID = "63a47f06-fdc2-49e1-9703-9ee5dca1ccae"
const TEAM_NAME = "Student Org Board"

const PARENT_TITLE = `${E2E_PREFIX}TP Week`
const CHILD_TITLE = `${E2E_PREFIX}TP Child Night`

// Fixture baseline as MINISTRY-ZONE WALL CLOCKS (see the convention note above).
const PARENT_START_LOCAL = { ymd: "2026-08-03", hhmm: "14:00" }
const PARENT_END_LOCAL = { ymd: "2026-08-07", hhmm: "20:00" }
const CHILD_START_LOCAL = { ymd: "2026-08-04", hhmm: "16:00" }
const CHILD_END_LOCAL = { ymd: "2026-08-04", hhmm: "18:00" }
// Task due dates relative to the child's 2026-08-04 start.
const TASK_OPEN_DUE = "2026-08-01"
const TASK_DONE_DUE = "2026-08-02"

/** The sandbox ministry's IANA zone, read from the DB in beforeAll. */
let zone = ""
/** A ministry-zone wall clock → the instant the timestamptz column holds. */
const at = (ymd: string, hhmm: string) => zonedTimeToISO(ymd, hhmm, zone)
const atLocal = (w: { ymd: string; hhmm: string }) => at(w.ymd, w.hhmm)
/** PostgREST returns "+00:00", `lib/tz.ts` returns "Z" — compare the instants. */
const iso = (v: string) => new Date(v).toISOString()
/** Assert a stored instant is exactly the given ministry-zone wall clock. */
function expectStored(actual: string, ymd: string, hhmm: string, message?: string) {
  expect(iso(actual), message).toBe(iso(at(ymd, hhmm)))
}

let parentId = ""
let childId = ""
let parentPlanId = ""
let childPlanId = ""
let taskOpenId = ""
let taskDoneId = ""
let taskNullId = ""

function vis(l: Locator) { return l.filter({ visible: true }).first() }

function watchConsole(page: Page) {
  const errors: string[] = []
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`) })
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  return errors
}

/** The <input> inside the FormField whose eyebrow label is `label`. FormField
 *  renders <span>{label}</span> + control as siblings (no <label for>). */
function fieldInput(page: Page, label: string) {
  return vis(page.getByText(label, { exact: true })).locator("xpath=..").locator("input").first()
}

/** The AddEventModal is open/closed.
 *  Two traps this avoids:
 *   - the modal TITLE is "Edit event", the SAME string as the Overview button
 *     that opens it, so the title is not a usable marker;
 *   - the footer button's label flips "Save changes" → "Saving…" while the write
 *     is in flight, so waiting for "Save changes" to disappear returns BEFORE the
 *     row is committed and reads a stale DB value.
 *  The "TITLE *" field label exists only inside this modal and only disappears on
 *  unmount, i.e. strictly after onSaved(). */
async function expectModalOpen(page: Page) {
  await expect(vis(page.getByText("Title *", { exact: true }))).toBeVisible({ timeout: 15_000 })
}
async function expectModalClosed(page: Page) {
  await expect(page.getByText("Title *", { exact: true }).filter({ visible: true })).toHaveCount(0, { timeout: 20_000 })
}

async function readEvent(id: string) {
  const sb = sandbox()
  const { data, error } = await sb.client
    .from("calendar_events")
    .select("id, title, start_date, end_date, all_day, parent_event_id")
    .eq("id", id)
    .single()
  if (error) throw error
  return data as { id: string; title: string; start_date: string; end_date: string; all_day: boolean; parent_event_id: string | null }
}

async function readTaskDue(id: string) {
  const sb = sandbox()
  const { data, error } = await sb.client.from("event_tasks").select("id, due_date, completed").eq("id", id).single()
  if (error) throw error
  return data as { id: string; due_date: string | null; completed: boolean }
}

async function readLadder(planId: string) {
  const sb = sandbox()
  const { data, error } = await sb.client.from("event_plans").select("countdown_phases").eq("id", planId).single()
  if (error) throw error
  return (data as { countdown_phases: unknown }).countdown_phases
}

/** Reset every fixture row to its baseline so each test starts from the same state. */
async function resetFixtures() {
  const sb = sandbox()
  await sb.client.from("calendar_events").update({ start_date: atLocal(PARENT_START_LOCAL), end_date: atLocal(PARENT_END_LOCAL), title: PARENT_TITLE }).eq("id", parentId)
  await sb.client.from("calendar_events").update({ start_date: atLocal(CHILD_START_LOCAL), end_date: atLocal(CHILD_END_LOCAL), title: CHILD_TITLE }).eq("id", childId)
  await sb.client.from("event_tasks").update({ due_date: TASK_OPEN_DUE }).eq("id", taskOpenId)
  await sb.client.from("event_tasks").update({ due_date: TASK_DONE_DUE }).eq("id", taskDoneId)
  await sb.client.from("event_tasks").update({ due_date: null }).eq("id", taskNullId)
}

/** Drive: plan tab → team → timeline → open the PARENT event. */
async function openParentEvent(page: Page) {
  await page.goto(`/home?tab=plan&team=${TEAM_ID}`)
  const parentCard = vis(page.getByText(PARENT_TITLE, { exact: true }))
  await expect(parentCard).toBeVisible({ timeout: 20_000 })
  await parentCard.click()
  // Parent workspace: the Overview identity header carries the Edit affordance.
  await expect(vis(page.getByRole("button", { name: /Edit event/ }))).toBeVisible({ timeout: 15_000 })
}

/** From the parent workspace: Sub-events section → drill into the child. */
async function drillIntoChild(page: Page) {
  await vis(page.getByRole("button", { name: /Sub-events/ })).click()
  await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("evtab=sub_events")
  const childRow = vis(page.getByText(CHILD_TITLE, { exact: true }))
  await expect(childRow).toBeVisible()
  await childRow.click()
  // The drilled child owns the shell title now.
  await expect(vis(page.getByRole("button", { name: /Edit event/ }))).toBeVisible({ timeout: 15_000 })
}

/** Read the sub-event disclosure row's rendered time off the timeline. */
async function timelineChildRowText(page: Page) {
  const p = vis(page.getByText(CHILD_TITLE, { exact: true }))
  // p → flex-1 wrapper → card div (title + time span)
  return (await p.locator("xpath=../..").innerText()).replace(/\s+/g, " ").trim()
}

test.describe("event time propagation — drilled sub-event edit (016069e)", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  // Lane guard: the TEAM_ID/EVENT_ID above are hand-seeded LANE-1 rows. Lane 2 (slot s2,
  // port 3002) carries the tenant and two users only, so this spec must SKIP there rather
  // than fail — a normally-red suite trains everyone to ignore red, and a real regression
  // then hides in the noise. See sandbox().hasRow.
  let hasLaneFixture = false

  test.beforeEach(() => {
    test.skip(!hasLaneFixture, "lane-1 fixture only (hand-seeded team/event) — see sandbox().hasRow")
  })

  test.beforeAll(async () => {
    const sb = sandbox()
    hasLaneFixture = await sb.hasRow("teams", { id: TEAM_ID, ministry_id: sb.ministryId })
    if (!hasLaneFixture) return
    const adminId = await sb.adminUserId()

    // The zone is a property of the MINISTRY, so read it rather than assume it.
    const { data: min, error: ze } = await sb.client
      .from("ministries").select("timezone").eq("id", sb.ministryId).single()
    if (ze) throw ze
    zone = resolveMinistryTimezone((min as { timezone: string | null }).timezone)

    const { data: parent, error: pe } = await sb.client
      .from("calendar_events")
      .insert({
        ministry_id: sb.ministryId, team_id: TEAM_ID, title: PARENT_TITLE,
        description: "e2e time-propagation parent", location: "E2E Hall",
        start_date: atLocal(PARENT_START_LOCAL), end_date: atLocal(PARENT_END_LOCAL), all_day: false,
        category: "welcoming", event_type: "welcome_week", recurring: false, created_by: adminId,
      })
      .select("id").single()
    if (pe) throw pe
    parentId = (parent as { id: string }).id

    // Children created through SubEventsTab carry team_id = null — mirror that.
    const { data: child, error: ce } = await sb.client
      .from("calendar_events")
      .insert({
        ministry_id: sb.ministryId, team_id: null, parent_event_id: parentId, title: CHILD_TITLE,
        description: "e2e time-propagation child", location: "E2E Room",
        start_date: atLocal(CHILD_START_LOCAL), end_date: atLocal(CHILD_END_LOCAL), all_day: false,
        category: "social", event_type: "social", recurring: false, created_by: adminId,
      })
      .select("id").single()
    if (ce) throw ce
    childId = (child as { id: string }).id

    for (const [evId, target] of [[parentId, "parent"], [childId, "child"]] as const) {
      const { data: plan, error } = await sb.client
        .from("event_plans")
        .insert({ ministry_id: sb.ministryId, calendar_event_id: evId, created_by: adminId })
        .select("id").single()
      if (error) throw error
      if (target === "parent") parentPlanId = (plan as { id: string }).id
      else childPlanId = (plan as { id: string }).id
    }

    const { data: tasks, error: te } = await sb.client
      .from("event_tasks")
      .insert([
        { event_plan_id: childPlanId, title: `${E2E_PREFIX}open dated`, phase: "prep", due_date: TASK_OPEN_DUE, sort_order: 0, completed: false, created_by: adminId },
        { event_plan_id: childPlanId, title: `${E2E_PREFIX}completed dated`, phase: "prep", due_date: TASK_DONE_DUE, sort_order: 1, completed: true, created_by: adminId },
        { event_plan_id: childPlanId, title: `${E2E_PREFIX}open undated`, phase: "prep", due_date: null, sort_order: 2, completed: false, created_by: adminId },
      ])
      .select("id, title")
    if (te) throw te
    const rows = tasks as { id: string; title: string }[]
    taskOpenId = rows.find(r => r.title.includes("open dated"))!.id
    taskDoneId = rows.find(r => r.title.includes("completed dated"))!.id
    taskNullId = rows.find(r => r.title.includes("open undated"))!.id
  })

  test.afterAll(async () => {
    if (!hasLaneFixture) return
    const sb = sandbox()
    if (childPlanId) await sb.client.from("event_tasks").delete().eq("event_plan_id", childPlanId)
    if (parentPlanId) await sb.client.from("event_tasks").delete().eq("event_plan_id", parentPlanId)
    for (const id of [childPlanId, parentPlanId]) if (id) await sb.client.from("event_plans").delete().eq("id", id)
    for (const id of [childId, parentId]) if (id) await sb.client.from("calendar_events").delete().eq("id", id)
  })

  test.beforeEach(async () => { await resetFixtures() })

  // ── 1. THE BUG ─────────────────────────────────────────────────────────────
  test("1. drilled sub-event Edit writes the CHILD; the PARENT row is untouched", async ({ page }) => {
    const errors = watchConsole(page)
    const parentBefore = await readEvent(parentId)
    const childBefore = await readEvent(childId)

    await openParentEvent(page)
    await drillIntoChild(page)

    await vis(page.getByRole("button", { name: /Edit event/ })).click()
    await expectModalOpen(page)

    // The single most direct proof of the fix: the modal is bound to the CHILD.
    await expect(fieldInput(page, "Title *")).toHaveValue(CHILD_TITLE)
    await expect(fieldInput(page, "Start date *")).toHaveValue("2026-08-04")
    await expect(fieldInput(page, "Start time")).toHaveValue("16:00")

    // Time-only change (same YMD) — the exact edit Brian reported. Kept inside
    // the child's 18:00 end so the modal's own end>start validation doesn't fire.
    await fieldInput(page, "Start time").fill("10:00")
    await vis(page.getByRole("button", { name: "Save changes" })).click()
    await expectModalClosed(page)

    const childAfter = await readEvent(childId)
    const parentAfter = await readEvent(parentId)

    expect(childAfter.start_date, "CHILD start_date must have moved").not.toBe(childBefore.start_date)
    expectStored(childAfter.start_date, "2026-08-04", "10:00")
    expect(parentAfter.start_date, "PARENT start_date must NOT move").toBe(parentBefore.start_date)
    expect(parentAfter.end_date).toBe(parentBefore.end_date)
    expect(parentAfter.title).toBe(parentBefore.title)

    assertNoErrors(errors)
  })

  // ── 2. Timeline reflects the new value with no hard refresh ────────────────
  test("2. the timeline's sub-event disclosure row updates without a reload", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto(`/home?tab=plan&team=${TEAM_ID}`)
    await expect(vis(page.getByText(PARENT_TITLE, { exact: true }))).toBeVisible({ timeout: 20_000 })
    // The up-next event's sub-event panel defaults open.
    const before = await timelineChildRowText(page)
    console.log(`[timeline] disclosure row BEFORE: ${before}`)

    await vis(page.getByText(PARENT_TITLE, { exact: true })).click()
    await drillIntoChild(page)
    await vis(page.getByRole("button", { name: /Edit event/ })).click()
    await fieldInput(page, "Start time").fill("21:00")
    await fieldInput(page, "End time").fill("22:30")
    await vis(page.getByRole("button", { name: "Save changes" })).click()
    await expectModalClosed(page)

    // Back to the timeline via the shell breadcrumb — NO page reload.
    await page.getByRole("button", { name: TEAM_NAME, exact: true }).click()
    await expect(vis(page.getByText(PARENT_TITLE, { exact: true }))).toBeVisible({ timeout: 15_000 })

    await expect.poll(async () => timelineChildRowText(page), { timeout: 15_000 }).not.toBe(before)
    const after = await timelineChildRowText(page)
    console.log(`[timeline] disclosure row AFTER:  ${after}`)
    expectStored((await readEvent(childId)).start_date, "2026-08-04", "21:00")

    assertNoErrors(errors)
  })

  // ── 3. Parent path still edits the parent ──────────────────────────────────
  test("3. no child drilled → Edit writes the PARENT; children untouched", async ({ page }) => {
    const errors = watchConsole(page)
    const childBefore = await readEvent(childId)

    await openParentEvent(page)
    await vis(page.getByRole("button", { name: /Edit event/ })).click()
    await expect(fieldInput(page, "Title *")).toHaveValue(PARENT_TITLE)
    await fieldInput(page, "Start time").fill("09:30")
    await vis(page.getByRole("button", { name: "Save changes" })).click()
    await expectModalClosed(page)

    expectStored((await readEvent(parentId)).start_date, "2026-08-03", "09:30")
    expect((await readEvent(childId)).start_date, "child must not move when the parent is edited").toBe(childBefore.start_date)

    assertNoErrors(errors)
  })

  // ── 4. Deleting a drilled child returns to the PARENT ──────────────────────
  test("4. deleting a drilled sub-event returns to the parent, not the team hub", async ({ page }) => {
    const errors = watchConsole(page)
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    // Disposable child so the shared fixture survives.
    const throwawayTitle = `${E2E_PREFIX}TP Throwaway Child`
    const { data: tmp, error } = await sb.client
      .from("calendar_events")
      .insert({
        ministry_id: sb.ministryId, team_id: null, parent_event_id: parentId, title: throwawayTitle,
        start_date: at("2026-08-05", "16:00"), end_date: at("2026-08-05", "18:00"),
        all_day: false, category: "social", event_type: "social", recurring: false, created_by: adminId,
      })
      .select("id").single()
    if (error) throw error
    const tmpId = (tmp as { id: string }).id
    // Give it a plan up front. Without one, EventPlanWorkspace.init() bootstraps
    // it on mount via a `.single()` on a missing row (PostgREST 406) plus a
    // duplicate insert under React StrictMode's double-effect (409) — pre-existing
    // console noise from :7580-7597, unrelated to this change, that would
    // otherwise trip assertNoErrors.
    const { data: tmpPlan, error: tpe } = await sb.client
      .from("event_plans")
      .insert({ ministry_id: sb.ministryId, calendar_event_id: tmpId, created_by: adminId })
      .select("id").single()
    if (tpe) throw tpe
    const tmpPlanId = (tmpPlan as { id: string }).id

    try {
      await openParentEvent(page)
      await vis(page.getByRole("button", { name: /Sub-events/ })).click()
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("evtab=sub_events")
      await vis(page.getByText(throwawayTitle, { exact: true })).click()
      await expect(vis(page.getByRole("button", { name: /Edit event/ }))).toBeVisible({ timeout: 15_000 })

      await vis(page.getByRole("button", { name: /Edit event/ })).click()
      await expect(fieldInput(page, "Title *")).toHaveValue(throwawayTitle)
      await vis(page.getByRole("button", { name: /Delete event/ })).click()
      await vis(page.getByRole("button", { name: "Delete forever" })).click()

      // Landed back on the PARENT workspace (parent's Edit affordance + parent
      // title in the shell), NOT the team hub (which shows the New Event CTA).
      await expect(vis(page.getByRole("button", { name: /Edit event/ }))).toBeVisible({ timeout: 15_000 })
      // "Sub-events" only exists on the PARENT's workspace (children get no
      // further drill) — proof we landed one level up, on the parent.
      await expect(vis(page.getByRole("button", { name: /Sub-events/ }))).toBeVisible()
      // …and NOT on the team hub, whose Events header owns the "New Event" CTA.
      await expect(page.getByRole("button", { name: "New Event" }).filter({ visible: true })).toHaveCount(0)
      // The team crumb is still one click away (we are inside the event, not at the hub).
      await expect(page.getByRole("button", { name: TEAM_NAME, exact: true })).toBeVisible()

      const { data: gone } = await sb.client.from("calendar_events").select("id").eq("id", tmpId).maybeSingle()
      expect(gone, "the throwaway child row must be deleted").toBeNull()
    } finally {
      await sb.client.from("event_tasks").delete().eq("event_plan_id", tmpPlanId)
      await sb.client.from("event_plans").delete().eq("id", tmpPlanId)
      await sb.client.from("calendar_events").delete().eq("id", tmpId)
    }

    assertNoErrors(errors)
  })

  // ── 5. Due-date shift: DATE move shifts open dated tasks by the same delta ──
  test("5. moving the event's DATE shifts open dated tasks by the same whole-day delta", async ({ page }) => {
    const errors = watchConsole(page)

    // The ladder BEFORE the move — it must come back byte-identical.
    const ladderBefore = await readLadder(childPlanId)

    await openParentEvent(page)
    await drillIntoChild(page)
    await vis(page.getByRole("button", { name: /Edit event/ })).click()
    await expect(fieldInput(page, "Title *")).toHaveValue(CHILD_TITLE)
    // Wait for the ASYNC ladder load to land — saving before it resolves must
    // not stamp the default ladder over the plan's own.
    await expect(page.getByLabel("Phase 1 label")).toHaveValue("T−4 WEEKS")

    // 2026-08-04 → 2026-08-06 = +2 days.
    await fieldInput(page, "End date *").fill("2026-08-06")
    await fieldInput(page, "Start date *").fill("2026-08-06")
    await vis(page.getByRole("button", { name: "Save changes" })).click()
    await expectModalClosed(page)

    expectStored((await readEvent(childId)).start_date, "2026-08-06", "16:00")
    // Open + dated → shifted +2. Completed → untouched. Null → still null.
    await expect.poll(async () => (await readTaskDue(taskOpenId)).due_date, { timeout: 10_000 }).toBe("2026-08-03")
    expect((await readTaskDue(taskDoneId)).due_date, "completed task must NOT shift").toBe(TASK_DONE_DUE)
    expect((await readTaskDue(taskNullId)).due_date, "undated task must stay null").toBeNull()

    // The ladder does NOT move. This is the whole point of the T-minus model:
    // rungs are offsets relative to the event, so a date change re-buckets
    // nothing. (Its predecessor — plan_start_date / crunch_date — was absolute
    // and HAD to be shifted in lockstep or every task collapsed into Crunch.)
    expect(await readLadder(childPlanId), "ladder must be untouched by a date move")
      .toEqual(ladderBefore)

    assertNoErrors(errors)
  })

  // ── 6. Time-only edit shifts nothing ───────────────────────────────────────
  test("6. a TIME-only edit shifts no task due dates", async ({ page }) => {
    const errors = watchConsole(page)

    await openParentEvent(page)
    await drillIntoChild(page)
    await vis(page.getByRole("button", { name: /Edit event/ })).click()
    await fieldInput(page, "Start time").fill("07:15")
    await vis(page.getByRole("button", { name: "Save changes" })).click()
    await expectModalClosed(page)

    expectStored((await readEvent(childId)).start_date, "2026-08-04", "07:15")
    expect((await readTaskDue(taskOpenId)).due_date, "time-only edit must not shift due dates").toBe(TASK_OPEN_DUE)
    expect((await readTaskDue(taskDoneId)).due_date).toBe(TASK_DONE_DUE)
    expect((await readTaskDue(taskNullId)).due_date).toBeNull()

    assertNoErrors(errors)
  })

  // ── 7. savedStartYMDRef: two consecutive saves shift by the NEW delta ───────
  test("7. two successive date moves shift by (B−A) then (C−B), never (B−A) twice", async ({ page }) => {
    const errors = watchConsole(page)

    await openParentEvent(page)
    await drillIntoChild(page)

    // Move 1: 08-04 → 08-06 (+2). Open dated task 08-01 → 08-03.
    await vis(page.getByRole("button", { name: /Edit event/ })).click()
    await fieldInput(page, "End date *").fill("2026-08-06")
    await fieldInput(page, "Start date *").fill("2026-08-06")
    await vis(page.getByRole("button", { name: "Save changes" })).click()
    await expectModalClosed(page)
    await expect.poll(async () => (await readTaskDue(taskOpenId)).due_date, { timeout: 10_000 }).toBe("2026-08-03")

    // Move 2 (same drilled session, modal reopened): 08-06 → 08-07 (+1).
    // Correct total = +3 (08-04). A re-applied original delta would give 08-05.
    await vis(page.getByRole("button", { name: /Edit event/ })).click()
    await expect(fieldInput(page, "Start date *")).toHaveValue("2026-08-06")
    await fieldInput(page, "End date *").fill("2026-08-07")
    await fieldInput(page, "Start date *").fill("2026-08-07")
    await vis(page.getByRole("button", { name: "Save changes" })).click()
    await expectModalClosed(page)

    expectStored((await readEvent(childId)).start_date, "2026-08-07", "16:00")
    await expect.poll(async () => (await readTaskDue(taskOpenId)).due_date, { timeout: 10_000 }).toBe("2026-08-04")
    expect((await readTaskDue(taskDoneId)).due_date).toBe(TASK_DONE_DUE)
    expect((await readTaskDue(taskNullId)).due_date).toBeNull()

    assertNoErrors(errors)
  })

  // ── 8. Partial task-shift failure → retry converges, anchors AND tasks agree ─
  // Exercises the only path that keeps the modal open across two saves. The
  // event_tasks PATCH is stubbed to the silent-rejection shape (200 + zero rows),
  // which is exactly what an RLS-blocked UPDATE looks like to supabase-js.
  test("8. a partial task-shift failure retries to agreement — ladder AND tasks", async ({ page }) => {
    const ladderBefore = await readLadder(childPlanId)

    // Fail every event_tasks UPDATE for the FIRST save only.
    await page.route("**/rest/v1/event_tasks*", async (route) => {
      if (route.request().method() === "PATCH") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
      return route.fallback()
    })

    await openParentEvent(page)
    await drillIntoChild(page)
    await vis(page.getByRole("button", { name: /Edit event/ })).click()
    await expect(page.getByLabel("Phase 1 label")).toHaveValue("T−4 WEEKS")

    // 2026-08-04 → 2026-08-06 = +2.
    await fieldInput(page, "End date *").fill("2026-08-06")
    await fieldInput(page, "Start date *").fill("2026-08-06")
    await vis(page.getByRole("button", { name: "Save changes" })).click()

    // The modal STAYS open and says so, rather than reporting a clean save.
    await expect(vis(page.getByText(/only PARTLY shifted/))).toBeVisible({ timeout: 10_000 })
    // Event moved; the task did not (that is the induced failure).
    expectStored((await readEvent(childId)).start_date, "2026-08-06", "16:00")
    expect(await readLadder(childPlanId), "ladder is offset-based — a date move never touches it")
      .toEqual(ladderBefore)
    expect((await readTaskDue(taskOpenId)).due_date, "task blocked by the stub").toBe(TASK_OPEN_DUE)

    // Lift the stub and press Save again — no field edits.
    await page.unroute("**/rest/v1/event_tasks*")
    await vis(page.getByRole("button", { name: "Save changes" })).click()
    await expectModalClosed(page)

    // WARN-B1's original hazard — a retry rewriting the PRE-shift window over the
    // shifted one — cannot exist any more: there is no derived window to re-base.
    // The ladder must still survive the retry unchanged.
    await expect.poll(async () => (await readTaskDue(taskOpenId)).due_date, { timeout: 10_000 }).toBe("2026-08-03")
    expect(await readLadder(childPlanId), "ladder must survive the retry unchanged").toEqual(ladderBefore)
    expectStored((await readEvent(childId)).start_date, "2026-08-06", "16:00", "event must not move again")
  })

  // ── 9. A SUCCESSFUL save invalidates the shared calendar cache ──────────────
  test("9. a successful save invalidates the shared calendar cache, not just the open key", async ({ page }) => {
    const errors = watchConsole(page)
    await openParentEvent(page)
    await drillIntoChild(page)
    await vis(page.getByRole("button", { name: /Edit event/ })).click()
    await expect(fieldInput(page, "Title *")).toHaveValue(CHILD_TITLE)

    // Count calendar_events reads issued AFTER Save — a navigation-free refetch.
    let calendarGets = 0
    page.on("request", (r) => {
      if (r.method() === "GET" && r.url().includes("/rest/v1/calendar_events")) calendarGets++
    })

    await fieldInput(page, "Start time").fill("13:30")
    await vis(page.getByRole("button", { name: "Save changes" })).click()
    await expectModalClosed(page)

    // WARN-B2: before the fix the modal invalidated on the FAILURE branch only, so
    // a successful save refetched nothing of its own.
    await expect.poll(() => calendarGets, { timeout: 10_000 }).toBeGreaterThan(0)
    expectStored((await readEvent(childId)).start_date, "2026-08-04", "13:30")

    assertNoErrors(errors)
  })
})

function assertNoErrors(errors: string[]) {
  expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
}
