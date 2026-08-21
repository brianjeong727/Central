// A message menu never leaves the transcript.
//
// The three menus a message can open — the reaction bar (short tap), the context
// menu (long press) and the full reaction picker — are absolutely positioned
// against the message. Placement used to ask ONE question: "does putting it ABOVE
// clip the top?", flipping below if so. Nothing checked the bottom, nothing checked
// width, and nothing re-checked when the software keyboard changed the box:
//
//   · the 435px picker ran 51px off the foot of a 390×844 screen from a
//     mid-transcript message, with no keyboard involved at all
//   · with the keyboard up it sat 85px behind the keys
//   · at 375 and 320 the picker's fixed 352px width was wider than the transcript
//     column, so ~48px hung off the left edge — and since the transcript clips
//     horizontally, it was silently cut rather than merely overflowing
//
// This sweeps viewport × keyboard × anchor position × menu and asserts every open
// menu is inside the transcript box on both axes. The box is the right yardstick
// on purpose: the chat surface is `.kb-lift` (Convention #28), so the container's
// own bottom already rises with the keyboard and one measurement covers both states.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

const ROOM = `${E2E_PREFIX}Menu Bounds Room`
const ANCHOR = "probe line 20"
let roomId = ""

test.use({ storageState: adminState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test.beforeAll(async () => {
  const sb = sandbox()
  const a = await sb.adminUserId()
  const m = await sb.memberUserId()
  const g = await sb.createGroup({ name: ROOM, memberIds: [a, m] })
  roomId = g.id
  // Enough lines that the transcript genuinely scrolls, so a message can be parked
  // at the top, middle or bottom of the visible box.
  for (let i = 1; i <= 30; i++) {
    await sb.insertMessage({ groupId: roomId, senderId: i % 2 ? m : a, content: `probe line ${i}` })
  }
})

test.afterAll(async () => {
  const sb = sandbox()
  if (roomId) await sb.client.from("groups").delete().eq("id", roomId)
})

// Playwright cannot raise a real keyboard and does not need to: the contract
// boundary is `--kb-inset` + [data-kb-open] (same approach as
// chat-keyboard-inset.mobile.spec.ts). Driving them directly also keeps the
// keyboard UP through the menu opening, which is the strictly harder case — the
// app itself dismisses it on open, and the clamp must hold even when it cannot.
async function setKeyboard(page: Page, px: number) {
  await page.evaluate(h => {
    document.documentElement.style.setProperty("--kb-inset", `${h}px`)
    if (h > 0) document.documentElement.setAttribute("data-kb-open", "")
    else document.documentElement.removeAttribute("data-kb-open")
  }, px)
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(null))))
}

const bubble = (page: Page) => page.locator("[data-message-bubble]").filter({ hasText: ANCHOR }).first()

async function openBar(page: Page) {
  const b = bubble(page)
  await b.dispatchEvent("pointerdown")
  await page.waitForTimeout(80)          // under the 400ms long-press threshold
  await b.dispatchEvent("pointerup")
  await page.waitForTimeout(450)
}
async function openContext(page: Page) {
  const b = bubble(page)
  await b.dispatchEvent("pointerdown")
  await page.waitForTimeout(600)         // over it
  await b.dispatchEvent("pointerup")
  await page.waitForTimeout(450)
}
async function openPicker(page: Page) {
  await openBar(page)
  await page.locator("button.w-9.h-9.rounded-full").filter({ visible: true }).first().click()
  await page.waitForTimeout(1800)        // emoji-mart's data chunk is lazy
}

async function closeMenus(page: Page) {
  const scrim = page.locator('div.fixed.inset-0.z-\\[155\\]')
  for (let i = 0; i < 4; i++) {
    if (!(await scrim.count())) break
    await scrim.first().dispatchEvent("pointerdown")
    await page.waitForTimeout(220)
  }
}

/** Park the anchor at a fraction of the visible transcript; false if it won't fit. */
async function park(page: Page, frac: number): Promise<boolean> {
  await page.evaluate(({ text, frac }) => {
    const s = document.querySelector("[data-bottom-anchored]") as HTMLElement | null
    const el = Array.from(document.querySelectorAll("[data-message-bubble]"))
      .find(e => (e.textContent ?? "").includes(text)) as HTMLElement | undefined
    if (!s || !el) return
    s.scrollTop += (el.getBoundingClientRect().top - s.getBoundingClientRect().top) - s.clientHeight * frac
  }, { text: ANCHOR, frac })
  await page.waitForTimeout(320)
  return page.evaluate(text => {
    const s = document.querySelector("[data-bottom-anchored]")!.getBoundingClientRect()
    const el = Array.from(document.querySelectorAll("[data-message-bubble]"))
      .find(e => (e.textContent ?? "").includes(text)) as HTMLElement | undefined
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.top >= s.top - 2 && r.bottom <= s.bottom + 2
  }, ANCHOR)
}

