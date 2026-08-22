// Long-press a message: the room recedes, the message lifts, reactions sit above
// it and actions below — and NOTHING runs off the screen, wherever the message
// happens to be.
//
// The old menu was absolutely positioned inside the message row, so it lived
// inside the transcript's scroll container: it could not dim what surrounded it,
// and near the top or bottom of the screen it had nowhere to go. The overlay
// lifts the bubble out, which is what makes the placement solvable — so the
// assertions here are about the EDGES, at the three positions that used to be
// the problem.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

const PREFIX = `${E2E_PREFIX}menu `

async function longPress(page: Page, messageId: string) {
  const bubble = page.locator(`[data-message-bubble="${messageId}"]`)
  const box = await bubble.boundingBox()
  if (!box) throw new Error("no bubble box")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(650)
  await page.mouse.up()
  await expect(page.locator('[data-msg-menu="actions"]')).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(450) // let the entry settle before measuring
}

/** Every piece of the menu, in viewport coordinates. */
async function menuBounds(page: Page) {
  return page.evaluate(() => {
    const read = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height }
    }
    return {
      reactions: read('[data-msg-menu="reactions"]'),
      bubble: read('[data-msg-menu="bubble"]'),
      actions: read('[data-msg-menu="actions"]'),
      vh: window.innerHeight,
      vw: window.innerWidth,
    }
  })
}

