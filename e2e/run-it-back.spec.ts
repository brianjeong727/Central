// Click-through coverage for history-first event creation (Run-it-back shelf).
//
// The New Event modal now opens on a three-path chooser: (1) "Run it back" —
// per-season playbooks from event_templates (yearbook keyed on lineage+season),
// one-click inherit that recreates the full plan with dates recomputed and
// roles unassigned; (2) two quick presets (social / ministry); (3) free-form
// "Start from scratch" whose capability modules persist to
// event_plans.type_data.extras and surface as extra tabs on the event hub.
//
// Drives the seeded E2E-sandbox fixture (scripts/seed-ccsf-events.mjs):
// Student Org Board team, 13 compiled "2025–26" playbooks incl. Coffeehouse.
// Created probe events are cleaned up exactly by title in afterAll.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

const INHERIT_TITLE = "E2E:: Coffeehouse Rerun"
const CUSTOM_TITLE = "E2E:: Custom Night"
const PROBE_TITLES = [INHERIT_TITLE, CUSTOM_TITLE]

let teamId = ""

async function cleanupProbes() {
  const sb = sandbox()
  const { data: evs } = await sb.client
    .from("calendar_events").select("id")
    .eq("ministry_id", sb.ministryId).in("title", PROBE_TITLES)
  const ids = (evs ?? []).map((e: { id: string }) => e.id)
  if (!ids.length) return
  const { data: plans } = await sb.client.from("event_plans").select("id").in("calendar_event_id", ids)
  const planIds = (plans ?? []).map((p: { id: string }) => p.id)
  if (planIds.length) {
    await sb.client.from("event_tasks").delete().in("event_plan_id", planIds)
    await sb.client.from("event_roles").delete().in("event_plan_id", planIds)
    await sb.client.from("event_plans").delete().in("id", planIds)
  }
  await sb.client.from("calendar_events").delete().in("id", ids)
}

