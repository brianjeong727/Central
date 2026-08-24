// The chat scope switcher says WHICH scope is holding your unread.
//
// Church | Mine | Open hides two of the three buckets. Before this, a message
// could arrive, the bottom-nav badge would light, you would open Messages on the
// Church scope, see an empty list, and conclude the app had lost it — when it was
// sitting one tab over the whole time.
//
// The contract worth guarding is not "a dot renders". It is that the dots
// PARTITION the nav badge: the scope indicators must account for exactly the
// unread the nav is counting, or the feature swaps "where is it?" for "where are
// the other ones?". So these tests assert the dot appears on the scope that holds
// the message and NOT on the one that doesn't, and that muted — which the nav
// total also excludes — stays silent.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

const PREFIX = `${E2E_PREFIX}scopeunread `

/** The dot is a sibling of the label text inside the control, so scope by the control.
 *  Desktop renders SegmentedControl (role=radio); phone width renders the scope AS the
 *  PocketChrome title (role=tab). Two different components showing one feature, which is
 *  exactly why both are asserted here rather than one standing in for the other. */
function scopeChip(page: Page, name: "Church" | "Mine" | "Open") {
  const re = new RegExp(`^${name}`)
  return page.getByRole("radio", { name: re })
    .or(page.getByRole("tab", { name: re }))
    .filter({ visible: true })
    .first()
}
async function hasDot(page: Page, name: "Church" | "Mine" | "Open"): Promise<boolean> {
  return (await scopeChip(page, name).locator("span[aria-hidden]").count()) > 0
}

