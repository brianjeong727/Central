// Event readiness truth (T1) — "Ready" means the checklist is done AND every role
// is confirmed by the person holding it.
//
// Before this change every readiness readout was a tasks-only percentage copied
// by hand into six places, so an event with 22/22 tasks and a role nobody had
// agreed to staff rendered a green "Ready", and a role whose holder DECLINED was
// still grouped under "Covered". The shared computation now lives in
// lib/event-readiness.ts and every surface consumes it.
//
// This spec drives the E2E-sandbox "Student Org Board" workspace as a leader:
//   1. An arranged probe event with EVERY task done and one assigned-but-
//      unconfirmed role must NOT say Ready — and must flip to Ready the moment
//      that confirmation comes back (the positive control: the gate isn't
//      permanently false).
//   2. The seeded "Fall Kickoff Night" carries a DECLINED role; it must sit under
//      "Needs someone", above the "Covered" group, with its Declined pill intact.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

// Hand-seeded lane-1 fixtures (same team the countdown spec drives).
const TEAM_ID = "63a47f06-fdc2-49e1-9703-9ee5dca1ccae"
const KICKOFF_TITLE = "Fall Kickoff Night"
const DECLINED_ROLE = "Closer (L.O.C.K)"
const PROBE_TITLE = `${E2E_PREFIX}Readiness probe`
const WEEK_TITLE = `${E2E_PREFIX}Readiness week`
const NIGHT_TITLE = `${E2E_PREFIX}Readiness night`

