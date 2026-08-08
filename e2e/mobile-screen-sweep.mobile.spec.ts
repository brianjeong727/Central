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
    const vis = (el: Element) => {
      const s = getComputedStyle(el)
      return s.display !== "none" && s.visibility !== "hidden"
    }
    // The thing being measured is the CHROME ROW, not "the biggest text near the
    // top". A screen that headlines itself in the body (an announcement article, a
    // member's identity card) correctly carries the "← Parent" grammar instead of a
    // serif title — font-size sniffing missed that row entirely and latched onto the
    // avatar's initials further down, inventing a 90px "title" on a fine screen.
    // Anchor on the back chevron, which every stacked header routes through.
    // Take the HIGHEST back chevron, not the first in DOM order. A full-screen
    // overlay (ChatScreen) sits above a tab tree that is still mounted and still
    // has its own chevron — first-in-DOM picked the buried one and measured the
    // wrong row, reading a 48px "title" on a screen whose header is at 17.
    let row: Element | null = null
    let rowTop = Infinity
    for (const bc of Array.from(document.querySelectorAll(".back-chevron"))) {
      const r = bc.getBoundingClientRect()
      if (r.top < 0 || r.top > 100 || !vis(bc) || r.width === 0) continue
      if (r.top < rowTop) { rowTop = r.top; row = bc.parentElement }
    }
    let title: { top: number; text: string } | null = null
    if (row) {
      // The row's leading text — a serif title, or the back-label when that's the grammar.
      for (const el of Array.from(row.querySelectorAll("span, div, h1, h2, p, button"))) {
        const r = el.getBoundingClientRect()
        if (r.height < 12 || r.width < 20 || !vis(el)) continue
        const text = (el.textContent ?? "").trim()
        if (!text || el.children.length > 1) continue
        title = { top: Math.round(r.top), text: text.slice(0, 28) }
        break
      }
    }
    if (!title) {
      for (const el of Array.from(document.querySelectorAll("span, div, h1, h2, p"))) {
        const r = el.getBoundingClientRect()
        if (r.top < 0 || r.top > 260 || r.height < 12 || r.width < 40) continue
        if (!vis(el)) continue
        if (parseFloat(getComputedStyle(el).fontSize) < 19) continue
        const text = (el.textContent ?? "").trim()
        if (!text || el.children.length > 1) continue
        title = { top: Math.round(r.top), text: text.slice(0, 28) }
        row = el.parentElement
        break
      }
    }
    // Content starts below the chrome ROW, not below the title — on a back-label
    // row the title is short and the row is taller than it.
    const rowBottom = row ? row.getBoundingClientRect().bottom : (title ? title.top + 34 : 0)
    // Scope to the LAYER the chrome row belongs to. A full-screen overlay covers a
    // tab tree that is still mounted and still measurable — the chats list's search
    // field sits at 114 behind ChatScreen and was reported as ChatScreen's content.
    // Climb to the nearest `position: fixed` ancestor (the overlay itself); screens
    // with no overlay have none and correctly fall back to the whole document.
    let scope: Element = document.body
    for (let a: Element | null = row; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).position === "fixed") { scope = a; break }
    }
    let content: { top: number; text: string } | null = null
    if (title) {
      for (const el of Array.from(scope.querySelectorAll("*"))) {
        // <style>/<script> have textContent (CSS source!) and a zero box, but they
        // slipped through as "leaf text" and got reported as a screen's content —
        // ".pocket-search-input::pl" is not a design defect.
        if (el.tagName === "STYLE" || el.tagName === "SCRIPT" || el.tagName === "LINK") continue
        const r = el.getBoundingClientRect()
        if (r.top < rowBottom - 2 || r.top > 400) continue
        // 40, not 80: a date kicker ("FRI, AUG 7") IS the first content and is
        // narrow. The 80 floor skipped it and reported the headline below instead,
        // inventing a 124px start on a screen that really begins at ~89.
        if (r.width < 40 || r.height < 12) continue
        const s = getComputedStyle(el)
        if (s.display === "none" || s.visibility === "hidden") continue
        if (el.closest("[data-empty-state]")) continue
        // A bottom-anchored region (a chat transcript) fills upward from the
        // bottom — where it "starts" from the top says nothing about margins.
        if (el.closest("[data-bottom-anchored]")) continue
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

/**
 * Rows, once they've had a chance to paint. A hub whose data is still loading has
 * no rows yet, and reading it straight away silently drops its whole subtree — the
 * Finance sections vanished from a run exactly this way, which reads as "covered"
 * because nothing failed. A genuinely row-less screen just costs the timeout.
 */
async function waitForRows(page: Page): Promise<string[]> {
  // Budget matters: this also runs on LEAF screens that legitimately have no rows,
  // once per screen. At 6s × ~40 leaves it alone blew the whole run past its cap.
  for (let i = 0; i < 5; i++) {
    const t = await rowTitles(page)
    if (t.length) return t
    await page.waitForTimeout(400)
  }
  return []
}

// A row list can be DATA rather than navigation — chat settings → Members is one
// row per person, and walking 30 of them adds nothing the first three don't. Cap,
// and always log what was dropped: a silent truncation reads as full coverage.
// 12, not 6: a hub legitimately has ~8 navigation rows (Church Settings has
// exactly 8), and a cap of 6 silently dropped Workspace and Audit Log — two of the
// screens that were violating in the first place. The cap is only a backstop
// against DATA lists (one row per person); those are now handled by named
// navigation instead, so it can sit well above any real hub.
const MAX_ROWS_PER_SCREEN = 12

// Never tap these, whatever screen they appear on.
const DESTRUCTIVE = /\b(leave|delete|remove|clear|archive|reset|revoke|sign out|log out|unlink|disband)\b/i

// Hard wall-clock ceiling on the DISCOVERY walks. Two runs died at the Playwright
// timeout mid-walk, which kills the process before the summary prints — so a run
// that found 40 clean screens reported nothing at all. Stopping early and printing
// what we have (with the truncation logged) beats losing the whole result.
const WALK_BUDGET_MS = 8 * 60_000
let walkDeadline = Number.POSITIVE_INFINITY
function outOfBudget() { return Date.now() > walkDeadline }

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
  if (outOfBudget()) return
  const all = await waitForRows(page)
  const titles = all.slice(0, MAX_ROWS_PER_SCREEN)
  if (all.length > titles.length) {
    visited.push(`${label} — walked ${titles.length} of ${all.length} rows (capped)`)
  }
  const home = all.join("|")
  for (const t of titles) {
    if (outOfBudget()) { visited.push(`${label} — walk stopped early (time budget)`); return }
    // The sweep runs against the REAL sandbox, and this walk taps every row it
    // finds. A row whose label reads destructive is not worth a margin reading —
    // measuring a screen must never be able to mutate Brian's data.
    if (DESTRUCTIVE.test(t)) { visited.push(`${label} → ${t}  SKIPPED (destructive label)`); continue }
    if (!(await tapRow(page, t))) continue
    // A row that opened nothing (an inline toggle, an external link) leaves the
    // rows unchanged — don't record it as a screen, and don't try to back out.
    // Compare against the FULL list, not the capped one — on a screen with more
    // rows than the cap, a no-op tap would otherwise look like navigation.
    if ((await rowTitles(page)).join("|") === home) continue
    await check(page, `${label} → ${t}`)
    if (depth > 0) await walkRows(page, `${label} → ${t}`, depth - 1)
    await goBack(page)
    // Confirm we actually landed back HERE before tapping the next row. Without
    // this the walk WANDERS: a back that overshoots (closing the chat overlay
    // outright, say) leaves us on some unrelated screen whose rows happen to share
    // a title — chat NAMES are rows too — and the loop drills onward through the
    // app indefinitely. That burned a whole 900s budget without reaching Plan.
    if ((await rowTitles(page)).join("|") !== home) {
      visited.push(`${label} — back overshot after "${t}"; stopped walking this screen`)
      return
    }
  }
}

test.describe("mobile screen sweep — one margin rule, every screen", () => {
  test.use({ storageState: adminState, ...MOBILE })

  let teamId = ""
  let eventTitle = ""
  let financeTeamId = ""
  let memberId = ""
  let announcementId = ""
  let chatId = ""

  test.beforeAll(async () => {
    const sb = sandbox()

    const { data: mem } = await sb.client
      .from("profiles").select("id").eq("ministry_id", sb.ministryId).limit(1).maybeSingle()
    if (mem) memberId = (mem as { id: string }).id

    // Older rows predate `status`, so a strict published filter finds nothing and
    // the detail screen silently goes unchecked — which looks exactly like a pass.
    // A chat the admin is actually in — ChatScreen is a full-screen overlay opened
    // from a card, not a PocketRow, so the walk can't discover it on its own.
    const adminForChat = await sb.adminUserId()
    const { data: myGroups } = await sb.client
      .from("group_members").select("group_id").eq("user_id", adminForChat).limit(20)
    const ids = (myGroups ?? []).map((g: { group_id: string }) => g.group_id)
    if (ids.length) {
      // Prefer a CHURCH chat: the settings "Section" row only exists where the
      // chat can be reassigned, so a personal chat leaves that screen unmeasured.
      const { data: grps } = await sb.client
        .from("groups").select("id, type").eq("ministry_id", sb.ministryId).in("id", ids)
      const list = (grps ?? []) as { id: string; type: string }[]
      chatId = (list.find((g) => g.type === "church") ?? list[0])?.id ?? ""
    }

    // SEED it rather than hunt for one. Querying whatever happens to be in the
    // sandbox made this screen's coverage depend on that data — the first version
    // filtered status='published', matched nothing, and silently skipped the
    // screen. A seeded row is always present and is cleaned up by prefix.
    const ann = await sb.createAnnouncement({
      title: "Sweep detail",
      body: "Seeded so the announcement detail screen is always measured.",
    })
    announcementId = (ann as { id: string } | null)?.id ?? ""

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
    await sb.deleteAnnouncementsByPrefix()
    if (financeTeamId) {
      await sb.client.from("team_members").delete().eq("team_id", financeTeamId)
      await sb.client.from("team_roles").delete().eq("team_id", financeTeamId)
      await sb.client.from("teams").delete().eq("id", financeTeamId)
    }
  })

  test("every reachable mobile screen obeys the margin rules", async ({ page }) => {
    test.setTimeout(900_000)
    walkDeadline = Date.now() + WALK_BUDGET_MS

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
    // A screen that was never reached must be VISIBLE in the report — an unchecked
    // screen and a passing screen look identical otherwise, which is how the first
    // pass "covered" Directory→member and the event spokes without ever loading them.
    if (memberId) {
      await page.goto(`/home?tab=directory&member=${memberId}`)
      await check(page, "Directory → member")
    } else visited.push("Directory → member          SKIPPED (no member seeded)")
    if (announcementId) {
      await page.goto(`/home?tab=announcements&ann=${announcementId}`)
      await check(page, "Announcement → detail")
    } else visited.push("Announcement → detail       SKIPPED (no announcement seeded)")

    // ── Chat: the overlay, then its settings and every settings sub-screen ──
    // ChatScreen is not a SubpageShell and opens from a card, so it needs the one
    // explicit hop; from chat settings onward everything is PocketRows again.
    if (chatId) {
      await page.goto(`/home?tab=chats&chat=${chatId}`)
      await check(page, "Chat screen")
      // Tapping the name block opens settings (the iMessage pattern that replaced
      // the gear at phone width) — the same affordance a user has.
      const nameBlock = page.locator("h2").filter({ visible: true }).first()
      if (await nameBlock.count()) {
        await nameBlock.click().catch(() => {})
        await page.waitForTimeout(1400)
        await check(page, "Chat → Settings")
        // NAMED rows, not the generic walk. Chat settings mixes navigation rows
        // with rows that MUTATE (the notify/section pickers stage a pref, member
        // rows expose remove controls), and the sweep runs against the real
        // sandbox — a walk that taps everything is the wrong tool on a surface
        // where a tap can change data. These four are pure navigation.
        for (const row of ["Members", "Media & files", "Section"]) {
          if (await tapRow(page, row)) {
            await check(page, `Chat → Settings → ${row}`)
            await goBack(page)
          } else visited.push(`Chat → Settings → ${row}  SKIPPED (row not present)`)
        }
      } else visited.push("Chat → Settings             SKIPPED (name block not found)")
    } else visited.push("Chat screen                 SKIPPED (no chat seeded)")

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
