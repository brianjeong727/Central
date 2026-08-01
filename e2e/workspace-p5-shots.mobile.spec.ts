// Phase 5 (Workspace family) mobile screenshot harness — Pocket Daybreak v2.
//
// Seeds a rich Student-Org workspace (events + plan/tasks/roles/showtime,
// meeting notes w/ agenda+decisions, generated groups, rotations) plus a 2nd
// team so the ws-root picker renders, then captures the 13 named screens at
// 390x844 for visual sign-off. Guarded on WS_SHOT_DIR — without it the seed +
// assertions still run (smoke), but no PNGs are written.
//
// Both desktop ("hidden md:flex") and mobile ("md:hidden") trees co-mount; every
// locator is narrowed with .filter({ visible: true }) (mirrors mobile-plan-workspace).
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"
import { countdownPresetPhases } from "../app/home/event-presets-data.mjs"
import { promises as fs } from "node:fs"
import { join } from "node:path"

const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } as const
const SHOT_DIR = process.env.WS_SHOT_DIR

const LEAD_NAME = `${E2E_PREFIX}Leadership Team`
const WORSHIP_NAME = `${E2E_PREFIX}Worship Team`

function ymd(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}
function iso(offsetDays: number, hhmm: string): string {
  return `${ymd(offsetDays)}T${hhmm}:00`
}