test.describe("Run-it-back shelf (history-first creation)", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  test.beforeAll(async () => {
    const sb = sandbox()
    const { data: team, error } = await sb.client
      .from("teams").select("id").eq("ministry_id", sb.ministryId).eq("name", "Student Org Board").single()
    if (error) throw error
    teamId = (team as { id: string }).id
    await cleanupProbes()
  })

  test.afterAll(async () => {
    await cleanupProbes()
  })

  async function openChooser(page: Page) {
    await page.goto(`/home?tab=plan&team=${teamId}`)
    await expect(page.getByRole("button", { name: /Welcome Week/ }).first()).toBeVisible({ timeout: 20000 })
    await page.getByRole("button", { name: "New Event" }).click()
  }

  test("chooser shows the season shelf and the quick/custom paths", async ({ page }) => {
    await openChooser(page)
    await expect(page.getByText("Run it back — past seasons")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("2025–26").first()).toBeVisible()
    // Compiled playbook rows carry stats; Coffeehouse is one of them.
    await expect(page.getByRole("button", { name: /Coffeehouse.*Run it back/s }).first()).toBeVisible()
    await expect(page.getByText("Start something new")).toBeVisible()
    await expect(page.getByRole("button", { name: /Quick social/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Quick gathering/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Start from scratch/ })).toBeVisible()
  })

  test("inheriting a playbook recreates the full plan — dates recomputed, roles unassigned", async ({ page }) => {
    await openChooser(page)
    await page.getByRole("button", { name: /Coffeehouse.*Run it back/s }).first().click()
    // Shelf detail: title prefilled from the playbook, date suggested from the source event.
    await expect(page.getByText(/Inheriting “Coffeehouse” \(2025–26\)/)).toBeVisible()
    const titleInput = page.getByPlaceholder("Event name")
    await expect(titleInput).toHaveValue("Coffeehouse")
    await titleInput.fill(INHERIT_TITLE)
    await page.getByRole("button", { name: "Inherit & create" }).click()

    // Lands in the new event's plan workspace.
    await expect(page.getByRole("heading", { name: INHERIT_TITLE }).first()).toBeVisible({ timeout: 20000 })

    // DB truth: full checklist + roles, every assignment empty, no past-due dates.
    const sb = sandbox()
    const { data: ev } = await sb.client
      .from("calendar_events").select("id, start_date").eq("ministry_id", sb.ministryId).eq("title", INHERIT_TITLE).single()
    const { data: plan } = await sb.client
      .from("event_plans").select("id, template_id").eq("calendar_event_id", (ev as { id: string }).id).single()
    expect((plan as { template_id: string | null }).template_id).not.toBeNull()
    const { data: tasks } = await sb.client
      .from("event_tasks").select("due_date, assigned_to, completed").eq("event_plan_id", (plan as { id: string }).id)
    const { data: roles } = await sb.client
      .from("event_roles").select("role_name, assigned_to").eq("event_plan_id", (plan as { id: string }).id)
    expect((tasks ?? []).length).toBeGreaterThanOrEqual(20)
    expect((roles ?? []).length).toBeGreaterThanOrEqual(6)
    for (const t of tasks ?? []) {
      expect(t.assigned_to).toBeNull()
      expect(t.completed).toBe(false)
    }
    for (const r of roles ?? []) expect(r.assigned_to).toBeNull()
    // Past-clamp: nothing due before today — in PT, matching the action's
    // deliberate America/Los_Angeles anchor (see event-templates.ts).
    const todayPT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date())
    for (const t of tasks ?? []) if (t.due_date) expect(t.due_date >= todayPT).toBe(true)
  })

  test("free-form creation persists capability modules and surfaces their tabs", async ({ page }) => {
    await openChooser(page)
    await page.getByRole("button", { name: /Start from scratch/ }).click()
    await page.getByPlaceholder("Event name").fill(CUSTOM_TITLE)
    await expect(page.getByText("What does this event need?")).toBeVisible()
    await page.getByRole("button", { name: "Performances", exact: true }).click()
    await page.getByRole("button", { name: "Transport", exact: true }).click()
    await page.getByRole("button", { name: "Create event" }).click()

    await expect(page.getByRole("heading", { name: CUSTOM_TITLE }).first()).toBeVisible({ timeout: 20000 })
    // The chosen modules render as tabs on the event hub; blank checklist otherwise.
    await expect(page.getByRole("button", { name: "Acts", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Transport", exact: true })).toBeVisible()

    const sb = sandbox()
    const { data: ev } = await sb.client
      .from("calendar_events").select("id").eq("ministry_id", sb.ministryId).eq("title", CUSTOM_TITLE).single()
    const { data: plan } = await sb.client
      .from("event_plans").select("id, type_data").eq("calendar_event_id", (ev as { id: string }).id).single()
    expect(((plan as { type_data: { extras?: string[] } }).type_data?.extras ?? []).sort()).toEqual(["acts", "transport"])
    const { data: tasks } = await sb.client.from("event_tasks").select("id").eq("event_plan_id", (plan as { id: string }).id)
    expect((tasks ?? []).length).toBe(0)
  })

  test("quick preset ghosts its content — dimmed placeholder, Tab accepts", async ({ page }) => {
    await openChooser(page)
    await page.getByRole("button", { name: /Quick social/ }).click()
    // Ghost content renders as placeholders (fields stay EMPTY), Game Night themed.
    const titleInput = page.getByPlaceholder("Game Night", { exact: true })
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toHaveValue("")
    await expect(page.getByPlaceholder("Church fellowship hall")).toHaveValue("")
    // Tab accepts the suggestion into the field.
    await titleInput.focus()
    await titleInput.press("Tab")
    await expect(titleInput).toHaveValue("Game Night")
    // Back returns to the chooser without losing the modal.
    await page.getByRole("button", { name: "← All options" }).click()
    await expect(page.getByText("Run it back — past seasons")).toBeVisible()
  })
})
