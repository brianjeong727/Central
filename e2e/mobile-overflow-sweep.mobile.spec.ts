// NOTHING AT PHONE WIDTH EXTENDS PAST THE SCREEN.
//
// The sibling sweep (mobile-screen-sweep.mobile.spec.ts) pins the VERTICAL
// rhythm — where a chrome title sits, where the body starts. This one pins the
// HORIZONTAL contract, which had no enforcement at all:
//
//   1. the page must not scroll sideways (`scrollWidth > clientWidth` on the
//      document or on `.shell-scroll` means the layout is wider than the phone)
//   2. no element that HIDES its horizontal overflow may contain a child BOX
//      sticking out past its content edge — that content is simply cut off
//
// Rule 2 exists because rule 1 alone misses the worse bug: an element clipped by
// an `overflow-hidden` ancestor doesn't make anything scroll, it silently cuts
// content off. Nothing moves, nothing fails, and the user just cannot read the
// end of the row.
//
// The child-BOX requirement is what stops rule 2 flagging the whole app: every
// `truncate` / `line-clamp` label also reports scrollWidth > clientWidth, but its
// overflow is TEXT, and ellipsised text is the design working, not breaking.
// A deliberate horizontal rail (chip row, carousel) is exempt for free — it
// scrolls its overflow rather than hiding it, so rule 2 never looks at it.
//
// Discovery, budget, destructive-row guards and the collect-then-assert shape are
// deliberately IDENTICAL to the vertical sweep — same walker, different probe —
// so a screen that is covered there is covered here the day it ships.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

const MOBILE = { viewport: { width: 390, height: 844 } } as const

// 1px of slack absorbs sub-pixel layout rounding (a 389.6px-wide child of a 390px
// parent reads as 390.0000001 often enough to matter). Anything genuinely broken
// overshoots by far more than this — the real violations run 8–120px.
const SLACK = 1

type Overflow = {
  pageScrollX: number      // how many px the document scrolls sideways (0 = fine)
  shellScrollX: number     // same for .shell-scroll, the app's own scroll region
  offenders: string[]      // description of each clipped/escaping element
}

async function probeOverflow(page: Page): Promise<Overflow> {
  return page.evaluate((SLACK) => {
    const vis = (el: Element) => {
      const s = getComputedStyle(el)
      if (s.display === "none" || s.visibility === "hidden") return false
      if (parseFloat(s.opacity) === 0) return false
      return true
    }

    // Where in the tree, in terms a person can grep for. Prefers data-* markers
    // and real class names over nth-child noise.
    const pathOf = (el: Element) => {
      const parts: string[] = []
      let n: Element | null = el
      for (let i = 0; n && n !== document.body && i < 5; i++) {
        const cls = (typeof n.className === "string" ? n.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")
        const data = Array.from(n.attributes).find((a) => a.name.startsWith("data-") && a.name !== "data-testid")
        parts.unshift(`${n.tagName.toLowerCase()}${data ? `[${data.name}]` : ""}${cls ? "." + cls : ""}`)
        n = n.parentElement
      }
      return parts.join(" > ")
    }

    const describe = (el: Element) => {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 44)
      return `${pathOf(el)}${text ? ` "${text}"` : ""}`
    }

    const offenders: string[] = []

    // ── CLIPPED CONTENT ──────────────────────────────────────────────────────
    // An element that hides its own horizontal overflow AND actually has a CHILD
    // BOX sticking out past its content edge. The child-box test is what keeps
    // this from flagging every truncated label in the app: `truncate` /
    // `line-clamp` also produce scrollWidth > clientWidth, but their overflow is
    // TEXT, not a box, and ellipsised text is the design working, not breaking.
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const s = getComputedStyle(el)
      if (s.overflowX !== "hidden" && s.overflowX !== "clip") continue
      if (el.clientWidth === 0 || !vis(el)) continue
      if (el.scrollWidth - el.clientWidth <= SLACK) continue
      const r = el.getBoundingClientRect()
      const contentRight = r.left + el.clientWidth
      let worst: { el: Element; over: number } | null = null
      for (const kid of Array.from(el.children)) {
        const kr = kid.getBoundingClientRect()
        if (kr.width === 0 || kr.height === 0 || !vis(kid)) continue
        // Only FLOW children count. An absolutely-positioned child cropped by a
        // deliberately-clipping parent is a technique, not a bug — the landing
        // page's decorative ring is placed at `right: -40` precisely so the card
        // crops it. A child in normal flow overflowing its clipping parent is
        // the actual defect: content the user can never reach.
        const ks = getComputedStyle(kid)
        if (ks.position === "absolute" || ks.position === "fixed") continue
        const over = Math.round(kr.right - contentRight)
        if (over <= SLACK) continue
        if (!worst || over > worst.over) worst = { el: kid, over }
      }
      if (worst) offenders.push(`clips ${worst.over}px off ${describe(worst.el)}  [inside ${pathOf(el)}]`)
      if (offenders.length >= 8) break
    }

    const doc = document.scrollingElement ?? document.documentElement
    const shell = document.querySelector(".shell-scroll")
    return {
      pageScrollX: Math.max(0, Math.round(doc.scrollWidth - doc.clientWidth)),
      shellScrollX: shell ? Math.max(0, Math.round(shell.scrollWidth - shell.clientWidth)) : 0,
      offenders,
    }
  }, SLACK)
}