test.describe("immersive long-press menu", () => {
  let adminId = ""
  let groupId = ""
  let msgIds: string[] = []

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    const memberId = await sb.memberUserId()
    const { data: old } = await sb.client.from("groups").select("id")
      .eq("ministry_id", sb.ministryId).like("name", `${PREFIX}%`)
    for (const g of (old ?? []) as { id: string }[]) {
      await sb.client.from("messages").delete().eq("group_id", g.id)
      await sb.client.from("group_members").delete().eq("group_id", g.id)
      await sb.client.from("groups").delete().eq("id", g.id)
    }
    const { data: g } = await sb.client.from("groups").insert({
      name: `${PREFIX}thread`, type: "my", ministry_id: sb.ministryId, created_by: adminId,
    }).select("id").single()
    groupId = (g as { id: string }).id
    await sb.client.from("group_members").insert([adminId, memberId].map((u) => ({ group_id: groupId, user_id: u })))
    const base = Date.now() - 3600_000
    // Enough to fill the screen, so "top of the viewport" and "bottom of the
    // viewport" are genuinely different places.
    const rows = Array.from({ length: 18 }, (_, i) => ({
      group_id: groupId,
      sender_id: i % 2 === 0 ? memberId : adminId,
      content: `message number ${i + 1}`,
      message_type: "text",
      created_at: new Date(base + i * 60_000).toISOString(),
    }))
    const { data: msgs, error } = await sb.client.from("messages").insert(rows).select("id, created_at")
    if (error) throw error
    msgIds = (msgs as { id: string }[]).map((m) => m.id)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (groupId) {
      await sb.client.from("message_reactions").delete().eq("group_id", groupId)
      await sb.client.from("messages").delete().eq("group_id", groupId)
      await sb.client.from("group_members").delete().eq("group_id", groupId)
      await sb.client.from("groups").delete().eq("id", groupId)
    }
  })

  for (const width of [390, 1440] as const) {
    test(`@${width}: the menu fits at the top, middle and bottom of the screen`, async ({ browser }) => {
      test.setTimeout(240_000)
      const ctx = await browser.newContext({ storageState: adminState, viewport: { width, height: 844 } })
      const page = await ctx.newPage()
      await page.goto(`/home?tab=chats&chat=${groupId}`)
      await expect(page.locator("[data-message-bubble]").first()).toBeVisible({ timeout: 20000 })
      await page.waitForTimeout(1500)

      // Whatever is on screen now: the highest, a middle one, and the lowest.
      // Only messages that are ACTUALLY pressable: the chat header sits over the
      // top of the transcript and the composer over the bottom, so a bubble whose
      // rect merely has top > 0 can still be underneath the header — a press there
      // lands on the header and no long-press ever fires. That is what made this
      // pass at 390 and fail at 1440, where the header is taller.
      const visible = await page.evaluate(() => {
        const header = document.querySelector("h2")?.closest("div")?.getBoundingClientRect()
        const floor = Math.max(90, (header?.bottom ?? 0) + 8)
        return Array.from(document.querySelectorAll("[data-message-bubble]"))
          .map((el) => { const r = el.getBoundingClientRect(); return { id: el.getAttribute("data-message-bubble")!, top: r.top, bottom: r.bottom } })
          .filter((m) => m.top > floor && m.bottom < window.innerHeight - 150)
          .sort((a, b) => a.top - b.top)
      })
      expect(visible.length, "need several messages on screen").toBeGreaterThan(2)

      const picks = [visible[0], visible[Math.floor(visible.length / 2)], visible[visible.length - 1]]
      const labels = ["top", "middle", "bottom"]

      for (let i = 0; i < picks.length; i++) {
        await longPress(page, picks[i].id)
        const b = await menuBounds(page)
        expect(b.reactions, `${labels[i]}: reaction bar rendered`).toBeTruthy()
        expect(b.actions, `${labels[i]}: action list rendered`).toBeTruthy()

        // THE contract: everything on screen, both axes.
        expect(b.reactions!.top, `${labels[i]}: reactions above the top edge`).toBeGreaterThanOrEqual(0)
        expect(b.actions!.bottom, `${labels[i]}: actions below the bottom edge`).toBeLessThanOrEqual(b.vh)
        expect(b.reactions!.left).toBeGreaterThanOrEqual(0)
        expect(b.reactions!.right).toBeLessThanOrEqual(b.vw)
        expect(b.actions!.left).toBeGreaterThanOrEqual(0)
        expect(b.actions!.right).toBeLessThanOrEqual(b.vw)

        // Reactions ABOVE the message, actions BELOW it — the arrangement asked for.
        expect(b.reactions!.bottom, `${labels[i]}: reactions sit above the message`).toBeLessThanOrEqual(b.bubble!.top + 1)
        expect(b.actions!.top, `${labels[i]}: actions sit below the message`).toBeGreaterThanOrEqual(b.bubble!.bottom - 1)

        if (i === 2) await page.screenshot({ path: `.claude/task-context/msg-menu/shots/menu-${width}-bottom.png` })
        if (i === 0) await page.screenshot({ path: `.claude/task-context/msg-menu/shots/menu-${width}-top.png` })

        await page.keyboard.press("Escape")
        await expect(page.locator('[data-msg-menu="actions"]')).toBeHidden({ timeout: 5000 })
        await page.waitForTimeout(250)
      }
      await ctx.close()
    })
  }

  test("every action for the message is actually in the list", async ({ browser }) => {
    // The action list's height is an INPUT to the placement, so an earlier build
    // measured a list that had not rendered yet, fell back to a guess, and capped
    // the menu one row short — Delete vanished from your own messages and nothing
    // failed. Counting the rows is the only assertion that sees that.
    const ctx = await browser.newContext({ storageState: adminState, viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await expect(page.locator("[data-message-bubble]").first()).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(1500)

    // An OWN message has the longest list: Reply, Forward, Pin, Edit, Delete.
    const ownId = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("[data-message-bubble]"))
      const own = els.filter((el) => {
        const r = el.getBoundingClientRect()
        return r.top > 90 && r.bottom < window.innerHeight - 150 && r.left > window.innerWidth / 2
      })
      return own.length ? own[own.length - 1].getAttribute("data-message-bubble") : null
    })
    expect(ownId, "need one of the viewer's own messages on screen").toBeTruthy()

    await longPress(page, ownId!)
    const labels = await page.locator('[data-msg-menu="actions"] button').allInnerTexts()
    expect(labels).toContain("Reply")
    expect(labels).toContain("Forward")
    expect(labels).toContain("Edit")
    expect(labels, "the last row must not be cut off by the height cap").toContain("Delete")
    await ctx.close()
  })

  test("the original message is hidden while its clone is lifted", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: adminState, viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await expect(page.locator("[data-message-bubble]").first()).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(1500)
    const id = await page.locator("[data-message-bubble]").last().getAttribute("data-message-bubble")
    await longPress(page, id!)

    // Otherwise you see the blurred original AND the crisp clone — a double image.
    const originalHidden = await page.evaluate((mid) => {
      const el = document.querySelector(`[data-message-bubble="${mid}"]`) as HTMLElement | null
      return el ? getComputedStyle(el).visibility : "missing"
    }, id)
    expect(originalHidden).toBe("hidden")

    // …and the clone is visible, which is the half that broke first.
    const cloneVisible = await page.evaluate(() => {
      const kid = document.querySelector("[data-msg-clone] > *") as HTMLElement | null
      return kid ? getComputedStyle(kid).visibility : "missing"
    })
    expect(cloneVisible).toBe("visible")
    await ctx.close()
  })
})
