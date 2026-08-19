// Jumbo emoji (iMessage-style): one or two emoji ALONE render large and bare;
// three or more, or any text alongside, is an ordinary bubble.
//
// The counting rules are unit-covered in lib/jumbo-emoji.ts. What this asserts is
// the RENDER decision — that "no bubble" actually means no bubble, and that the
// message still behaves like a message. A family emoji is included on purpose:
// it is seven code points, so any implementation counting characters instead of
// grapheme clusters reads it as seven emoji and never jumbos it.
import { test, expect } from "@playwright/test"
import { sandbox, memberState, E2E_PREFIX } from "./fixtures"

test.describe("jumbo emoji", () => {
  test.describe.configure({ timeout: 180000 })
  test.use({ storageState: memberState })

  const ROOM = `${E2E_PREFIX}Jumbo`
  let roomId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const admin = await sb.adminUserId()
    const member = await sb.memberUserId()
    await sb.deleteGroupsByPrefix(ROOM)
    const g = await sb.createGroup({ name: ROOM, memberIds: [admin, member] })
    roomId = g.id
    for (const text of ["😀", "😀😀", "👨‍👩‍👧‍👦", "😀😀😀", "nice 😀"]) {
      await sb.insertMessage({ groupId: roomId, senderId: admin, content: text })
      await new Promise((r) => setTimeout(r, 150))
    }
  })
  test.afterAll(async () => { await sandbox().deleteGroupsByPrefix(ROOM) })

  // The bubble is the nearest ancestor carrying the press contract (its title is
  // the long-press hint) — anchoring there rather than on a class keeps this
  // honest if the styling changes shape.
  const bubbleOf = (page: import("@playwright/test").Page, text: string) =>
    page.locator("[data-bottom-anchored] [title='Long-press for reply and reactions']")
      .filter({ hasText: text }).first()

  async function bubbleStyle(page: import("@playwright/test").Page, text: string) {
    const el = bubbleOf(page, text)
    await el.waitFor({ state: "visible", timeout: 30000 })
    return el.evaluate((n) => {
      const cs = getComputedStyle(n as Element)
      const leaf = (n as Element).querySelector("div:not(:has(div))") ?? (n as Element)
      return { background: cs.backgroundColor, fontSize: parseFloat(getComputedStyle(leaf).fontSize) }
    })
  }

  const TRANSPARENT = (c: string) => c === "rgba(0, 0, 0, 0)" || c === "transparent"

  test("one emoji alone is large and has no bubble", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${roomId}`)
    const s = await bubbleStyle(page, "😀")
    expect(TRANSPARENT(s.background), "a lone emoji must have no bubble surface").toBe(true)
    expect(s.fontSize, "and must be much larger than body text").toBeGreaterThan(30)
  })

  test("two emoji are still bare, but smaller than one", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${roomId}`)
    const one = await bubbleStyle(page, "😀")
    const two = await bubbleStyle(page, "😀😀")
    expect(TRANSPARENT(two.background), "two emoji must still have no bubble").toBe(true)
    expect(two.fontSize, "two must step down from one").toBeLessThan(one.fontSize)
    expect(two.fontSize, "but still be jumbo").toBeGreaterThan(20)
  })

  test("a family emoji is ONE emoji, not seven code points", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${roomId}`)
    const fam = await bubbleStyle(page, "👨‍👩‍👧‍👦")
    const one = await bubbleStyle(page, "😀")
    expect(TRANSPARENT(fam.background), "a ZWJ sequence must jumbo like any single emoji").toBe(true)
    expect(fam.fontSize).toBe(one.fontSize)
  })

  test("three emoji, or text alongside, go back to a normal bubble", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${roomId}`)
    const three = await bubbleStyle(page, "😀😀😀")
    const withText = await bubbleStyle(page, "nice 😀")
    expect(TRANSPARENT(three.background), "three emoji must have a bubble again").toBe(false)
    expect(TRANSPARENT(withText.background), "any text alongside must have a bubble").toBe(false)
    expect(three.fontSize, "and be body-sized").toBeLessThan(20)
  })
})
