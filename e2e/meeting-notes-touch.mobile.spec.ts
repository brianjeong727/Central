// Mobile (390px) click-through for the touch-reachable agenda/decision removes
// added to Meeting Notes v2. Hover-gated X's and the agenda "detail…" reveal
// are unreachable on a phone (no hover) — this spec proves the isMobile branch
// makes them visible on load (before any interaction fakes a hover), that the
// first tap arms a two-step confirm instead of deleting, and that Cancel
// restores the resting X.
import { test, expect } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

const MOBILE = { viewport: { width: 390, height: 844 } } as const

let teamId = ""
const createdNoteIds: string[] = []

test.describe("Meeting Notes v2 — touch reachability (390px)", () => {
  test.use({ storageState: adminState, ...MOBILE })

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
  })

  test.afterAll(async () => {
    if (!hasLaneFixture || createdNoteIds.length === 0) return
    const sb = sandbox()
    await sb.client.from("meeting_note_agenda_items").delete().in("note_id", createdNoteIds)
    await sb.client.from("meeting_note_decisions").delete().in("note_id", createdNoteIds)
    await sb.client.from("meeting_notes").delete().in("id", createdNoteIds)
  })

  test("agenda X, decision X and the detail sub-line are reachable by tap, with two-step confirm", async ({ page }) => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const { data: lastRow } = await sb.client
      .from("meeting_notes").select("note_number").eq("team_id", teamId)
      .order("note_number", { ascending: false }).limit(1).maybeSingle()
    const noteNumber = ((lastRow as { note_number?: number } | null)?.note_number ?? 0) + 1
    const probeTitle = "E2E:: probe touch reach"
    const { data: note, error } = await sb.client
      .from("meeting_notes")
      .insert({ team_id: teamId, note_number: noteNumber, date: "2026-02-11", title: probeTitle, body: "", created_by: adminId, attendees: [adminId] })
      .select().single()
    expect(error).toBeFalsy()
    const noteId = (note as { id: string }).id
    createdNoteIds.push(noteId)

    const { data: agendaItem, error: agErr } = await sb.client
      .from("meeting_note_agenda_items")
      .insert({ note_id: noteId, text: "E2E:: probe agenda touch", sort_order: 0, created_by: adminId })
      .select().single()
    expect(agErr).toBeFalsy()

    const { error: decErr } = await sb.client
      .from("meeting_note_decisions")
      .insert({ note_id: noteId, text: "E2E:: probe decision touch", sort_order: 0, created_by: adminId })
    expect(decErr).toBeFalsy()

    // Navigate through the real hub→section→note click path rather than a hard
    // deep-link: a fresh page.goto() with ?notetab= already set races SSR (which
    // has no window.location, so it renders the Hub) against the client's lazy
    // useState re-read of the same params — a hydration mismatch that leaves a
    // hidden duplicate tree in the DOM. Clicking through avoids it entirely, and
    // is what a real user does anyway.
    await page.goto(`/home?tab=plan&team=${teamId}`)
    await page.getByText("Meeting notes", { exact: true }).filter({ visible: true }).first().click()
    await page.getByPlaceholder("Search notes & decisions…").filter({ visible: true }).first().waitFor({ timeout: 15000 })

    // ── The per-row ⋯ (where Delete lives now) at phone width. ──
    // The trigger claims ≥44px of its OWN width rather than overlaying an
    // expander leftwards, so a thumb aiming at the menu can never land on the
    // row and open the note. `data-pocket-row` must still be on the tappable
    // row button — e2e/mobile-screen-sweep discovers every phone screen through
    // it, so a PocketRow change that hoists it silently deletes that coverage.
    const rowMenu = page.getByRole("button", { name: `Actions for ${probeTitle}` }).filter({ visible: true }).first()
    await expect(rowMenu).toBeVisible()
    const menuBox = await rowMenu.boundingBox()
    expect(menuBox!.width).toBeGreaterThanOrEqual(44)
    // The 44px touch target is a `.tap-expand-y` CSS `::after` pseudo-element
    // (globals.css), not a child <span> — pseudo-elements aren't real DOM nodes,
    // so they're read via computed style rather than a locator. `left:0;right:0`
    // on the pseudo means it spans the button's own box exactly.
    const menuPseudo = await rowMenu.evaluate((el) => {
      const cs = window.getComputedStyle(el, "::after")
      return { height: parseFloat(cs.height), width: parseFloat(cs.width) }
    })
    expect(menuPseudo.height).toBeGreaterThanOrEqual(44)
    const rowButton = page.locator(`[data-pocket-row="${probeTitle}"]`).filter({ visible: true }).first()
    const rowBox = await rowButton.boundingBox()
    expect(menuBox!.x).toBeGreaterThanOrEqual(rowBox!.x + rowBox!.width - 1)

    await page.getByText(probeTitle, { exact: true }).filter({ visible: true }).first().click()
    await expect(page.getByText("Agenda", { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 20000 })

    // ── Reachable with no hover (touch devices have none) — asserted on first
    //    paint, before any click could fake a hover state. ──
    const agendaRemove = page.getByRole("button", { name: "Remove agenda item" })
    await expect(agendaRemove).toBeVisible()
    const decisionRemove = page.getByRole("button", { name: "Remove decision" })
    await expect(decisionRemove).toBeVisible()

    // Touch target is ≥44px even though the visible glyph stays small — the
    // hit area is the transparent aria-hidden expander pinned to the button's
    // OWN box (which claims 44px of width on touch), so it can never overhang
    // the text field beside it and arm the wrong remove.
    // Same `.tap-expand-y` pseudo-element technique as the kebab above — read via
    // computed style, and derive its screen position from the real button's own
    // rect (the pseudo spans `left:0;right:0` of it exactly).
    const removePseudo = await agendaRemove.evaluate((el) => {
      const cs = window.getComputedStyle(el, "::after")
      const rect = el.getBoundingClientRect()
      return { height: parseFloat(cs.height), width: parseFloat(cs.width), x: rect.x }
    })
    expect(removePseudo.width).toBeGreaterThanOrEqual(44)
    expect(removePseudo.height).toBeGreaterThanOrEqual(44)
    const agendaText = page.locator('input[value="E2E:: probe agenda touch"]')
    const textBox = await agendaText.boundingBox()
    // The expander starts at or after the text field's right edge — no overlap.
    expect(removePseudo.x).toBeGreaterThanOrEqual(textBox!.x + textBox!.width - 1)

    // The "detail…" line is revealed by INTERACTION, not painted empty under
    // every agenda item (which turns the note into a form). Tapping the item
    // reveals it for THAT row, and it is then usable by tap.
    const detailField = page.getByPlaceholder("detail…").filter({ visible: true })
    await expect(detailField).toHaveCount(0)
    await agendaText.click()
    await expect(detailField).toBeVisible()
    await detailField.click()
    await detailField.fill("E2E:: touch-added detail")
    await expect(detailField).toHaveValue("E2E:: touch-added detail")

    // …and it actually reaches the database (a lazy PostgREST builder that is
    // never awaited constructs the PATCH and throws it away).
    await expect.poll(async () => {
      const { data } = await sb.client
        .from("meeting_note_agenda_items").select("sub_text").eq("id", (agendaItem as { id: string }).id).single()
      return (data as { sub_text: string | null }).sub_text
    }, { timeout: 10000 }).toBe("E2E:: touch-added detail")

    // ── Agenda X: first tap arms confirm, never deletes directly. ──
    await agendaRemove.click()
    await expect(page.getByRole("button", { name: "Delete", exact: true }).first()).toBeVisible()
    await expect(page.locator('input[value="E2E:: probe agenda touch"]')).toBeVisible() // still there
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click()
    // Cancel restores the resting X, item untouched.
    await expect(page.getByRole("button", { name: "Remove agenda item" })).toBeVisible()
    await expect(page.locator('input[value="E2E:: probe agenda touch"]')).toBeVisible()
    const { data: agendaStillThere } = await sb.client.from("meeting_note_agenda_items").select("id").eq("id", (agendaItem as { id: string }).id).maybeSingle()
    expect(agendaStillThere).toBeTruthy()

    // ── Decision X: same two-step, independently armed from the agenda one. ──
    await decisionRemove.click()
    await expect(page.getByRole("button", { name: "Delete", exact: true }).first()).toBeVisible()
    await expect(page.locator("textarea", { hasText: "E2E:: probe decision touch" })).toBeVisible()
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click()
    await expect(page.getByRole("button", { name: "Remove decision" })).toBeVisible()
    await expect(page.locator("textarea", { hasText: "E2E:: probe decision touch" })).toBeVisible()
  })
})
