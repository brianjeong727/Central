// EVERY phone-width screen obeys the same two margin rules.
//
//   1. the chrome title starts 12px down (POCKET_CHROME_PAD_Y, Convention #27)
//   2. the body starts directly under that chrome row — no stray control row,
//      no unowned top margin (Convention #26/§3)
//
// mobile-chrome-rhythm.mobile.spec.ts guards the CONTRACT on a handful of
// representative screens. This file is the SWEEP: it walks everything reachable
// and reports every violation in ONE run, so a regression anywhere surfaces
// together instead of one-per-run.
//
// It collects and reports at the end rather than failing on the first bad screen —
// stopping at the first tells you nothing about the other twenty.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

const MOBILE = { viewport: { width: 390, height: 844 } } as const

const MIN_TITLE = 12
const MAX_TITLE = 19
const MAX_CONTENT = 92

type Probe = { title: number | null; titleText: string; content: number | null; contentText: string }

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    let title: { top: number; text: string } | null = null
    for (const el of Array.from(document.querySelectorAll("span, div, h1, h2, p"))) {
      const r = el.getBoundingClientRect()
      if (r.top < 0 || r.top > 260 || r.height < 12 || r.width < 40) continue
      const s = getComputedStyle(el)
      if (s.display === "none" || s.visibility === "hidden") continue
      if (parseFloat(s.fontSize) < 19) continue
      const text = (el.textContent ?? "").trim()
      if (!text || el.children.length > 1) continue
      title = { top: Math.round(r.top), text: text.slice(0, 28) }
      break
    }
    let content: { top: number; text: string } | null = null
    if (title) {
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const r = el.getBoundingClientRect()
        if (r.top <= title.top + 24 || r.top > 400) continue
        if (r.width < 80 || r.height < 12) continue
        const s = getComputedStyle(el)
        if (s.display === "none" || s.visibility === "hidden") continue
        if (el.closest("[data-empty-state]")) continue
        const painted = s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.borderTopWidth !== "0px"
        const text = (el.textContent ?? "").trim()
        const isLeafText = text.length > 0 && el.children.length === 0
        if (!painted && !isLeafText) continue
        if (!content || r.top < content.top) content = { top: Math.round(r.top), text: text.slice(0, 24) }
      }
    }
    return {
      title: title?.top ?? null, titleText: title?.text ?? "",
      content: content?.top ?? null, contentText: content?.text ?? "",
    }
  })
}

const violations: string[] = []
const visited: string[] = []

/**
 * Read the screen once it has STOPPED MOVING — two identical consecutive reads.
 *
 * Polling until non-null is not enough. A row's height is still settling during
 * hydration (Home's 36px avatar chip sizes late, so its title reads 24 → 19), and
 * a first-non-null read catches whatever frame it lands on. That reported Home at
 * 22px — a failure with no defect behind it, which is exactly the wandering-failure
 * class this suite has been bitten by before. Measure the steady state.
 */
async function settled(page: Page): Promise<Probe> {
  let prev: Probe | null = null
  for (let i = 0; i < 25; i++) {
    const p = await probe(page)
    if (prev && p.title !== null && p.title === prev.title && p.content === prev.content) return p
    prev = p
    await page.waitForTimeout(300)
  }
  return prev!
}

async function check(page: Page, label: string) {
  const p = await settled(page)
  visited.push(`${label.padEnd(34)} title=${String(p.title).padStart(3)}  content=${String(p.content ?? "-").padStart(4)}`)
  if (p.title === null) { violations.push(`${label}: no chrome title found`); return }
  if (p.title < MIN_TITLE || p.title > MAX_TITLE) {
    violations.push(`${label}: title "${p.titleText}" at ${p.title}px (must be ${MIN_TITLE}–${MAX_TITLE}) — route its chrome through PocketChrome / PocketHubChrome / SubpageShell`)
  }
  if (p.content !== null && p.content > MAX_CONTENT) {
    violations.push(`${label}: body starts ${p.content}px down at "${p.contentText}" (max ${MAX_CONTENT}) — move any control into the chrome via <MobileChromeActions>, or drop the wrapper's top margin`)
  }
}

/** Titles of the drill-in rows currently on screen, in order. */
async function rowTitles(page: Page): Promise<string[]> {
  return page.locator("[data-pocket-row]").filter({ visible: true })
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-pocket-row") ?? "").filter(Boolean))
}

async function tapRow(page: Page, title: string): Promise<boolean> {
  const el = page.locator(`[data-pocket-row="${title.replace(/"/g, '\\"')}"]`).filter({ visible: true }).first()
  if (!(await el.count())) return false
  await el.click().catch(() => {})
  await page.waitForTimeout(900)
  return true
}

async function goBack(page: Page) {
  // Every stacked mobile header routes through BackChevron (.back-chevron,
  // Convention #22), so this is the one "up a level" for the whole app.
  const back = page.locator(".back-chevron").filter({ visible: true }).last()
  if (await back.count()) { await back.click().catch(() => {}); await page.waitForTimeout(900) }
}

/**
 * Walk every drill-in row reachable from the current screen, checking each, then
 * backing out. Depth-limited: 2 is enough to reach hub → section → sub-section,
 * which is as deep as the mobile hub-and-spoke model goes.
 */
