// The poll composer stays reachable while the keyboard is up.
//
// It is a bottom `CentralModal` whose question field AUTOFOCUSES, so opening it
// opens the keyboard onto itself. The shell claims the layout (`resize: "none"`,
// Convention #28) which means the layout viewport does NOT shrink when the keys
// appear — so a sheet pinned to the bottom edge sat at the bottom of a
// full-height screen, entirely behind the keyboard. "Create a poll" and the
// touchpad appeared together and the composer was invisible.
//
// The keyboard cannot be summoned in headless Chromium, so this drives the
// CONTRACT the app actually consumes: `--kb-inset` plus `[data-kb-open]`, exactly
// what lib/keyboard-inset.ts publishes. That is the half that was broken — the
// modal ignored the inset it was being told about.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

const KB = 336 // a realistic iPhone keyboard
const PREFIX = `${E2E_PREFIX}poll `

/** Publish a keyboard the way lib/keyboard-inset.ts does. */
async function raiseKeyboard(page: Page, px: number) {
  await page.evaluate((h) => {
    document.documentElement.style.setProperty("--kb-inset", `${h}px`)
    document.documentElement.setAttribute("data-kb-open", "")
  }, px)
  await page.waitForTimeout(400)
}

test.describe("poll composer vs the keyboard", () => {
  let groupId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const memberId = await sb.memberUserId()
    const { data: old } = await sb.client.from("groups").select("id")
      .eq("ministry_id", sb.ministryId).like("name", `${PREFIX}%`)
    for (const g of (old ?? []) as { id: string }[]) {
      await sb.client.from("polls").delete().eq("group_id", g.id)
      await sb.client.from("messages").delete().eq("group_id", g.id)
      await sb.client.from("group_members").delete().eq("group_id", g.id)
      await sb.client.from("groups").delete().eq("id", g.id)
    }
    const { data: g } = await sb.client.from("groups").insert({
      name: `${PREFIX}room`, type: "my", ministry_id: sb.ministryId, created_by: adminId,
    }).select("id").single()
    groupId = (g as { id: string }).id
    await sb.client.from("group_members").insert([adminId, memberId].map((u) => ({ group_id: groupId, user_id: u })))
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (!groupId) return
    await sb.client.from("polls").delete().eq("group_id", groupId)
    await sb.client.from("messages").delete().eq("group_id", groupId)
    await sb.client.from("group_members").delete().eq("group_id", groupId)
    await sb.client.from("groups").delete().eq("id", groupId)
  })

  test("phone (390): the sheet clears the keyboard, buttons and all", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: adminState, viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await page.waitForTimeout(2000)

    // The "+" in the composer → Poll.
    // Dispatched directly on the element, not through a synthetic mouse click:
    // the Next.js DEV INDICATOR (the "N" badge, bottom-left, dev builds only)
    // sits exactly on the composer's "+" at phone width and swallows the click at
    // those coordinates. It does not exist in production, so hit-testing against
    // it would be the harness reporting on itself. (`force` does not help —
    // it skips the actionability wait but the event still lands on the badge.)
    await page.getByRole("button", { name: "Add to message" }).evaluate((el: HTMLElement) => el.click())
    const pollEntry = page.getByText("Poll", { exact: true }).filter({ visible: true }).first()
    await expect(pollEntry).toBeVisible({ timeout: 10000 })
    await pollEntry.click()

    const sheet = page.getByText("Create a poll").locator("xpath=ancestor::div[contains(@class,'animate-dialog-in')]")
    await expect(sheet).toBeVisible({ timeout: 10000 })

    await raiseKeyboard(page, KB)

    const box = await sheet.boundingBox()
    expect(box, "the composer should still be laid out").toBeTruthy()
    const floor = 844 - KB
    // THE bug: the sheet used to sit flush with the bottom of a full-height
    // screen, which is under the keys.
    expect(Math.round(box!.y + box!.height), "the sheet must sit above the keyboard")
      .toBeLessThanOrEqual(floor + 1)
    // …and it must not have been pushed off the top to get there.
    expect(box!.y, "the sheet must not run off the top").toBeGreaterThanOrEqual(0)

    // The thing you came to press.
    const create = page.getByRole("button", { name: "Create poll" })
    const cbox = await create.boundingBox()
    expect(cbox, "the Create poll button should be laid out").toBeTruthy()
    expect(Math.round(cbox!.y + cbox!.height), "Create poll must be above the keyboard")
      .toBeLessThanOrEqual(floor + 1)

    await page.screenshot({ path: ".claude/task-context/poll-kb/shots/poll-keyboard-390.png" })
    await ctx.close()
  })

  test("desktop (1440): unaffected — the modal stays centred", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: adminState, viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await page.waitForTimeout(2000)
    await page.getByTitle("Create a poll").first().click()
    const sheet = page.getByText("Create a poll").locator("xpath=ancestor::div[contains(@class,'animate-dialog-in')]")
    await expect(sheet).toBeVisible({ timeout: 10000 })
    // The contract is that the keyboard clamp RESETS at md — asserted on the
    // computed value, not on the modal's pixel position. Position is the wrong
    // probe: `[data-kb-open]` legitimately collapses `.kb-safe-bottom` padding on
    // descendants, so a centred panel can shift a pixel or two for reasons that
    // are working as intended, and an equality assertion on `y` would be
    // measuring that instead of this.
    const maxHBefore = await sheet.evaluate((el) => getComputedStyle(el).maxHeight)
    await raiseKeyboard(page, KB)
    const maxHAfter = await sheet.evaluate((el) => getComputedStyle(el).maxHeight)
    expect(maxHAfter, "the keyboard clamp must not apply at desktop widths").toBe(maxHBefore)
    // 85vh of 900 — i.e. the plain desktop clamp, with no keyboard arithmetic.
    expect(Math.round(parseFloat(maxHAfter))).toBe(765)
    await ctx.close()
  })
})
