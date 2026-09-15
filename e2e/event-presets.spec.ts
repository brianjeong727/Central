// Every event preset is creatable (T2).
//
// event-presets-data.mjs has held SEVEN playbooks — Welcome Week, Coffeehouse,
// Turkey Bowl, Retreat, Appreciation Night plus the two light ones — each with
// its own tasks, roles and extra tabs. The create-event chooser offered two of
// them, so the other five were plans nobody could start: the only way in was to
// create some other event and edit its type. This spec drives the chooser as a
// leader and proves (a) all seven are offered, in order, each stating what it
// pre-fills, and (b) a preset created from the chooser actually lands with its
// seeded checklist, its seeded roles, and the extra tab its type opens —
// Retreat → Transport, Welcome Week → Sub-events.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

// Hand-seeded lane-1 team (the same workspace the countdown/readiness specs use).
const TEAM_ID = "63a47f06-fdc2-49e1-9703-9ee5dca1ccae"
const RETREAT_TITLE = `${E2E_PREFIX}Preset retreat`
const WEEK_TITLE = `${E2E_PREFIX}Preset welcome week`

// Straight from event-presets-data.mjs — the spec asserts the CHOOSER states the
// same numbers the seed writes, so a preset that quietly loses tasks is caught in
// both places at once.
const EXPECTED = {
  retreat: { tasks: 14, roles: 6, card: "Retreat", extraTab: "Transport", ghost: "Women's Retreat" },
  welcome_week: { tasks: 31, roles: 6, card: "Welcome Week", extraTab: "Sub-events", ghost: "Welcome Week" },
}