const violations: string[] = []
const visited: string[] = []

/** Two identical consecutive reads — the layout must have stopped moving. */
async function settled(page: Page): Promise<Overflow> {
  let prev: Overflow | null = null
  for (let i = 0; i < 12; i++) {
    const o = await probeOverflow(page)
    if (prev && o.pageScrollX === prev.pageScrollX && o.shellScrollX === prev.shellScrollX
        && o.offenders.join("|") === prev.offenders.join("|")) return o
    prev = o
    await page.waitForTimeout(300)
  }
  return prev!
}

async function check(page: Page, label: string) {
  const o = await settled(page)
  const worst = Math.max(o.pageScrollX, o.shellScrollX)
  visited.push(`${label.padEnd(38)} scrollX=${String(worst).padStart(4)}  offenders=${o.offenders.length}`)
  if (o.pageScrollX > SLACK) {
    violations.push(`${label}: the PAGE scrolls sideways by ${o.pageScrollX}px`)
  }
  if (o.shellScrollX > SLACK) {
    violations.push(`${label}: .shell-scroll scrolls sideways by ${o.shellScrollX}px`)
  }
  for (const off of o.offenders) {
    violations.push(`${label}: ${off}`)
  }
}

/** Titles of the drill-in rows currently on screen, in order. */
async function rowTitles(page: Page): Promise<string[]> {
  return page.locator("[data-pocket-row]").filter({ visible: true })
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-pocket-row") ?? "").filter(Boolean))
}

async function waitForRows(page: Page): Promise<string[]> {
  for (let i = 0; i < 5; i++) {
    const t = await rowTitles(page)
    if (t.length) return t
    await page.waitForTimeout(400)
  }
  return []
}

const MAX_ROWS_PER_SCREEN = 12
const DESTRUCTIVE = /\b(leave|delete|remove|clear|archive|reset|revoke|sign out|log out|unlink|disband)\b/i
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
  const back = page.locator(".back-chevron").filter({ visible: true }).last()
  if (await back.count()) { await back.click().catch(() => {}); await page.waitForTimeout(900) }
}

async function walkRows(page: Page, label: string, depth = 1) {
  if (outOfBudget()) return
  const all = await waitForRows(page)
  const titles = all.slice(0, MAX_ROWS_PER_SCREEN)
  if (all.length > titles.length) visited.push(`${label} — walked ${titles.length} of ${all.length} rows (capped)`)
  const home = all.join("|")
  for (const t of titles) {
    if (outOfBudget()) { visited.push(`${label} — walk stopped early (time budget)`); return }
    if (DESTRUCTIVE.test(t)) { visited.push(`${label} → ${t}  SKIPPED (destructive label)`); continue }
    if (!(await tapRow(page, t))) continue
    if ((await rowTitles(page)).join("|") === home) continue
    await check(page, `${label} → ${t}`)
    if (depth > 0) await walkRows(page, `${label} → ${t}`, depth - 1)
    await goBack(page)
    if ((await rowTitles(page)).join("|") !== home) {
      visited.push(`${label} — back overshot after "${t}"; stopped walking this screen`)
      return
    }
  }
}

