// N4 — Messages: list (both widths, all scopes), search, open groups, create
// chat, the thread with its menus/sheets, chat settings and its drills. Calls are
// captured only as far as the incoming-ring surface can be triggered without a
// media device (they are SKIPPED with the reason otherwise).
import { test } from "@playwright/test"
import { adminState, memberState, sandbox } from "../e2e/fixtures"
import { attempt, capture, coveredBy, goHome, isMobile, restoreRoles, setRole, settle, skip, STATE, type Role } from "./lib"

test.describe.configure({ mode: "serial" })

async function chatIds() {
  const sb = sandbox()
  const { data } = await sb.client.from("groups").select("id,name,type").eq("ministry_id", sb.ministryId)
  const by = (n: string) => data?.find(g => g.name === n)?.id
  return { central: by("E2E Sandbox Chat")!, dg: by("Tuesday Night DG")!, dm: by("E2E Member")!, leaders: by("Leaders")! }
}

async function openChat(page: import("@playwright/test").Page, id: string) {
  await goHome(page, { tab: "chats", chat: id })
  await settle(page, 900)
}

test.describe("N4 as admin", () => {
  test.use({ storageState: adminState })
  test.afterAll(async () => { await restoreRoles() })

  test("list, scopes, search, open groups, create", async ({ page }) => {
    await setRole("admin", "admin")
    const role: Role = "admin"
    const mobile = isMobile(page)
    await goHome(page, { tab: "chats" })
    await capture(page, mobile ? "N4.1" : "N4.2", { role, state: STATE, label: "Chats · Church scope" })
    coveredBy(page, ["N4.1.1"], mobile ? "N4.1" : "N4.2", role)
    for (const [scope, id] of [["Mine", "N4.1.2"], ["Open", "N4.3"]] as const) {
      await attempt(page, id, role, async () => {
        await page.getByRole("button", { name: new RegExp(`^${scope}$`, "i") }).filter({ visible: true }).first().click({ timeout: 5_000 }).catch(() => page.getByText(scope, { exact: true }).filter({ visible: true }).first().click())
        await settle(page, 400)
        await capture(page, id, { role, state: STATE, label: `Chats · ${scope} scope` })
      })
    }
    await attempt(page, "N4.4", role, async () => {
      await goHome(page, { tab: "chats" })
      const search = page.getByPlaceholder(/search/i).first()
      await search.click({ timeout: 5_000 })
      await settle(page, 400)
      await capture(page, "N4.4", { role, state: `${STATE}-suggested`, label: "Chat search · suggested" })
      await search.fill("retreat")
      await settle(page, 600)
      await capture(page, "N4.4", { role, state: STATE, label: "Chat search · results" })
    })
    await attempt(page, "N4.5", role, async () => {
      await goHome(page, { tab: "chats" })
      const plus = page.locator("button[aria-label*='ew chat'], button[title*='ew chat'], button[aria-label*='ew message']").filter({ visible: true }).first()
      await plus.click({ timeout: 6_000 })
      await settle(page)
      await capture(page, "N4.5", { role, state: STATE, label: "Create chat" })
      await page.keyboard.press("Escape")
    })
  })

  test("thread + menus + settings", async ({ page }) => {
    const role: Role = "admin"
    const mobile = isMobile(page)
    const C = await chatIds()

    await openChat(page, C.central)
    await capture(page, "N4.6", { role, state: `${STATE}-church-30plus`, label: "Thread · church chat (≥30, poll, pin)" })
    coveredBy(page, ["N4.6.1", "N4.6.2", "N4.6.3", "N4.6.11", "N4.6.12", "N4.6.14"], "N4.6", role)
    await openChat(page, C.dg)
    await capture(page, "N4.6", { role, state: `${STATE}-my-chat`, label: "Thread · my chat (attachment, nickname)" })
    await openChat(page, C.dm)
    await capture(page, "N4.6", { role, state: `${STATE}-dm`, label: "Thread · DM" })

    // Poll vote / votes modal
    await attempt(page, "N4.6.7", role, async () => {
      await openChat(page, C.central)
      await page.getByText(/^\d+ votes?$/i).filter({ visible: true }).first().scrollIntoViewIfNeeded()
      await capture(page, "N4.6.7", { role, state: `${STATE}-poll`, label: "Poll message", foldOnly: true })
      await page.getByText(/^\d+ votes?$/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N4.6.7", { role, state: STATE, label: "Poll votes", foldOnly: true })
      await page.keyboard.press("Escape")
    })
    // Message long-press menu (context menu) + emoji picker (tap)
    await attempt(page, "N4.6.5", role, async () => {
      await openChat(page, C.dg)
      const bubble = page.getByText(/bringing the good cookies/i).filter({ visible: true }).first()
      const box = await bubble.boundingBox()
      if (!box) throw new Error("bubble not visible")
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(600)
      await page.mouse.up()
      await settle(page, 300)
      await capture(page, "N4.6.5", { role, state: STATE, label: "Message context menu", foldOnly: true })
      await page.keyboard.press("Escape")
      await settle(page, 300)
      await bubble.click({ timeout: 4_000 })
      await settle(page, 400)
      await capture(page, "N4.6.4", { role, state: STATE, label: "Emoji picker", foldOnly: true })
      await page.keyboard.press("Escape")
    })
    // Reactors sheet
    await attempt(page, "N4.6.8", role, async () => {
      await openChat(page, C.dg)
      await page.getByText(/🍪/).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N4.6.8", { role, state: STATE, label: "Reactors sheet", foldOnly: true })
      await page.keyboard.press("Escape")
    })
    // Poll create modal
    await attempt(page, "N4.6.6", role, async () => {
      await openChat(page, C.dg)
      await page.locator('button[title="Create a poll"]').filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N4.6.6", { role, state: STATE, label: "Poll create", foldOnly: true })
      await page.keyboard.press("Escape")
    })
    // Image lightbox
    await attempt(page, "N4.6.10", role, async () => {
      await openChat(page, C.dg)
      await page.locator('img[alt="Image"]').filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N4.6.10", { role, state: STATE, label: "Image lightbox", foldOnly: true })
      await page.keyboard.press("Escape")
    })

    // Chat settings + drills
    await attempt(page, "N4.7", role, async () => {
      await openChat(page, C.dg)
      if (mobile) await page.locator(".back-chevron").filter({ visible: true }).first().locator("xpath=..").locator("[data-monogram]").first().click({ timeout: 5_000 })
      else await page.locator("button:has(.lucide-settings)").filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N4.7", { role, state: STATE, label: "Chat settings (my chat)" })
      coveredBy(page, ["N4.7.1", "N4.7.6", "N4.7.8", "N4.7.9", "N4.7.10", "N4.7.12"], "N4.7", role)
      for (const [id, label] of [["N4.7.3", /^members$/i], ["N4.7.4", /media & files|media/i], ["N4.7.7", /^notifications$/i]] as const) {
        await attempt(page, id, role, async () => {
          await page.getByText(label).filter({ visible: true }).first().click({ timeout: 5_000 })
          await settle(page)
          await capture(page, id, { role, state: STATE, label: `Chat settings · ${label.source}` })
          if (mobile) { await page.locator(".back-chevron").filter({ visible: true }).first().click({ timeout: 4_000 }); await settle(page, 300) } else { await page.keyboard.press("Escape") }
        })
      }
      await attempt(page, "N4.7.11", role, async () => {
        await page.getByRole("button", { name: /add members/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
        await settle(page, 300)
        await capture(page, "N4.7.11", { role, state: STATE, label: "Add members picker", foldOnly: true })
        await page.keyboard.press("Escape")
      })
    })
    await attempt(page, "N4.7", role, async () => {
      await openChat(page, C.central)
      if (mobile) await page.locator(".back-chevron").filter({ visible: true }).first().locator("xpath=..").locator("[data-monogram]").first().click({ timeout: 5_000 })
      else await page.locator("button:has(.lucide-settings)").filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N4.7", { role, state: `${STATE}-church`, label: "Chat settings (church chat)" })
      coveredBy(page, ["N4.7.5"], "N4.7", role)
    })
    await attempt(page, "N4.7.2", role, async () => {
      await openChat(page, C.dm)
      if (mobile) await page.locator(".back-chevron").filter({ visible: true }).first().locator("xpath=..").locator("[data-monogram]").first().click({ timeout: 5_000 })
      else await page.locator("button:has(.lucide-settings)").filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page)
      await capture(page, "N4.7", { role, state: `${STATE}-dm`, label: "Chat settings (DM)" })
      await page.getByText(/nickname/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N4.7.2", { role, state: STATE, label: "Nickname editor", foldOnly: true })
      await page.keyboard.press("Escape")
    })
    skip(page, "N4.8.1", role, "Calls need a LiveKit room + media device; the ring/overlay are reviewed from code and the in-thread call affordances in N4.6.1.")
    skip(page, "N4.8.2", role, "Incoming-call surface not reproducible headless.")
    skip(page, "N4.8.3", role, "Video stage not reproducible headless.")
    skip(page, "N4.8.4", role, "Video grid not reproducible headless.")
    skip(page, "N4.8.5", role, "Screen share not reproducible headless.")
    skip(page, "N4.6.9", role, "Forward sheet opens from the context menu; menu captured in N4.6.5.")
    skip(page, "N4.6.13", role, "Invite card renders only after an in-chat invite is sent; reviewed from code.")
  })
})

test.describe("N4 as member", () => {
  test.use({ storageState: memberState })
  test.afterAll(async () => { await restoreRoles() })
  test("list + thread + swipe actions", async ({ page }) => {
    await setRole("member", "member")
    const role: Role = "member"
    const mobile = isMobile(page)
    const C = await chatIds()
    await goHome(page, { tab: "chats" })
    await capture(page, mobile ? "N4.1" : "N4.2", { role, state: STATE, label: "Chats (member)" })
    await openChat(page, C.central)
    await capture(page, "N4.6", { role, state: `${STATE}-member`, label: "Thread · church chat (member)" })
    if (mobile) {
      await attempt(page, "N4.9", role, async () => {
        await goHome(page, { tab: "chats" })
        await page.getByRole("button", { name: /^mine$/i }).filter({ visible: true }).first().click({ timeout: 5_000 }).catch(() => page.getByText("Mine", { exact: true }).filter({ visible: true }).first().click())
        await settle(page, 400)
        const row = page.getByText("Tuesday Night DG", { exact: true }).filter({ visible: true }).first()
        const box = await row.boundingBox()
        if (!box) throw new Error("row not visible")
        await page.touchscreen.tap(box.x + 300, box.y + box.height / 2).catch(() => {})
        await page.mouse.move(box.x + 300, box.y + box.height / 2)
        await page.mouse.down()
        for (let x = 300; x > 120; x -= 30) { await page.mouse.move(box.x + x, box.y + box.height / 2); await page.waitForTimeout(20) }
        await page.mouse.up()
        await settle(page, 300)
        await capture(page, "N4.1.2", { role, state: `${STATE}-swiped`, label: "Chats · Mine · swipe actions", foldOnly: true })
      })
    }
  })
})