async function walkRows(page: Page, label: string, depth = 1) {
  const titles = await rowTitles(page)
  for (const t of titles) {
    if (!(await tapRow(page, t))) continue
    // A row that opened nothing (an inline toggle, an external link) leaves the
    // rows unchanged — don't record it as a screen, and don't try to back out.
    const nowRows = await rowTitles(page)
    const moved = nowRows.join("|") !== titles.join("|")
    if (!moved) continue
    await check(page, `${label} → ${t}`)
    if (depth > 0) await walkRows(page, `${label} → ${t}`, depth - 1)
    await goBack(page)
  }
}

test.describe("mobile screen sweep — one margin rule, every screen", () => {
  test.use({ storageState: adminState, ...MOBILE })

  let teamId = ""
  let eventTitle = ""
  let financeTeamId = ""
  let memberId = ""
  let announcementId = ""

  test.beforeAll(async () => {
    const sb = sandbox()

    const { data: mem } = await sb.client
      .from("profiles").select("id").eq("ministry_id", sb.ministryId).limit(1).maybeSingle()
    if (mem) memberId = (mem as { id: string }).id

    const { data: ann } = await sb.client
      .from("announcements").select("id").eq("ministry_id", sb.ministryId)
      .eq("status", "published").order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (ann) announcementId = (ann as { id: string }).id

    const { data: ev } = await sb.client
      .from("calendar_events").select("title, team_id")
      .eq("ministry_id", sb.ministryId).not("team_id", "is", null).is("parent_event_id", null)
      .order("start_date", { ascending: false }).limit(1).maybeSingle()
    if (ev) { teamId = (ev as { team_id: string }).team_id; eventTitle = (ev as { title: string }).title }

    const adminId = await sb.adminUserId()
    const { data: team } = await sb.client.from("teams")
      .insert({ ministry_id: sb.ministryId, name: `${E2E_PREFIX}Sweep Finance`, description: "e2e", team_type: "finance", created_by: adminId })
      .select("id").single()
    if (team) {
      financeTeamId = (team as { id: string }).id
      const { data: role } = await sb.client.from("team_roles")
        .insert({ team_id: financeTeamId, name: "Treasurer", permissions: ["can_view_finances"], is_president: true })
        .select("id").single()
      if (role) {
        await sb.client.from("team_members")
          .insert({ team_id: financeTeamId, user_id: adminId, role_id: (role as { id: string }).id, added_by: adminId })
      }
    }
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (financeTeamId) {
      await sb.client.from("team_members").delete().eq("team_id", financeTeamId)
      await sb.client.from("team_roles").delete().eq("team_id", financeTeamId)
      await sb.client.from("teams").delete().eq("id", financeTeamId)
    }
  })

  test("every reachable mobile screen obeys the margin rules", async ({ page }) => {
    test.setTimeout(600_000)

    // ── Tab roots ──
    for (const [tab, label] of [
      ["home", "Home"], ["announcements", "Announcements"], ["chats", "Chats"],
      ["directory", "Directory"], ["profile", "Profile"], ["settings", "Church settings"],
      ["give", "Give"], ["forms", "Forms"], ["network", "Network"], ["plan", "Workspace picker"],
    ] as const) {
      await page.goto(`/home?tab=${tab}`)
      await check(page, label)
    }

    // ── Every hub-and-spoke drill, discovered rather than listed ──
    // Church settings (8 sections), Profile, Chats, Congregation and the workspace
    // hubs all drill through PocketRow, so the walk finds their screens itself.
    for (const [tab, label] of [
      ["settings", "Settings"], ["profile", "Profile"], ["chats", "Chats"],
      ["congregation", "Congregation"], ["forms", "Forms"],
    ] as const) {
      await page.goto(`/home?tab=${tab}`)
      await page.waitForTimeout(1200)
      await walkRows(page, label, 0)
    }

    // ── Detail screens reachable by deep link (more reliable than tapping a card) ──
    if (memberId) {
      await page.goto(`/home?tab=directory&member=${memberId}`)
      await check(page, "Directory → member")
    }
    if (announcementId) {
      await page.goto(`/home?tab=announcements&ann=${announcementId}`)
      await check(page, "Announcement → detail")
    }

    // ── Plan: team hub → its sections → the event workspace → its spokes ──
    if (teamId) {
      await page.goto(`/home?tab=plan&team=${teamId}`)
      await check(page, "Team hub")
      await walkRows(page, "Team", 1)

      // The event workspace is behind an event CARD, not a PocketRow, so it needs
      // one explicit hop — after which its spokes are rows again.
      await page.goto(`/home?tab=plan&team=${teamId}`)
      await page.waitForTimeout(1400)
      await tapRow(page, "Events")
      const card = page.getByText(eventTitle, { exact: true }).filter({ visible: true }).first()
      if (await card.count()) {
        await card.click().catch(() => {})
        await page.waitForTimeout(1600)
        await check(page, "Event hub")
        await walkRows(page, "Event", 0)
      }
    }

    // ── Finance workspace ──
    if (financeTeamId) {
      await page.goto(`/home?tab=plan&team=${financeTeamId}`)
      await check(page, "Finance hub")
      await walkRows(page, "Finance", 1)
    }

    console.log("\n===== MOBILE SCREEN SWEEP =====")
    for (const v of visited) console.log("  " + v)
    console.log(`\n  ${visited.length} screens checked, ${violations.length} violations`)

    expect(
      violations,
      `\n\nMOBILE MARGIN VIOLATIONS (${violations.length}):\n\n` + violations.map(v => "  • " + v).join("\n") + "\n",
    ).toEqual([])
  })
})