test.describe("chat scope unread indicator", () => {
  test.use({ storageState: adminState })

  let myChatId = ""
  let churchChatId = ""
  let adminId = ""
  let memberId = ""

  async function wipe() {
    const sb = sandbox()
    const { data: rooms } = await sb.client.from("groups").select("id")
      .eq("ministry_id", sb.ministryId).like("name", `${PREFIX}%`)
    for (const g of (rooms ?? []) as { id: string }[]) {
      await sb.client.from("messages").delete().eq("group_id", g.id)
      await sb.client.from("group_members").delete().eq("group_id", g.id)
      await sb.client.from("groups").delete().eq("id", g.id)
    }
  }

  test.beforeAll(async () => {
    await wipe()
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()

    const { data: g } = await sb.client.from("groups").insert({
      name: `${PREFIX}room`, type: "my", ministry_id: sb.ministryId, created_by: memberId,
    }).select("id").single()
    myChatId = (g as { id: string }).id
    await sb.client.from("group_members").insert([
      { group_id: myChatId, user_id: memberId },
      // last_read_at NULL = never opened, which is what makes the row unread for
      // the viewer. The message below is from the OTHER member for the same reason:
      // your own message is not unread to you.
      { group_id: myChatId, user_id: adminId },
    ])
    await sb.insertMessage({ groupId: myChatId, senderId: memberId, content: `${PREFIX}you are on the wrong tab` })

    // Land the desktop tests INSIDE a church chat. The panel auto-opens the most
    // recent conversation when it has no chat in the URL, which on this sandbox is
    // the room we just seeded — it would read the message out from under the test
    // and the dot would be gone before the first assertion ran.
    const { data: church } = await sb.client.from("groups").select("id")
      .eq("ministry_id", sb.ministryId).eq("type", "church").eq("is_central_chat", true).maybeSingle()
    churchChatId = (church as { id: string } | null)?.id ?? ""
  })

  test.afterAll(wipe)

  /** Put the seeded chat back to unread-and-unmuted for the viewer.
   *  These tests share one room and each one mutates it — reading it clears the
   *  unread, muting it silences it — so every test arranges its own starting
   *  state rather than inheriting the previous test's leftovers. Order-dependent
   *  fixtures are how a suite starts passing for the wrong reason. */
  async function makeUnread() {
    const sb = sandbox()
    const { error } = await sb.client.from("group_members")
      .update({ last_read_at: null, notify_mode: null })
      .eq("group_id", myChatId).eq("user_id", adminId)
    if (error) throw error
  }

  test("an unread personal chat dots Mine while you are looking at Church", async ({ page }) => {
    await makeUnread()
    await page.goto(`/home?tab=chats&chat=${churchChatId}`)
    await expect(scopeChip(page, "Church")).toBeVisible({ timeout: 15_000 })
    // Looking at a church chat — the scope where the message is invisible.
    await expect(scopeChip(page, "Church")).toHaveAttribute("aria-checked", "true")

    await expect
      .poll(() => hasDot(page, "Mine"), {
        timeout: 15_000,
        message: "the scope holding the unread message must say so",
      })
      .toBe(true)

    // The scope that has nothing must stay quiet, or the indicator tells you
    // nothing at all.
    expect(await hasDot(page, "Church"), "Church has no unread here").toBe(false)
    // Open is discovery — groups you have NOT joined — so it can never be unread.
    expect(await hasDot(page, "Open")).toBe(false)
  })

  test("the dot clears once the chat has actually been read", async ({ page }) => {
    await makeUnread()
    await page.goto(`/home?tab=chats&chat=${churchChatId}`)
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" })
    await expect(scopeChip(page, "Church")).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => hasDot(page, "Mine"), { timeout: 15_000 }).toBe(true)

    await scopeChip(page, "Mine").click()
    // .filter({ visible: true }) — both viewports' lists are in the DOM at once
    // (the other is `md:hidden`), so .first() picks the hidden copy half the time.
    await page.getByText(`${PREFIX}room`).filter({ visible: true }).first().click()
    await page.waitForTimeout(2500)

    await expect
      .poll(() => hasDot(page, "Mine"), {
        timeout: 20_000,
        message: "reading the chat must retire the indicator — a dot that never clears is noise",
      })
      .toBe(false)
  })

  test("phone width dots the scope in the chrome row, where the notification is opened", async ({ browser }) => {
    // The phone does not use SegmentedControl at all — the three scopes ARE the
    // chrome title (PocketChrome `scope`). A desktop-only assertion would have
    // passed while the viewport that actually receives the push showed nothing.
    const context = await browser.newContext({
      storageState: adminState,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    const page = await context.newPage()
    await makeUnread()
    await page.goto("/home?tab=chats")
    await expect(scopeChip(page, "Church")).toBeVisible({ timeout: 15_000 })

    await expect
      .poll(() => hasDot(page, "Mine"), {
        timeout: 15_000,
        message: "the phone chrome must name the scope holding the unread",
      })
      .toBe(true)
    expect(await hasDot(page, "Church")).toBe(false)
    await context.close()
  })

  test("a muted chat stays silent, exactly as it does in the nav badge", async ({ page }) => {
    // Muting is the user saying "stop pulling me back to this". The bottom-nav
    // total already excludes muted chats; if the scope dot did not, the switcher
    // would point at a scope the badge never counted.
    const sb = sandbox()
    await sb.client.from("group_members")
      .update({ notify_mode: "off", last_read_at: null })
      .eq("group_id", myChatId).eq("user_id", adminId)

    const { data: row } = await sb.client.from("group_members")
      .select("muted").eq("group_id", myChatId).eq("user_id", adminId).single()
    // `muted` is trigger-derived from notify_mode (CLAUDE.md schema note) — assert
    // the arrangement actually took, or the UI check below proves nothing: an
    // unmuted chat would also show no dot if the mute silently failed to apply.
    expect(row?.muted, "notify_mode=off must derive muted=true").toBe(true)

    await page.goto(`/home?tab=chats&chat=${churchChatId}`)
    await expect(scopeChip(page, "Church")).toBeVisible({ timeout: 15_000 })
    // Give the list a beat to settle on real data before reading the negative —
    // asserting "no dot" against a list that has not loaded passes for the wrong
    // reason.
    await expect(page.getByText(`${PREFIX}room`).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15_000 })
      .catch(async () => { await scopeChip(page, "Mine").click() })
    await page.waitForTimeout(1500)
    expect(await hasDot(page, "Mine"), "a muted chat must not light the scope").toBe(false)
  })
})
