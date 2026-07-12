import { test, expect } from "@playwright/test"
import { sandbox } from "./fixtures"

// Archived chats are a STASH: hidden from the church list entirely, reachable
// only through a quiet "Archived · N" bottom row that swaps the panel to a
// read-only archived view (URL-synced as ?chats=archived, so reload restores).
//
// Assertions use role queries throughout: the mobile ChatsTab stays mounted
// (display:none) on desktop, so text queries match hidden duplicates — role
// queries only see the accessibility tree, i.e. the visible desktop panel.
// The open-conversation pane also shows the active room's NAME (heading +
// composer placeholder), so "not in the list" is asserted as "no list-card
// button", never as "text absent from the page".
//
// Arranged rows use the "E2E::Arch" sub-prefix so cleanup is surgical and can't
// clobber other suites' "E2E::" rows in a full run.
const ARCH_PREFIX = "E2E::Arch"
const ALIVE = `${ARCH_PREFIX} Alive Room`
const STASHED = `${ARCH_PREFIX} Stashed Room`

test.describe("archived chats stash", () => {
  const db = sandbox()

  test.beforeAll(async () => {
    const adminId = await db.adminUserId()
    // Church-type rows arranged directly — fixtures' createGroup is my-type only.
    const { data: groups, error } = await db.client
      .from("groups")
      .insert([
        { ministry_id: db.ministryId, name: ALIVE, type: "church", category: "general", archived: false, created_by: adminId },
        { ministry_id: db.ministryId, name: STASHED, type: "church", category: "general", archived: true, created_by: adminId },
      ])
      .select()
    if (error) throw error
    const { error: memErr } = await db.client
      .from("group_members")
      .insert(groups!.map((g: { id: string }) => ({ group_id: g.id, user_id: adminId })))
    if (memErr) throw memErr
  })

  test.afterAll(async () => {
    await db.deleteGroupsByPrefix(ARCH_PREFIX)
  })

  test("stash hidden from church list, reachable via the archived row, URL-restored", async ({ page }) => {
    const aliveCard = () => page.getByRole("button", { name: new RegExp("Arch Alive Room") })
    const stashedCard = () => page.getByRole("button", { name: new RegExp("Arch Stashed Room") })

    await page.goto("/home?tab=chats")

    // Church view: the living room is listed; the stashed room has no card.
    await expect(aliveCard().first()).toBeVisible()
    await expect(stashedCard()).toHaveCount(0)

    // The quiet bottom row is the only trace of the stash.
    await page.getByRole("button", { name: /Archived · \d+/ }).click()

    // Archived view: URL carries the browse state; stashed listed, living not.
    await expect(page).toHaveURL(/chats=archived/)
    await expect(stashedCard().first()).toBeVisible()
    await expect(aliveCard()).toHaveCount(0)

    // Reload restores the archived view from the URL.
    await page.reload()
    await expect(stashedCard().first()).toBeVisible()

    // Back returns to the church list.
    await page.getByRole("button", { name: "Back to church chats" }).click()
    await expect(aliveCard().first()).toBeVisible()
    await expect(stashedCard()).toHaveCount(0)
  })
})