async function shot(page: Page, name: string) {
  if (!SHOT_DIR) return
  await fs.mkdir(SHOT_DIR, { recursive: true })
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`) })
}

test.describe("workspace p5 shots (mobile)", () => {
  test.use({ storageState: adminState, ...MOBILE })

  let adminId: string
  let memberId: string
  let leadTeamId: string
  let worshipTeamId: string
  let kickoffEventId: string
  let planId: string
  let sessionId: string
  let noteId: string
  let semesterId: string

  test.beforeAll(async () => {
    const sb = sandbox()
    const db = sb.client
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()

    // ── Two teams: Leadership (studentOrg) + Worship (so the picker renders) ──
    for (const [name, ref] of [[LEAD_NAME, "lead"], [WORSHIP_NAME, "worship"]] as const) {
      const { data: team, error } = await db.from("teams")
        .insert({ ministry_id: sb.ministryId, name, description: "e2e p5", team_type: "standard", created_by: adminId })
        .select().single()
      if (error) throw error
      const { data: pres } = await db.from("team_roles")
        .insert({ team_id: team.id, name: "President", permissions: ["can_plan_events", "can_view_finances", "can_manage_members", "can_track_attendance", "can_manage_team"], is_president: true })
        .select().single()
      const { data: mem } = await db.from("team_roles")
        .insert({ team_id: team.id, name: "Member", permissions: ["can_plan_events"], is_president: false })
        .select().single()
      await db.from("team_members").insert({ team_id: team.id, user_id: adminId, role_id: pres!.id, added_by: adminId })
      await db.from("team_members").insert({ team_id: team.id, user_id: memberId, role_id: mem!.id, added_by: adminId })
      if (ref === "lead") leadTeamId = team.id
      else worshipTeamId = team.id
    }

    // ── Events (soonest carries a full plan) ──
    const events = [
      { title: `${E2E_PREFIX}Kickoff Night`, start: iso(3, "19:00"), end: iso(3, "21:00"), loc: "Campus Chapel" },
      { title: `${E2E_PREFIX}Sunday Service`, start: iso(6, "10:00"), end: iso(6, "11:30"), loc: "Main Sanctuary" },
      { title: `${E2E_PREFIX}Welcome Dinner`, start: iso(9, "18:00"), end: iso(9, "20:00"), loc: "Fellowship Hall" },
    ]
    for (const [i, e] of events.entries()) {
      const { data: ev } = await db.from("calendar_events")
        .insert({ ministry_id: sb.ministryId, team_id: leadTeamId, title: e.title, description: "Worship + fellowship in the campus chapel. Dessert afterward.", location: e.loc, start_date: e.start, end_date: e.end, all_day: false, event_type: "social", recurring: i === 1, created_by: adminId })
        .select().single()
      if (i === 0) kickoffEventId = ev!.id
    }

    // Plan + tasks + roles + showtime blocks on the Kickoff event
    const { data: plan } = await db.from("event_plans")
      .insert({ ministry_id: sb.ministryId, calendar_event_id: kickoffEventId, created_by: adminId, countdown_phases: countdownPresetPhases("long") })
      .select().single()
    planId = plan!.id
    await db.from("event_roles").insert([
      { event_plan_id: planId, role_name: "Worship lead", notes: null, assigned_to: memberId, created_by: adminId },
      { event_plan_id: planId, role_name: "Greeters & first-timers", notes: null, assigned_to: adminId, created_by: adminId },
    ])
    const tasks = [
      { title: "Confirm chapel reservation", phase: "planning", off: -14, done: true },
      { title: "Line up the worship team", phase: "planning", off: -12, done: true },
      { title: "Design & post the announcement", phase: "planning", off: -10, done: true },
      { title: "Order dessert (keep it under $40)", phase: "crunch", off: -2, done: false },
      { title: "Prepare welcome slides", phase: "crunch", off: -2, done: false },
      { title: "Set up sound & seating", phase: "crunch", off: -1, done: false },
      { title: "Brief the greeter team", phase: "crunch", off: -1, done: false },
      { title: "Send thank-you + follow-up to first-timers", phase: "crunch", off: 1, done: false },
    ]
    await db.from("event_tasks").insert(tasks.map((t, i) => ({
      event_plan_id: planId, title: t.title, phase: t.phase, due_date: ymd(3 + t.off), sort_order: i, completed: t.done,
      assigned_to: i % 2 === 0 ? adminId : memberId, created_by: adminId,
    })))
    await db.from("event_blocks").insert([
      { ministry_id: sb.ministryId, event_plan_id: planId, day_index: 0, title: "Doors + greeters in place", time_label: "6:30 PM", start_time: "18:30", owner_id: adminId, sort_order: 0, created_by: adminId },
      { ministry_id: sb.ministryId, event_plan_id: planId, day_index: 0, title: "Worship set (4 songs)", time_label: "7:00 PM", start_time: "19:00", owner_id: memberId, sort_order: 1, created_by: adminId },
      { ministry_id: sb.ministryId, event_plan_id: planId, day_index: 0, title: "Message + prayer", time_label: "7:40 PM", start_time: "19:40", owner_id: adminId, sort_order: 2, created_by: adminId },
      { ministry_id: sb.ministryId, event_plan_id: planId, day_index: 0, title: "Dessert + hangout", time_label: "8:10 PM", start_time: "20:10", owner_id: null, sort_order: 3, created_by: adminId },
    ])

    // ── Meeting notes ──
    const notes = [
      { n: 1, title: `${E2E_PREFIX}Semester Kickoff Planning`, date: ymd(-25) },
      { n: 2, title: `${E2E_PREFIX}Small Group Placements`, date: ymd(-17) },
      { n: 3, title: `${E2E_PREFIX}Weekly Leadership Sync`, date: ymd(-3) },
    ]
    for (const [i, nrow] of notes.entries()) {
      const { data: note } = await db.from("meeting_notes")
        .insert({ team_id: leadTeamId, note_number: nrow.n, date: nrow.date, title: nrow.title, body: "First leadership sync of the semester. Set the tone and locked in the big rocks.\n\nEveryone brings one new student they invited.", created_by: adminId, attendees: [adminId, memberId] })
        .select().single()
      if (i === 0) {
        noteId = note!.id
        await db.from("meeting_note_agenda_items").insert([
          { note_id: noteId, text: "Set semester rhythm", sort_order: 0, done: true, created_by: adminId },
          { note_id: noteId, text: "Assign event owners", sort_order: 1, done: true, created_by: adminId },
        ])
        await db.from("meeting_note_decisions").insert([
          { note_id: noteId, text: "Friday Night Worship stays weekly, campus chapel, 7pm.", sort_order: 0, created_by: adminId },
        ])
      }
    }

    // ── Generated groups ──
    const { data: session } = await db.from("group_sessions")
      .insert({ ministry_id: sb.ministryId, team_id: leadTeamId, name: `${E2E_PREFIX}Fall 2026 Small Groups`, source_type: "ministry", config: { numGroups: 2 }, created_by: adminId })
      .select().single()
    sessionId = session!.id
    const { data: g1 } = await db.from("generated_groups").insert({ session_id: sessionId, name: "Tuesday Night DG", order_index: 0 }).select().single()
    const { data: g2 } = await db.from("generated_groups").insert({ session_id: sessionId, name: "Thursday Night DG", order_index: 1 }).select().single()
    await db.from("generated_group_members").insert([
      { group_id: g1!.id, user_id: adminId },
      { group_id: g2!.id, user_id: memberId },
    ])

    // ── Rotations ──
    const { data: sem } = await db.from("rotation_semesters")
      .insert({ ministry_id: sb.ministryId, team_id: leadTeamId, name: `${E2E_PREFIX}Fall 2026`, start_date: ymd(-14), end_date: ymd(56), created_by: adminId })
      .select().single()
    semesterId = sem!.id
    const rotRows = [-14, -7, 0, 7, 14, 21, 28].map((off, i) => ({
      ministry_id: sb.ministryId, team_id: leadTeamId, semester_id: semesterId, rotation_type: "sunday_lunch_prayer",
      week_date: ymd(off), assigned_to: i === 0 ? adminId : i === 1 ? memberId : null,
    }))
    await db.from("ccsf_rotations").insert(rotRows)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    const db = sb.client
    if (sessionId) {
      const { data: gs } = await db.from("generated_groups").select("id").eq("session_id", sessionId)
      for (const g of gs ?? []) await db.from("generated_group_members").delete().eq("group_id", g.id)
      await db.from("generated_groups").delete().eq("session_id", sessionId)
      await db.from("group_sessions").delete().eq("id", sessionId)
    }
    if (semesterId) {
      await db.from("ccsf_rotations").delete().eq("semester_id", semesterId)
      await db.from("rotation_semesters").delete().eq("id", semesterId)
    }
    for (const tid of [leadTeamId, worshipTeamId]) {
      if (!tid) continue
      const { data: evs } = await db.from("calendar_events").select("id").eq("team_id", tid)
      for (const ev of evs ?? []) {
        const { data: pl } = await db.from("event_plans").select("id").eq("calendar_event_id", ev.id)
        for (const p of pl ?? []) {
          await db.from("event_tasks").delete().eq("event_plan_id", p.id)
          await db.from("event_roles").delete().eq("event_plan_id", p.id)
          await db.from("event_blocks").delete().eq("event_plan_id", p.id)
          await db.from("event_plans").delete().eq("id", p.id)
        }
        await db.from("calendar_events").delete().eq("id", ev.id)
      }
      const { data: nts } = await db.from("meeting_notes").select("id").eq("team_id", tid)
      for (const n of nts ?? []) {
        await db.from("meeting_note_agenda_items").delete().eq("note_id", n.id)
        await db.from("meeting_note_decisions").delete().eq("note_id", n.id)
      }
      await db.from("meeting_notes").delete().eq("team_id", tid)
      await db.from("team_members").delete().eq("team_id", tid)
      await db.from("team_roles").delete().eq("team_id", tid)
      await db.from("teams").delete().eq("id", tid)
    }
  })

  test("capture the 13 workspace screens", async ({ page }) => {
    test.setTimeout(180_000)
    // 1. ws root (picker)
    await page.goto("/home?tab=plan")
    await expect(page.getByText("Your workspaces", { exact: true }).filter({ visible: true })).toBeVisible()
    await shot(page, "ws")

    // 2. hub
    await page.getByText(LEAD_NAME, { exact: false }).filter({ visible: true }).first().click()
    await expect(page.getByText("Planning", { exact: true }).filter({ visible: true })).toBeVisible()
    await shot(page, "hub")

    // 3. events
    await page.goto(`/home?tab=plan&team=${leadTeamId}&sotab=Events`)
    await expect(page.getByText("Kickoff Night", { exact: false }).filter({ visible: true }).first()).toBeVisible()
    await shot(page, "events")

    // 4. event detail (click the soonest event → plan hub)
    await page.getByText("Kickoff Night", { exact: false }).filter({ visible: true }).first().click()
    await expect(page.getByText("Jump into planning", { exact: false }).filter({ visible: true })).toBeVisible()
    await shot(page, "event")

    // 5. spokes — re-enter the event each time (spokes use router.replace, not push)
    const openEventSpoke = async (rowText: string, name: string) => {
      await page.goto(`/home?tab=plan&team=${leadTeamId}&sotab=Events`)
      await page.getByText("Kickoff Night", { exact: false }).filter({ visible: true }).first().click()
      await expect(page.getByText("Jump into planning", { exact: false }).filter({ visible: true })).toBeVisible()
      await page.getByText(rowText, { exact: false }).filter({ visible: true }).first().click()
      await page.waitForTimeout(700)
      await shot(page, name)
    }
    await openEventSpoke("Countdown", "countdown")
    await openEventSpoke("Roles & Leads", "roles")
    await openEventSpoke("Run of Show", "runofshow")

    // 6. notes list
    await page.goto(`/home?tab=plan&team=${leadTeamId}&sotab=Meeting Notes`)
    await expect(page.getByText("Semester Kickoff Planning", { exact: false }).filter({ visible: true }).first()).toBeVisible()
    await shot(page, "notes")

    // 7. note detail
    await page.getByText("Semester Kickoff Planning", { exact: false }).filter({ visible: true }).first().click()
    await page.waitForTimeout(600)
    await shot(page, "noteDetail")

    // 8. calendar
    await page.goto(`/home?tab=plan&team=${leadTeamId}&sotab=General`)
    await page.waitForTimeout(600)
    await shot(page, "cal")

    // 9. resources
    await page.goto(`/home?tab=plan&team=${leadTeamId}&sotab=Resources`)
    await page.waitForTimeout(600)
    await shot(page, "resources")

    // 10. groups
    await page.goto(`/home?tab=plan&team=${leadTeamId}&sotab=Groups`)
    await expect(page.getByText("Fall 2026 Small Groups", { exact: false }).filter({ visible: true }).first()).toBeVisible()
    await shot(page, "groups")

    // 11. group detail
    await page.getByText("Fall 2026 Small Groups", { exact: false }).filter({ visible: true }).first().click()
    await page.waitForTimeout(600)
    await shot(page, "groupDetail")

    // 12. rotations
    await page.goto(`/home?tab=plan&team=${leadTeamId}&sotab=Rotations`)
    await page.waitForTimeout(600)
    await shot(page, "rotations")

    // 13. team settings (gear in the hub chrome)
    await page.goto(`/home?tab=plan&team=${leadTeamId}`)
    await page.getByTitle("Team settings").filter({ visible: true }).first().click()
    await expect(page.getByText("Roles", { exact: true }).filter({ visible: true })).toBeVisible()
    await shot(page, "teamSettings")
  })
})
