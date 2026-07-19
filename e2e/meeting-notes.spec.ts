// Click-through coverage for Meeting Notes v2 (Variant B redesign).
//
// List = month-grouped digest rows (decision summary + count, linked-event
// chip, attendee avatars, derived Draft badge) with search across titles AND
// decision text. Editor = pinned Agenda (check-off) + Decisions (cards that
// feed the digest) + freeform Tiptap Notes, plus a linked-event chip whose
// whisper deep-links into the event's plan workspace. Fixtures: 5 real
// 2025–26 CCSF notes seeded by scripts/seed-ccsf-events.mjs.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

const PROBE_DECISION = "E2E:: probe decision — snacks budget doubled"
const PROBE_AGENDA = "E2E:: probe agenda item"
const PROBE_NOTE_TITLES = [/^Board Meeting — Jul/, /^Board Meeting — /] // created-note cleanup uses exact ids instead

let teamId = ""
const createdNoteIds: string[] = []

async function cleanupProbes() {
  const sb = sandbox()
  await sb.client.from("meeting_note_decisions").delete().eq("text", PROBE_DECISION)
  await sb.client.from("meeting_note_agenda_items").delete().eq("text", PROBE_AGENDA)
  if (createdNoteIds.length) {
    await sb.client.from("meeting_note_agenda_items").delete().in("note_id", createdNoteIds)
    await sb.client.from("meeting_note_decisions").delete().in("note_id", createdNoteIds)
    await sb.client.from("meeting_notes").delete().in("id", createdNoteIds)
  }
}

test.describe("Meeting Notes v2", () => {
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

  async function openNotes(page: Page) {
    await page.goto(`/home?tab=plan&team=${teamId}`)
    await expect(page.getByLabel("Season")).toBeVisible({ timeout: 20000 })
    await page.getByText("Meeting Notes", { exact: true }).first().click()
    await expect(page.getByPlaceholder("Search notes & decisions…")).toBeVisible({ timeout: 15000 })
  }

  test("list shows month-grouped digest rows from the seeded fixtures", async ({ page }) => {
    await openNotes(page)
    // Month headers + digest content from the real 2025-26 notes.
    await expect(page.getByText("October 2025")).toBeVisible()
    await expect(page.getByText(/Shirts priced at \$10/).first()).toBeVisible()
    await expect(page.getByText("3 decisions").first()).toBeVisible()
    // Linked-event chip on the Turkeybowl note row.
    await expect(page.getByText("Guys Turkeybowl", { exact: true }).first()).toBeVisible()
    // Search filters across decisions text.
    await page.getByPlaceholder("Search notes & decisions…").fill("flowers")
    await expect(page.getByText("Board Meeting — Turkeybowl logistics").first()).toBeVisible()
    await expect(page.getByText("Board Meeting — Summer kickoff")).toHaveCount(0)
  })

  test("editor: agenda check-off persists; new decision lands in the list digest", async ({ page }) => {
    // Reset the fixture item so the check-off is exercised every run.
    const sbReset = sandbox()
    await sbReset.client.from("meeting_note_agenda_items").update({ done: false }).eq("text", "Retreat planning roles for next year")
    await openNotes(page)
    await page.getByText("Board Meeting — Transition planning").first().click()
    // Sections render with fixture content.
    await expect(page.getByText("Agenda", { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('input[placeholder="Agenda item…"]').nth(2)).toHaveValue("Retreat planning roles for next year")

    // Check off the open agenda item (numbered 3 → ✓).
    await page.getByRole("button", { name: "Mark covered" }).first().click()

    // Record a probe decision.
    await page.getByPlaceholder(/Record another decision/).fill(PROBE_DECISION)
    await page.getByPlaceholder(/Record another decision/).press("Enter")
    await expect(page.getByText(PROBE_DECISION)).toBeVisible()

    // DB truth: agenda done persisted + decision row exists.
    const sb = sandbox()
    const { data: dec } = await sb.client.from("meeting_note_decisions").select("id, note_id").eq("text", PROBE_DECISION).single()
    expect(dec).toBeTruthy()
    const { data: agenda } = await sb.client
      .from("meeting_note_agenda_items").select("done").eq("note_id", (dec as { note_id: string }).note_id).eq("text", "Retreat planning roles for next year").single()
    expect((agenda as { done: boolean }).done).toBe(true)

    // Back to the list via the TOPBAR breadcrumb — that row's decision count now reads 3.
    await page.locator("div.h-12").getByRole("button", { name: "Meeting Notes", exact: true }).click()
    const row = page.getByRole("button", { name: "Open Board Meeting — Transition planning" })
    await expect(row.getByText("3 decisions")).toBeVisible({ timeout: 15000 })
  })

  test("linked-event whisper opens the event's plan workspace", async ({ page }) => {
    await openNotes(page)
    await page.getByText("Board Meeting — Turkeybowl logistics").first().click()
    await expect(page.getByText(/Follow-up tasks belong on the event/)).toBeVisible({ timeout: 15000 })
    await page.getByRole("button", { name: /Open Guys Turkeybowl planning/ }).click()
    // Event plan workspace opens on the linked event.
    await expect(page.getByRole("heading", { name: "Guys Turkeybowl" }).first()).toBeVisible({ timeout: 20000 })
  })

  test("create note: auto title, draft badge, breadcrumb round-trip spawns nothing", async ({ page }) => {
    await openNotes(page)
    const sb = sandbox()
    const before = await sb.client.from("meeting_notes").select("id").eq("team_id", teamId)
    await page.getByRole("button", { name: /New note/i }).first().click()
    await expect(page.getByText("Agenda", { exact: true })).toBeVisible({ timeout: 15000 })

    // Track for cleanup.
    const after = await sb.client.from("meeting_notes").select("id, title, date").eq("team_id", teamId)
    const beforeIds = new Set((before.data ?? []).map((n: { id: string }) => n.id))
    const created = (after.data ?? []).filter((n: { id: string }) => !beforeIds.has(n.id))
    expect(created.length).toBe(1)
    createdNoteIds.push(...created.map((n: { id: string }) => n.id))
    expect((created[0] as { title: string }).title).toMatch(/^Board Meeting — /)

    // Breadcrumb back → list; round-trip twice; count unchanged (regression).
    await page.locator("div.h-12").getByRole("button", { name: "Meeting Notes", exact: true }).click()
    await expect(page.getByPlaceholder("Search notes & decisions…")).toBeVisible({ timeout: 15000 })
    // New empty note shows the Draft badge.
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible()
    await page.getByText(/^Board Meeting — /).first().click()
    await expect(page.getByText("Agenda", { exact: true })).toBeVisible({ timeout: 15000 })
    await page.locator("div.h-12").getByRole("button", { name: "Meeting Notes", exact: true }).click()
    await page.waitForTimeout(1000)
    const final = await sb.client.from("meeting_notes").select("id").eq("team_id", teamId)
    expect((final.data ?? []).length).toBe((before.data ?? []).length + 1)
  })
})