test.describe("Event readiness is composite (tasks + confirmed roles)", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  let hasLaneFixture = false
  let probeEventId = ""
  let probePlanId = ""
  let probeRoleId = ""
  let probeConfirmationId = ""
  // Container probe (a week holding one night) — exercises the batched roll-up.
  let weekEventId = ""
  let weekPlanId = ""
  let nightEventId = ""
  let nightPlanId = ""

  test.beforeEach(() => {
    test.skip(!hasLaneFixture, "lane-1 fixture only (hand-seeded team/event) — see sandbox().hasRow")
  })

  test.beforeAll(async () => {
    const sb = sandbox()
    hasLaneFixture = await sb.hasRow("teams", { id: TEAM_ID, ministry_id: sb.ministryId })
    if (!hasLaneFixture) return
    const adminId = await sb.adminUserId()

    // A leaf event three days out: two tasks, both DONE, and one role that is
    // assigned but has only been ASKED. Tasks-only readiness would call this 100%.
    const start = new Date(Date.now() + 3 * 86_400_000)
    const end = new Date(start.getTime() + 2 * 3_600_000)
    const { data: ev, error: ee } = await sb.client
      .from("calendar_events")
      .insert({
        ministry_id: sb.ministryId,
        team_id: TEAM_ID,
        title: PROBE_TITLE,
        description: "Readiness truth probe — every task done, one role unconfirmed.",
        location: "Probe Hall",
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        all_day: false,
        category: "regular",
        event_type: "ministry",
        status: "planning",
        created_by: adminId,
      })
      .select("id").single()
    if (ee) throw ee
    probeEventId = (ev as { id: string }).id

    const { data: plan, error: pe } = await sb.client
      .from("event_plans")
      .insert({ ministry_id: sb.ministryId, calendar_event_id: probeEventId, created_by: adminId })
      .select("id").single()
    if (pe) throw pe
    probePlanId = (plan as { id: string }).id

    const { error: te } = await sb.client.from("event_tasks").insert([
      { event_plan_id: probePlanId, title: `${E2E_PREFIX}Book the room`, completed: true, completed_at: new Date().toISOString(), created_by: adminId, phase: "pre_event", sort_order: 0 },
      { event_plan_id: probePlanId, title: `${E2E_PREFIX}Print the programs`, completed: true, completed_at: new Date().toISOString(), created_by: adminId, phase: "pre_event", sort_order: 1 },
    ])
    if (te) throw te

    const { data: role, error: re } = await sb.client
      .from("event_roles")
      .insert({ event_plan_id: probePlanId, role_name: `${E2E_PREFIX}Probe Lead`, assigned_to: adminId, notes: "Runs the probe", created_by: adminId })
      .select("id").single()
    if (re) throw re
    probeRoleId = (role as { id: string }).id

    const { data: conf, error: ce } = await sb.client
      .from("event_confirmations")
      .insert({
        ministry_id: sb.ministryId,
        event_plan_id: probePlanId,
        subject_type: "role",
        subject_id: probeRoleId,
        user_id: adminId,
        status: "requested",
        round: 1,
        requested_at: new Date().toISOString(),
      })
      .select("id").single()
    if (ce) throw ce
    probeConfirmationId = (conf as { id: string }).id

    // ── Container probe: a week with ONE night whose checklist is finished but
    //    whose only role was DECLINED. Tasks-only roll-up called that night Ready.
    const wkStart = new Date(Date.now() + 5 * 86_400_000)
    const { data: week, error: we } = await sb.client
      .from("calendar_events")
      .insert({
        ministry_id: sb.ministryId, team_id: TEAM_ID, title: WEEK_TITLE,
        start_date: wkStart.toISOString(),
        end_date: new Date(wkStart.getTime() + 3 * 86_400_000).toISOString(),
        all_day: false, category: "regular", event_type: "welcome_week",
        status: "planning", created_by: adminId,
      })
      .select("id").single()
    if (we) throw we
    weekEventId = (week as { id: string }).id

    // The week carries its OWN plan row (created lazily in the UI on first open —
    // the Sub-events pane renders only once it exists).
    const { data: weekPlan, error: wpe } = await sb.client
      .from("event_plans")
      .insert({ ministry_id: sb.ministryId, calendar_event_id: weekEventId, created_by: adminId })
      .select("id").single()
    if (wpe) throw wpe
    weekPlanId = (weekPlan as { id: string }).id

    const { data: night, error: ne } = await sb.client
      .from("calendar_events")
      .insert({
        ministry_id: sb.ministryId, team_id: TEAM_ID, title: NIGHT_TITLE,
        parent_event_id: weekEventId,
        start_date: new Date(wkStart.getTime() + 86_400_000).toISOString(),
        end_date: new Date(wkStart.getTime() + 86_400_000 + 2 * 3_600_000).toISOString(),
        all_day: false, category: "regular", event_type: "social",
        status: "planning", created_by: adminId,
      })
      .select("id").single()
    if (ne) throw ne
    nightEventId = (night as { id: string }).id

    const { data: nightPlan, error: npe } = await sb.client
      .from("event_plans")
      .insert({ ministry_id: sb.ministryId, calendar_event_id: nightEventId, created_by: adminId })
      .select("id").single()
    if (npe) throw npe
    nightPlanId = (nightPlan as { id: string }).id

    const { error: nte } = await sb.client.from("event_tasks").insert({
      event_plan_id: nightPlanId, title: `${E2E_PREFIX}Set up chairs`, completed: true,
      completed_at: new Date().toISOString(), created_by: adminId, phase: "pre_event", sort_order: 0,
    })
    if (nte) throw nte

    const { data: nightRole, error: nre } = await sb.client
      .from("event_roles")
      .insert({ event_plan_id: nightPlanId, role_name: `${E2E_PREFIX}Night Lead`, assigned_to: adminId, created_by: adminId })
      .select("id").single()
    if (nre) throw nre

    const { error: nce } = await sb.client.from("event_confirmations").insert({
      ministry_id: sb.ministryId, event_plan_id: nightPlanId, subject_type: "role",
      subject_id: (nightRole as { id: string }).id, user_id: adminId, status: "declined",
      round: 1, requested_at: new Date().toISOString(), responded_at: new Date().toISOString(),
      note: "Away that night",
    })
    if (nce) throw nce
  })

  test.afterAll(async () => {
    if (!hasLaneFixture) return
    const sb = sandbox()
    if (probeConfirmationId) await sb.client.from("event_confirmations").delete().eq("id", probeConfirmationId)
    if (probePlanId) {
      await sb.client.from("event_roles").delete().eq("event_plan_id", probePlanId)
      await sb.client.from("event_tasks").delete().eq("event_plan_id", probePlanId)
      await sb.client.from("event_plans").delete().eq("id", probePlanId)
    }
    if (probeEventId) await sb.client.from("calendar_events").delete().eq("id", probeEventId)
    if (nightPlanId) {
      await sb.client.from("event_confirmations").delete().eq("event_plan_id", nightPlanId)
      await sb.client.from("event_roles").delete().eq("event_plan_id", nightPlanId)
      await sb.client.from("event_tasks").delete().eq("event_plan_id", nightPlanId)
      await sb.client.from("event_plans").delete().eq("id", nightPlanId)
    }
    if (nightEventId) await sb.client.from("calendar_events").delete().eq("id", nightEventId)
    if (weekPlanId) await sb.client.from("event_plans").delete().eq("id", weekPlanId)
    if (weekEventId) await sb.client.from("calendar_events").delete().eq("id", weekEventId)
  })

  // Enter the team workspace and open one event's plan (Overview).
  async function openEvent(page: Page, title: string) {
    await page.goto(`/home?tab=plan&team=${TEAM_ID}`)
    // The agenda renders each row's title as a <p> (only the "Up next" card is a
    // heading), so match on text, not role.
    const card = page.getByText(title, { exact: true }).filter({ visible: true }).first()
    await expect(card).toBeVisible({ timeout: 20_000 })
    await card.click()
    await expect(page.getByRole("button", { name: "Overview", exact: true })).toBeVisible()
  }

  test("all tasks done + an assigned role that has not confirmed is NOT Ready", async ({ page }) => {
    await openEvent(page, PROBE_TITLE)

    // The Readiness stat card (desktop right rail).
    const card = page.locator("div").filter({ hasText: /^Readiness/ }).filter({ visible: true }).last()
    await expect(card).toBeVisible()
    await expect(card.getByText("Awaiting confirmations")).toBeVisible()
    await expect(card.getByText("Ready", { exact: true })).toHaveCount(0)
    // Both halves stated: the checklist IS done, the roster is not.
    await expect(card.getByText("2/2 tasks · 0/1 roles confirmed")).toBeVisible()

    // The launchpad Roles row states assignment AND confirmation.
    await expect(page.getByText("1/1 assigned · 0 confirmed").filter({ visible: true }).first()).toBeVisible()

    // ── Positive control: the moment the holder confirms, it IS Ready. ──
    const sb = sandbox()
    const { error } = await sb.client
      .from("event_confirmations")
      .update({ status: "confirmed", responded_at: new Date().toISOString() })
      .eq("id", probeConfirmationId)
    if (error) throw error

    await openEvent(page, PROBE_TITLE)
    const readyCard = page.locator("div").filter({ hasText: /^Readiness/ }).filter({ visible: true }).last()
    await expect(readyCard.getByText("Ready", { exact: true })).toBeVisible()
    await expect(readyCard.getByText("2/2 tasks · 1/1 roles confirmed")).toBeVisible()
    await expect(page.getByText("1/1 assigned · 1 confirmed").filter({ visible: true }).first()).toBeVisible()

    // Leave the fixture as arranged for any re-run.
    await sb.client
      .from("event_confirmations")
      .update({ status: "requested", responded_at: null })
      .eq("id", probeConfirmationId)
  })

  test("a declined role is grouped under Needs someone, with its Declined pill", async ({ page }) => {
    await openEvent(page, KICKOFF_TITLE)
    await page.getByRole("button", { name: "Roles", exact: true }).click()
    await expect.poll(() => page.url()).toContain("evtab=roles")

    await expect(page.getByText("Needs someone").first()).toBeVisible()
    await expect(page.getByText(DECLINED_ROLE).first()).toBeVisible()
    await expect(page.getByText("Declined").first()).toBeVisible()

    // Grouping, structurally: the declined role's row must fall between the
    // "Needs someone" rule and the "Covered" rule. innerText is visible text in
    // DOM order, so the index comparison IS the grouping assertion (the mobile
    // tree is co-mounted but hidden, so it contributes nothing here).
    const body = await page.innerText("body")
    const needsIdx = body.indexOf("Needs someone")
    const roleIdx = body.indexOf(DECLINED_ROLE)
    const coveredIdx = body.indexOf("Covered")
    expect(needsIdx, "Needs someone group header renders").toBeGreaterThan(-1)
    expect(coveredIdx, "Covered group header renders").toBeGreaterThan(-1)
    expect(roleIdx, "declined role sits after the Needs someone header").toBeGreaterThan(needsIdx)
    expect(roleIdx, "declined role sits BEFORE the Covered header").toBeLessThan(coveredIdx)

    // And the event as a whole says so.
    await page.getByRole("button", { name: "Overview", exact: true }).click()
    const card = page.locator("div").filter({ hasText: /^Readiness/ }).filter({ visible: true }).last()
    await expect(card.getByText("Needs someone")).toBeVisible()
    await expect(card.getByText("Ready", { exact: true })).toHaveCount(0)
    await expect(card.getByText(/1 declined/)).toBeVisible()
  })

  test("a container's night roll-up reads the nights' confirmations, not just their tasks", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
    await openEvent(page, WEEK_TITLE)
    await page.getByRole("button", { name: "Sub-events", exact: true }).click()

    // The sub-events pane fetches the week's nights (the batched roll-up) after the
    // pane mounts, so give the row the network budget the rest of the spec gives a
    // first paint — a 5s default raced the fetch when the whole suite runs.
    const row = page.getByText(NIGHT_TITLE, { exact: true }).filter({ visible: true }).first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    // 1/1 tasks done — the old tasks-only roll-up said "Ready". The night's only
    // role was declined, so the truthful status is "Needs someone".
    await expect(page.getByText("Needs someone").filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Ready", { exact: true }).filter({ visible: true })).toHaveCount(0)

    // The week's STAFFING table is the other place a declined night lead used to
    // read as filled: its night rule counted assignment, not coverage.
    await page.getByRole("button", { name: "Roles", exact: true }).click()
    await expect(page.getByText(NIGHT_TITLE, { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Declined").filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText("0 / 1", { exact: true }).filter({ visible: true }).first()).toBeVisible()

    expect(errors, errors.join("\n")).toEqual([])
  })
})
