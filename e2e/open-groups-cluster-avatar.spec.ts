// An open group's row shows its PEOPLE, not the first letter of its title.
//
// Browse-open-groups rendered `<ChatAvatar title={name}/>` with no members, so it
// fell through to the solo branch and drew the title's first initial — a chip
// spending itself repeating the label printed directly beside it, and a row that
// looked nothing like the same room once you joined it. `list_open_groups` now
// returns the same three-member cluster `get_chat_list` does, so the row is the
// SAME OBJECT before and after joining.
//
// Asserted on the rendered chip, not on the RPC: "the data arrives" was already
// half-true before (member_count did), and it is the chip that was wrong.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

/**
 * The most faces any one chip on screen is drawing.
 *
 * Deliberately measured across the WHOLE screen rather than by locating a
 * particular row: the two viewports build their rows from different primitives
 * (`PocketRow` vs a bare grid), and a row locator that works for one is a
 * brittle guess for the other. The invariant is the same either way — the solo
 * branch draws exactly one `MonogramChip`, the cluster branch draws two or
 * three inside its `aria-hidden` wrapper. Anything above 1 can only be a cluster.
 */
async function maxChipPieces(page: Page): Promise<number> {
  return page.evaluate(() => {
    // SCOPED to the browse screen. It is a SubpageShell drawn over the chat list,
    // which stays mounted underneath — a document-wide scan reads the chat list's
    // clusters instead, and this assertion passed with the cluster deliberately
    // removed until it was scoped. `data-open-groups` marks the run.
    const root = document.querySelector("[data-open-groups]")
    if (!root) return -1
    let max = 0
    for (const el of Array.from(root.querySelectorAll('span[aria-hidden="true"]'))) {
      const n = el.querySelectorAll("[data-monogram]").length
      if (n > max) max = n
    }
    return max
  })
}

async function openBrowse(page: Page) {
  // Open groups is the Chats screen's THIRD SCOPE now, not a push surface reached
  // from an entry row in the list — so it is a plain URL rather than a tap. The
  // row this used to click no longer exists (it was the placement that read as
  // "too loud" at the top and went undiscoverable at the bottom; a scope is
  // neither). ?chats=open is server-resolved by resolveChatsSection.
  await page.goto("/home?tab=chats&chats=open")
  await expect(page.locator("[data-open-groups]").first()).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(1200)
}

test.describe("open groups browse — the avatar is the members", () => {
  let multiName = ""
  let multiOthers = 0

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    // Pick a real open room with enough people to force the CLUSTER branch:
    // ChatAvatar draws solo at <= 1 other member, so the fixture must have >= 2
    // besides the viewer or this spec would pass on the old behaviour too.
    const { data: groups } = await sb.client
      .from("groups").select("id, name")
      .eq("ministry_id", sb.ministryId).eq("type", "my").eq("is_open", true)
    for (const g of (groups ?? []) as { id: string; name: string }[]) {
      const { data: mem } = await sb.client.from("group_members").select("user_id").eq("group_id", g.id)
      const others = (mem ?? []).filter((m: { user_id: string }) => m.user_id !== adminId).length
      if (others > multiOthers) { multiOthers = others; multiName = g.name }
    }
  })

  test("phone (390): a multi-member room draws a cluster, not one letter", async ({ browser }) => {
    test.skip(multiOthers < 2, "needs an open group with 2+ members besides the viewer")
    const ctx = await browser.newContext({ storageState: adminState, viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await openBrowse(page)
    const pieces = await maxChipPieces(page)
    expect(pieces, "the open-groups run was not on screen").toBeGreaterThanOrEqual(0)
    expect(pieces, `"${multiName}" has ${multiOthers} other members — a chip in this list should draw more than one face`).toBeGreaterThan(1)
    await ctx.close()
  })

  test("desktop (1440): same room, same cluster", async ({ browser }) => {
    test.skip(multiOthers < 2, "needs an open group with 2+ members besides the viewer")
    const ctx = await browser.newContext({ storageState: adminState, viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await openBrowse(page)
    const pieces = await maxChipPieces(page)
    expect(pieces, "the open-groups run was not on screen").toBeGreaterThanOrEqual(0)
    expect(pieces).toBeGreaterThan(1)
    await ctx.close()
  })

  // NOTE: there is deliberately no service-role assertion on list_open_groups
  // here. It is SECURITY DEFINER keyed on auth.uid() → auth_ministry_id(), so the
  // service-role client has no identity and CORRECTLY returns zero rows — a test
  // written that way fails against a perfectly good function. The RPC's
  // confinement (cross-tenant, non-open, archived, anon, the 3-row cap) was
  // probed with real impersonated sessions during review; see
  // .claude/task-context/open-groups-cluster/review-before.md.
})
