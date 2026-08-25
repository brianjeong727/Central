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

  // Lane guard: this spec resolves the hand-seeded "Student Org Board" team BY NAME.
  // Lane 2 (slot s2, port 3002) carries the tenant and two users only, so the lookup
  // returns 0 rows and .single() throws PGRST116 — a failure about seeding, not code.
  // Unlike the UUID-pinned specs, seeding lane 2 WOULD fix this one. See sandbox().hasRow.
  let hasLaneFixture = false

  test.beforeEach(() => {
    test.skip(!hasLaneFixture, "lane-1 fixture only (\"Student Org Board\" team) — see sandbox().hasRow")
  })

  test.beforeAll(async () => {
    const sb = sandbox()
    hasLaneFixture = await sb.hasRow("teams", { name: "Student Org Board", ministry_id: sb.ministryId })
    if (!hasLaneFixture) return
    const { data: team, error } = await sb.client
      .from("teams").select("id").eq("ministry_id", sb.ministryId).eq("name", "Student Org Board").single()
    if (error) throw error
    teamId = (team as { id: string }).id
    await cleanupProbes()
  })

  test.afterAll(async () => {
    if (!hasLaneFixture) return
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

  test("delete: danger zone removes the note from the list", async ({ page }) => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const { data: lastRow } = await sb.client
      .from("meeting_notes").select("note_number").eq("team_id", teamId)
      .order("note_number", { ascending: false }).limit(1).maybeSingle()
    const noteNumber = ((lastRow as { note_number?: number } | null)?.note_number ?? 0) + 1
    const probeTitle = "E2E:: probe delete me"
    const { data: note, error } = await sb.client
      .from("meeting_notes")
      .insert({ team_id: teamId, note_number: noteNumber, date: "2026-08-20", title: probeTitle, body: "", created_by: adminId, attendees: [adminId] })
      .select().single()
    expect(error).toBeFalsy()
    const noteId = (note as { id: string }).id
    createdNoteIds.push(noteId)

    await openNotes(page)
    await expect(page.getByText(probeTitle, { exact: true }).first()).toBeVisible({ timeout: 15000 })
    await page.getByText(probeTitle, { exact: true }).first().click()
    await expect(page.getByText("Danger zone")).toBeVisible({ timeout: 15000 })

    // Opening the danger zone button must not delete on one click.
    await page.getByRole("button", { name: "Delete note" }).click()
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Delete", exact: true }).click()

    // Back on the list, and the note is genuinely gone (not just the detail closed).
    await expect(page.getByPlaceholder("Search notes & decisions…")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(probeTitle, { exact: true })).toHaveCount(0)

    const { data: gone } = await sb.client.from("meeting_notes").select("id").eq("id", noteId).maybeSingle()
    expect(gone).toBeNull()
    createdNoteIds.splice(createdNoteIds.indexOf(noteId), 1) // already gone, cleanup afterAll would no-op anyway
  })

  test("editable date: moving a note to a different month re-sorts and re-groups the list", async ({ page }) => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const { data: lastRow } = await sb.client
      .from("meeting_notes").select("note_number").eq("team_id", teamId)
      .order("note_number", { ascending: false }).limit(1).maybeSingle()
    const noteNumber = ((lastRow as { note_number?: number } | null)?.note_number ?? 0) + 1
    const probeTitle = "E2E:: probe date move"
    const { data: note, error } = await sb.client
      .from("meeting_notes")
      .insert({ team_id: teamId, note_number: noteNumber, date: "2026-01-10", title: probeTitle, body: "", created_by: adminId, attendees: [adminId] })
      .select().single()
    expect(error).toBeFalsy()
    const noteId = (note as { id: string }).id
    createdNoteIds.push(noteId)

    await openNotes(page)
    await expect(page.getByText("January 2026")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(probeTitle, { exact: true })).toBeVisible()
    await page.getByText(probeTitle, { exact: true }).first().click()
    await expect(page.getByText("Agenda", { exact: true })).toBeVisible({ timeout: 15000 })

    // Open the date editor and move it to a different month.
    await page.getByLabel("Change the meeting date").click()
    const dateInput = page.locator('input[type="date"]')
    await expect(dateInput).toBeVisible()
    // A half-typed year must never reach the database — the date is held
    // locally and committed on Enter/blur, and an implausible year is dropped.
    await dateInput.fill("0002-05-15")
    await dateInput.press("Enter")
    await expect(page.getByLabel("Change the meeting date")).toBeVisible()
    const { data: unchanged } = await sb.client.from("meeting_notes").select("date").eq("id", noteId).single()
    expect((unchanged as { date: string }).date).toBe("2026-01-10")

    await page.getByLabel("Change the meeting date").click()
    await expect(dateInput).toBeVisible()
    await dateInput.fill("2026-05-15")
    await dateInput.press("Enter")

    // DB truth: the plain YYYY-MM-DD string, no round-trip through a Date.
    await expect.poll(async () => {
      const { data } = await sb.client.from("meeting_notes").select("date").eq("id", noteId).single()
      return (data as { date: string }).date
    }, { timeout: 10000 }).toBe("2026-05-15")

    // Back to the list — row moved out of January into May, digest re-sorted.
    await page.locator("div.h-12").getByRole("button", { name: "Meeting Notes", exact: true }).click()
    await expect(page.getByPlaceholder("Search notes & decisions…")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("May 2026")).toBeVisible({ timeout: 15000 })
    const mayGroup = page.locator("div", { has: page.getByText("May 2026") }).first()
    await expect(mayGroup.getByText(probeTitle, { exact: true })).toBeVisible()
    // January 2026 group had only this probe note — it should no longer appear.
    await expect(page.getByText("January 2026")).toHaveCount(0)
  })

  test("editable decision text persists across navigate away and back", async ({ page }) => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const { data: lastRow } = await sb.client
      .from("meeting_notes").select("note_number").eq("team_id", teamId)
      .order("note_number", { ascending: false }).limit(1).maybeSingle()
    const noteNumber = ((lastRow as { note_number?: number } | null)?.note_number ?? 0) + 1
    const probeTitle = "E2E:: probe decision edit"
    const { data: note, error } = await sb.client
      .from("meeting_notes")
      .insert({ team_id: teamId, note_number: noteNumber, date: "2026-04-02", title: probeTitle, body: "", created_by: adminId, attendees: [adminId] })
      .select().single()
    expect(error).toBeFalsy()
    const noteId = (note as { id: string }).id
    createdNoteIds.push(noteId)
    const { data: decision, error: decErr } = await sb.client
      .from("meeting_note_decisions")
      .insert({ note_id: noteId, text: "E2E:: original decision text", sort_order: 0, created_by: adminId })
      .select().single()
    expect(decErr).toBeFalsy()
    const decisionId = (decision as { id: string }).id

    await openNotes(page)
    await page.getByText(probeTitle, { exact: true }).first().click()
    await expect(page.getByText("E2E:: original decision text")).toBeVisible({ timeout: 15000 })

    const decisionField = page.getByPlaceholder("Decision…", { exact: true })
    await decisionField.click()
    await decisionField.fill("E2E:: edited decision text")

    // Navigate away immediately — the pending debounced write must FLUSH on
    // unmount, not get silently dropped.
    await page.locator("div.h-12").getByRole("button", { name: "Meeting Notes", exact: true }).click()
    await expect(page.getByPlaceholder("Search notes & decisions…")).toBeVisible({ timeout: 15000 })

    await page.getByText(probeTitle, { exact: true }).first().click()
    await expect(page.getByText("E2E:: edited decision text")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("E2E:: original decision text")).toHaveCount(0)

    // Poll: the flushed write is fired on unmount and the assertions above are
    // all served from the SWR cache, so they resolve before the PATCH lands.
    await expect.poll(async () => {
      const { data } = await sb.client.from("meeting_note_decisions").select("text").eq("id", decisionId).single()
      return (data as { text: string }).text
    }, { timeout: 10000 }).toBe("E2E:: edited decision text")
  })

  // Check-off is PRE-EXISTING shipped behaviour, and the debounce refactor
  // silently regressed it: the optimistic ✓ painted, the PATCH was never sent,
  // and a reload reverted it. Guarding the DB, not the checkmark.
  test("agenda check-off reaches the database", async ({ page }) => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const { data: lastRow } = await sb.client
      .from("meeting_notes").select("note_number").eq("team_id", teamId)
      .order("note_number", { ascending: false }).limit(1).maybeSingle()
    const noteNumber = ((lastRow as { note_number?: number } | null)?.note_number ?? 0) + 1
    const probeTitle = "E2E:: probe check off"
    const { data: note, error } = await sb.client
      .from("meeting_notes")
      .insert({ team_id: teamId, note_number: noteNumber, date: "2026-04-03", title: probeTitle, body: "", created_by: adminId, attendees: [adminId] })
      .select().single()
    expect(error).toBeFalsy()
    const noteId = (note as { id: string }).id
    createdNoteIds.push(noteId)
    const { data: item, error: itemErr } = await sb.client
      .from("meeting_note_agenda_items")
      .insert({ note_id: noteId, text: "E2E:: check me off", sort_order: 0, created_by: adminId })
      .select().single()
    expect(itemErr).toBeFalsy()
    const itemId = (item as { id: string }).id

    await openNotes(page)
    await page.getByText(probeTitle, { exact: true }).first().click()
    await expect(page.locator('input[value="E2E:: check me off"]')).toBeVisible({ timeout: 15000 })

    await page.getByRole("button", { name: "Mark covered" }).first().click()
    await expect.poll(async () => {
      const { data } = await sb.client.from("meeting_note_agenda_items").select("done").eq("id", itemId).single()
      return (data as { done: boolean }).done
    }, { timeout: 10000 }).toBe(true)

    // Survives a reload — the checkmark is coming from the row, not the cache.
    await page.reload()
    await openNotes(page)
    await page.getByText(probeTitle, { exact: true }).first().click()
    await expect(page.getByRole("button", { name: "Mark not covered" }).first()).toBeVisible({ timeout: 15000 })
  })

})