test.describe("mobile overflow sweep — nothing runs off the screen", () => {
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

    const adminForChat = await sb.adminUserId()
    const { data: myGroups } = await sb.client
      .from("group_members").select("group_id").eq("user_id", adminForChat).limit(20)
    const ids = (myGroups ?? []).map((g: { group_id: string }) => g.group_id)
    if (ids.length) {
      const { data: grps } = await sb.client
        .from("groups").select("id, type").eq("ministry_id", sb.ministryId).in("id", ids)
      const list = (grps ?? []) as { id: string; type: string }[]
      chatId = (list.find((g) => g.type === "church") ?? list[0])?.id ?? ""
    }

    const ann = await sb.createAnnouncement({
      title: "Overflow sweep detail",
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
      .insert({ ministry_id: sb.ministryId, name: `${E2E_PREFIX}Overflow Finance`, description: "e2e", team_type: "finance", created_by: adminId })
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

  test("no phone-width screen extends past the viewport", async ({ page }) => {
    test.setTimeout(900_000)
    walkDeadline = Date.now() + WALK_BUDGET_MS

    for (const [tab, label] of [
      ["home", "Home"], ["announcements", "Announcements"], ["chats", "Chats"],
      ["directory", "Directory"], ["profile", "Profile"], ["settings", "Church settings"],
      ["give", "Give"], ["forms", "Forms"], ["network", "Network"], ["plan", "Workspace picker"],
    ] as const) {
      await page.goto(`/home?tab=${tab}`)
      await check(page, label)
    }

    for (const [tab, label] of [
      ["settings", "Settings"], ["profile", "Profile"], ["chats", "Chats"],
      ["congregation", "Congregation"], ["forms", "Forms"],
    ] as const) {
      await page.goto(`/home?tab=${tab}`)
      await page.waitForTimeout(1200)
      await walkRows(page, label, 0)
    }

    if (memberId) {
      await page.goto(`/home?tab=directory&member=${memberId}`)
      await check(page, "Directory → member")
    } else visited.push("Directory → member          SKIPPED (no member seeded)")
    if (announcementId) {
      await page.goto(`/home?tab=announcements&ann=${announcementId}`)
      await check(page, "Announcement → detail")
    } else visited.push("Announcement → detail       SKIPPED (no announcement seeded)")

    if (chatId) {
      await page.goto(`/home?tab=chats&chat=${chatId}`)
      await check(page, "Chat screen")
      const nameBlock = page.locator("h2").filter({ visible: true }).first()
      if (await nameBlock.count()) {
        await nameBlock.click().catch(() => {})
        await page.waitForTimeout(1400)
        await check(page, "Chat → Settings")
        for (const row of ["Members", "Media & files", "Section"]) {
          if (await tapRow(page, row)) {
            await check(page, `Chat → Settings → ${row}`)
            await goBack(page)
          } else visited.push(`Chat → Settings → ${row}  SKIPPED (row not present)`)
        }
      } else visited.push("Chat → Settings             SKIPPED (name block not found)")
    } else visited.push("Chat screen                 SKIPPED (no chat seeded)")

    if (teamId) {
      await page.goto(`/home?tab=plan&team=${teamId}`)
      await check(page, "Team hub")
      await walkRows(page, "Team", 1)

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

    if (financeTeamId) {
      await page.goto(`/home?tab=plan&team=${financeTeamId}`)
      await check(page, "Finance hub")
      await walkRows(page, "Finance", 1)
    }

    console.log("\n===== MOBILE OVERFLOW SWEEP =====")
    for (const v of visited) console.log("  " + v)
    console.log(`\n  ${visited.length} screens checked, ${violations.length} violations`)

    expect(
      violations,
      `\n\nMOBILE HORIZONTAL OVERFLOW (${violations.length}):\n\n` + violations.map(v => "  • " + v).join("\n") + "\n",
    ).toEqual([])
  })
})

// ── Public routes + the narrow end of the supported range ────────────────────
// The walk above is logged-in app shell only. Marketing, auth and onboarding are
// phone-width surfaces too, and 375 (iPhone SE / mini / 13 mini) is inside the
// supported band — a layout that only just fits at 390 breaks there first.
test.describe("mobile overflow — public routes and 375px", () => {
  const pubViolations: string[] = []
  const pubVisited: string[] = []

  async function checkInto(page: Page, label: string) {
    const o = await settled(page)
    const worst = Math.max(o.pageScrollX, o.shellScrollX)
    pubVisited.push(`${label.padEnd(38)} scrollX=${String(worst).padStart(4)}  offenders=${o.offenders.length}`)
    if (o.pageScrollX > SLACK) pubViolations.push(`${label}: the PAGE scrolls sideways by ${o.pageScrollX}px`)
    if (o.shellScrollX > SLACK) pubViolations.push(`${label}: .shell-scroll scrolls sideways by ${o.shellScrollX}px`)
    for (const off of o.offenders) pubViolations.push(`${label}: ${off}`)
  }

  const PUBLIC = [
    ["/", "Landing"],
    ["/ministries", "Ministry discovery"],
    ["/login", "Login"],
    ["/signup", "Signup"],
    ["/forgot-password", "Forgot password"],
    ["/register-ministry", "Register ministry"],
  ] as const

  for (const width of [390, 375] as const) {
    test(`public routes at ${width}px`, async ({ browser }) => {
      test.setTimeout(240_000)
      const ctx = await browser.newContext({ viewport: { width, height: 844 } })
      const page = await ctx.newPage()
      for (const [path, label] of PUBLIC) {
        await page.goto(path)
        await page.waitForTimeout(1500)
        await checkInto(page, `${label} @${width}`)
      }
      await ctx.close()
    })
  }

  test(`app tab roots at 375px`, async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ viewport: { width: 375, height: 844 }, storageState: adminState })
    const page = await ctx.newPage()
    for (const [tab, label] of [
      ["home", "Home"], ["announcements", "Announcements"], ["chats", "Chats"],
      ["directory", "Directory"], ["profile", "Profile"], ["settings", "Church settings"],
      ["give", "Give"], ["forms", "Forms"], ["network", "Network"], ["plan", "Workspace picker"],
    ] as const) {
      await page.goto(`/home?tab=${tab}`)
      await checkInto(page, `${label} @375`)
    }
    await ctx.close()
  })

  test.afterAll(() => {
    console.log("\n===== PUBLIC / NARROW SWEEP =====")
    for (const v of pubVisited) console.log("  " + v)
    console.log(`\n  ${pubVisited.length} screens checked, ${pubViolations.length} violations`)
    if (pubViolations.length) {
      throw new Error(`\n\nMOBILE HORIZONTAL OVERFLOW — public/narrow (${pubViolations.length}):\n\n` + pubViolations.map(v => "  • " + v).join("\n") + "\n")
    }
  })
})