/** The open menu's box vs the transcript's. Null when no single menu is open. */
async function menuVsBox(page: Page) {
  return page.evaluate(() => {
    const menus = (Array.from(document.querySelectorAll("div")) as HTMLElement[]).filter(d => {
      const cs = getComputedStyle(d)
      if (cs.position !== "absolute") return false
      if (cs.zIndex !== "160" && cs.zIndex !== "161") return false
      const r = d.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    if (menus.length !== 1) return { count: menus.length } as const
    const m = menus[0].getBoundingClientRect()
    const el = document.querySelector("[data-bottom-anchored]") as HTMLElement
    const s = el.getBoundingClientRect()
    // HORIZONTALLY the bound is the CONTENT column, not the scroller box: the
    // transcript's own side padding is the gutter every message sits inside, and a
    // menu that spills into it reads as a broken margin even though it is still
    // technically on the page. (It also clips silently — the transcript is
    // `overflow-x: hidden` so swipe-to-reply can run a bubble off the edge.)
    const cs = getComputedStyle(el)
    const padL = parseFloat(cs.paddingLeft) || 0
    const padR = parseFloat(cs.paddingRight) || 0
    return {
      count: 1,
      overTop: Math.round(s.top - m.top),
      overBottom: Math.round(m.bottom - s.bottom),
      overLeft: Math.round((s.left + padL) - m.left),
      overRight: Math.round(m.right - (s.right - padR)),
    } as const
  })
}

const VIEWPORTS = [
  { width: 430, height: 932 },   // 15 Pro Max
  { width: 390, height: 844 },   // 14 / 15
  { width: 375, height: 667 },   // SE 2/3 — the narrowest CURRENT iPhone
]
const KEYBOARDS = [0, 336]
const POSITIONS: [string, number][] = [["top", 0.02], ["mid", 0.45], ["bot", 0.80]]
const MENUS: [string, (p: Page) => Promise<void>][] = [
  ["reaction bar", openBar],
  ["context menu", openContext],
  ["reaction picker", openPicker],
]

test("no message menu escapes the transcript, on any phone, keyboard up or down", async ({ page }) => {
  test.setTimeout(900_000)
  await page.goto(`/home?tab=chats&chat=${roomId}`)
  await page.locator("[data-message-bubble]").first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1200)

  // Collect every violation and assert once — dying on the first tells you nothing
  // about the other seventeen combinations.
  const violations: string[] = []
  const checked: string[] = []

  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp)
    await page.waitForTimeout(400)
    for (const kb of KEYBOARDS) {
      for (const [posName, frac] of POSITIONS) {
        for (const [menuName, open] of MENUS) {
          const label = `${vp.width}×${vp.height} kb${kb} ${posName} ${menuName}`
          await closeMenus(page)
          await setKeyboard(page, kb)
          await page.waitForTimeout(150)
          // An anchor that will not fit on screen is a fixture limit, not a defect —
          // but it must be VISIBLE in the report, or a skipped case and a passing
          // one look identical.
          if (!(await park(page, frac))) { checked.push(`${label}  SKIPPED (anchor cannot be parked)`); continue }
          await open(page)
          const r = await menuVsBox(page)
          if (r.count !== 1) { violations.push(`${label}: ${r.count} menus open, expected 1`); continue }
          checked.push(label)
          // 1px of slack for sub-pixel rounding on a fractional-DPR viewport.
          if (r.overTop > 1) violations.push(`${label}: ${r.overTop}px above the transcript`)
          if (r.overBottom > 1) violations.push(`${label}: ${r.overBottom}px below the transcript (under the keyboard, or off the foot of the screen)`)
          if (r.overLeft > 1) violations.push(`${label}: ${r.overLeft}px past the left gutter`)
          if (r.overRight > 1) violations.push(`${label}: ${r.overRight}px past the right gutter`)
        }
      }
    }
  }

  await closeMenus(page)
  await setKeyboard(page, 0)

  console.log(`\n===== MESSAGE MENU BOUNDS (${checked.length} cases) =====`)
  for (const c of checked) console.log("  " + c)

  expect(
    violations,
    `\n\nMENU BOUNDS VIOLATIONS (${violations.length}):\n\n` + violations.map(v => "  • " + v).join("\n") + "\n",
  ).toEqual([])
})