test.describe("Create-event chooser offers every preset", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  let hasLaneFixture = false

  test.beforeEach(() => {
    test.skip(!hasLaneFixture, "lane-1 fixture only (hand-seeded team) — see sandbox().hasRow")
  })

  test.beforeAll(async () => {
    hasLaneFixture = await sandbox().hasRow("teams", { id: TEAM_ID, ministry_id: sandbox().ministryId })
  })

  // Every event this spec creates is prefixed, so cleanup is surgical.
  test.afterAll(async () => {
    if (!hasLaneFixture) return
    const sb = sandbox()
    const { data: evs } = await sb.client
      .from("calendar_events").select("id")
      .eq("ministry_id", sb.ministryId).like("title", `${E2E_PREFIX}Preset %`)
    for (const ev of ((evs ?? []) as { id: string }[])) {
      const { data: plans } = await sb.client.from("event_plans").select("id").eq("calendar_event_id", ev.id)
      for (const p of ((plans ?? []) as { id: string }[])) {
        await sb.client.from("event_confirmations").delete().eq("event_plan_id", p.id)
        await sb.client.from("event_tasks").delete().eq("event_plan_id", p.id)
        await sb.client.from("event_roles").delete().eq("event_plan_id", p.id)
        await sb.client.from("event_plans").delete().eq("id", p.id)
      }
      await sb.client.from("calendar_events").delete().eq("id", ev.id)
    }
  })

  async function openChooser(page: Page) {
    await page.goto(`/home?tab=plan&team=${TEAM_ID}`)
    const newEvent = page.getByRole("button", { name: "New Event", exact: true }).filter({ visible: true }).first()
    await expect(newEvent).toBeVisible({ timeout: 20_000 })
    await newEvent.click()
    await expect(page.getByText("Start something new").filter({ visible: true }).first()).toBeVisible()
  }

  /** Pick a preset card, name the event, and create it. Returns once the new
   *  event's workspace has opened (the modal hands the row straight to it). */
  async function createFromChooser(page: Page, card: string, ghost: string, title: string) {
    await page.getByRole("button", { name: new RegExp(`^${card}\\b`) }).filter({ visible: true }).first().click()
    const titleInput = page.getByPlaceholder(ghost).filter({ visible: true }).first()
    await expect(titleInput).toBeVisible()
    await titleInput.fill(title)
    await page.getByRole("button", { name: "Create event", exact: true }).click()
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible({ timeout: 20_000 })
  }

  /** What the seed actually wrote for the newly created event. */
  async function seededCounts(title: string) {
    const sb = sandbox()
    const { data: ev } = await sb.client
      .from("calendar_events").select("id, event_type")
      .eq("ministry_id", sb.ministryId).eq("title", title).single()
    const eventId = (ev as { id: string; event_type: string }).id
    const { data: plan } = await sb.client.from("event_plans").select("id").eq("calendar_event_id", eventId).single()
    const planId = (plan as { id: string }).id
    const { count: tasks } = await sb.client
      .from("event_tasks").select("id", { count: "exact", head: true }).eq("event_plan_id", planId)
    const { count: roles } = await sb.client
      .from("event_roles").select("id", { count: "exact", head: true }).eq("event_plan_id", planId)
    return { eventType: (ev as { event_type: string }).event_type, tasks: tasks ?? 0, roles: roles ?? 0 }
  }

  test("all seven presets are offered, in order, each stating what it pre-fills", async ({ page }) => {
    await openChooser(page)

    const cards = [
      "Quick social", "Quick gathering",
      "Welcome Week", "Coffeehouse", "Turkey Bowl", "Retreat", "Appreciation Night",
      "Start from scratch",
    ]
    for (const c of cards) {
      await expect(page.getByRole("button", { name: new RegExp(`^${c}\\b`) }).filter({ visible: true }).first()).toBeVisible()
    }

    // Order, structurally: the chooser's own buttons in DOM order, scoped to the
    // modal panel itself (`.animate-dialog-in`, CentralModal's own dialog div).
    // Matching on whole-page text/buttons would catch stuff BEHIND the modal —
    // the agenda lists a "Fall Coffeehouse" of its own, and this team's Events
    // sidebar has a real, already-created "Turkey Bowl" event whose nav button
    // text is the bare name with no sub-line, which the old page-wide locator
    // picked up as a false extra "card" ahead of the real chooser cards.
    const modalPanel = page.locator(".animate-dialog-in")
    const buttonTexts = await modalPanel.locator("button:visible").allInnerTexts()
    const cardTexts = buttonTexts.filter((t) => cards.includes(t.split("\n")[0].trim()))
    expect(cardTexts.map((t) => t.split("\n")[0].trim())).toEqual(cards)

    // Each card promises exactly what the seed writes — tasks and roles, and
    // nothing about a budget (that preset field is never read).
    const subOf = (card: string) => cardTexts.find((t) => t.startsWith(card))?.split("\n")[1]?.trim()
    expect(subOf("Welcome Week")).toBe(`${EXPECTED.welcome_week.tasks} tasks · ${EXPECTED.welcome_week.roles} roles pre-filled`)
    expect(subOf("Retreat")).toBe(`${EXPECTED.retreat.tasks} tasks · ${EXPECTED.retreat.roles} roles pre-filled`)
    expect(cardTexts.join(" ")).not.toMatch(/budget/i)
    // No emoji on a choice card (the event-type emoji stay on the badge).
    expect(cardTexts.join(" ")).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  test("a Retreat created from the chooser lands seeded, with its Transport tab", async ({ page }) => {
    await openChooser(page)
    await createFromChooser(page, EXPECTED.retreat.card, EXPECTED.retreat.ghost, RETREAT_TITLE)

    // The type's extra tab is wired from the STORED event_type, so its presence
    // is the proof the preset came through the chooser intact.
    await expect(page.getByRole("button", { name: EXPECTED.retreat.extraTab, exact: true })).toBeVisible()

    const seeded = await seededCounts(RETREAT_TITLE)
    expect(seeded.eventType).toBe("retreat")
    expect(seeded.tasks).toBe(EXPECTED.retreat.tasks)
    expect(seeded.roles).toBe(EXPECTED.retreat.roles)

    // And the checklist the leader sees carries them.
    await page.getByRole("button", { name: "Countdown", exact: true }).click()
    await expect(page.getByText(String(EXPECTED.retreat.tasks), { exact: true }).filter({ visible: true }).first()).toBeVisible()
  })

  test("a Welcome Week created from the chooser lands with its Sub-events tab", async ({ page }) => {
    await openChooser(page)
    await createFromChooser(page, EXPECTED.welcome_week.card, EXPECTED.welcome_week.ghost, WEEK_TITLE)

    await expect(page.getByRole("button", { name: EXPECTED.welcome_week.extraTab, exact: true })).toBeVisible()

    const seeded = await seededCounts(WEEK_TITLE)
    expect(seeded.eventType).toBe("welcome_week")
    expect(seeded.tasks).toBe(EXPECTED.welcome_week.tasks)
    expect(seeded.roles).toBe(EXPECTED.welcome_week.roles)
  })
})
