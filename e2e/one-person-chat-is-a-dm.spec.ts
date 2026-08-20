// Picking ONE person in the chat composer makes a DIRECT MESSAGE — from either "+".
//
// The composer used to create whatever kind its "+" belonged to, even for a single
// recipient, while its button read "Message Eric". A leader who opened Church Chats
// and picked one person got a CHURCH chat named after them, in the church list, with
// the other member's face as its icon. It happened twice to one leader inside 35
// minutes (2026-08-19) and both of his real 1:1 conversations ended up there.
//
// The assertions are on the DB row's `type`, not on where the row renders: "it looked
// like a DM" is exactly the thing that was true before and still wrong.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

function dmPairKey(a: string, b: string) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

// The composer is a full-screen overlay ON TOP of the chat list, and the list
// behind it also renders people's names. Every lookup MUST be scoped to the
// dialog or Playwright resolves the one underneath and then waits forever for
// the overlay to stop intercepting the click.
const composer = (page: Page) => page.locator('div.fixed.inset-0.z-\\[60\\]').last()

/** Open the Church Chats "+" for the General section and pick people by name. */
async function composeChurchChat(page: Page, names: string[]) {
  await page.goto("/home?tab=chats&chats=church")
  const plus = page.locator('[title="New general chat"]').filter({ visible: true }).first()
  await expect(plus).toBeVisible({ timeout: 20000 })
  await plus.click()
  const dlg = composer(page)
  const search = dlg.getByPlaceholder(/search/i).filter({ visible: true }).first()
  await expect(search).toBeVisible({ timeout: 10000 })
  for (const name of names) {
    await search.fill(name)
    await page.waitForTimeout(600)
    await dlg.getByText(name, { exact: true }).filter({ visible: true }).first().click()
    await page.waitForTimeout(400)
  }
}

test.describe("one recipient is a DM, not a group chat", () => {
  let adminId = ""
  let memberId = ""
  let memberName = ""
  let thirdId = ""
  let thirdName = ""
  const madeGroupIds: string[] = []
  let anchorGroupId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    memberName = await sb.memberName()

    const { data: third } = await sb.client
      .from("profiles").select("id, name")
      .eq("ministry_id", sb.ministryId).not("id", "in", `(${adminId},${memberId})`)
      .limit(1).maybeSingle()
    if (third) { thirdId = (third as { id: string }).id; thirdName = (third as { name: string }).name }

    // The General section's "+" only renders when that section already has a room
    // (empty sections are dropped from the list entirely), so seed one to anchor it.
    const { data: anchor } = await sb.client.from("groups").insert({
      name: `${E2E_PREFIX}dmguard anchor`, type: "church", category: "general",
      ministry_id: sb.ministryId, created_by: adminId,
    }).select("id").single()
    if (anchor) {
      anchorGroupId = (anchor as { id: string }).id
      await sb.client.from("group_members").insert({ group_id: anchorGroupId, user_id: adminId })
    }

    // Start from no thread for this pair, so the first test exercises CREATION.
    await sb.client.from("groups").delete()
      .eq("ministry_id", sb.ministryId).eq("type", "dm")
      .eq("dm_key", dmPairKey(adminId, memberId))
  })

  test.afterAll(async () => {
    const sb = sandbox()
    for (const id of [...madeGroupIds, anchorGroupId].filter(Boolean)) {
      await sb.client.from("groups").delete().eq("id", id)
    }
    await sb.client.from("groups").delete()
      .eq("ministry_id", sb.ministryId).eq("type", "dm")
      .eq("dm_key", dmPairKey(adminId, memberId))
  })

  test("Church Chats + with ONE person creates a dm, not a church chat", async ({ page }) => {
    const sb = sandbox()
    const before = await sb.client.from("groups").select("id")
      .eq("ministry_id", sb.ministryId).eq("type", "church")
    const churchBefore = (before.data ?? []).length

    await composeChurchChat(page, [memberName])

    // The button already promised a DM — that promise is now the contract.
    const cta = composer(page).getByRole("button", { name: new RegExp(`^Message ${memberName.split(" ")[0]}`) })
    await expect(cta).toBeVisible({ timeout: 10000 })

    // A DM has no section, so the picker must not be asking for one.
    await expect(composer(page).locator("label", { hasText: /^Section$/ })).toHaveCount(0)

    await cta.click()
    await page.waitForTimeout(2500)

    const { data: dm } = await sb.client.from("groups")
      .select("id, type, category, name_is_generated")
      .eq("ministry_id", sb.ministryId).eq("type", "dm")
      .eq("dm_key", dmPairKey(adminId, memberId)).maybeSingle()

    expect(dm, "a dm row should exist for the admin/member pair").toBeTruthy()
    expect((dm as { type: string }).type).toBe("dm")
    expect((dm as { category: string | null }).category).toBeNull()

    // …and NOTHING was added to the church list.
    const after = await sb.client.from("groups").select("id")
      .eq("ministry_id", sb.ministryId).eq("type", "church")
    expect((after.data ?? []).length, "no church chat should have been created").toBe(churchBefore)

    // A DM is a conversation, not a room someone opened.
    const { data: sys } = await sb.client.from("messages")
      .select("id").eq("group_id", (dm as { id: string }).id).eq("message_type", "system")
    expect((sys ?? []).length, "a DM gets no 'created this chat' system line").toBe(0)
  })

  test("picking the same person again REOPENS the thread instead of forking one", async ({ page }) => {
    const sb = sandbox()
    const first = await sb.client.from("groups").select("id")
      .eq("ministry_id", sb.ministryId).eq("type", "dm")
      .eq("dm_key", dmPairKey(adminId, memberId)).maybeSingle()
    expect(first.data, "previous test should have left a thread").toBeTruthy()

    await composeChurchChat(page, [memberName])
    await composer(page).getByRole("button", { name: new RegExp(`^Message ${memberName.split(" ")[0]}`) }).click()
    await page.waitForTimeout(2500)

    const { data: all } = await sb.client.from("groups").select("id")
      .eq("ministry_id", sb.ministryId).eq("type", "dm")
      .eq("dm_key", dmPairKey(adminId, memberId))
    expect((all ?? []).length, "the pair must have exactly one thread").toBe(1)
    expect((all ?? [])[0].id).toBe((first.data as { id: string }).id)
  })

  test("TWO people still creates a church chat with its section", async ({ page }) => {
    test.skip(!thirdId, "needs a third sandbox profile")
    const sb = sandbox()
    const startedAt = new Date(Date.now() - 5000).toISOString()

    await composeChurchChat(page, [memberName, thirdName])
    // Two recipients — the composer is a group composer again, section and all.
    await expect(composer(page).locator("label", { hasText: /^Section$/ })).toBeVisible()

    // No name typed: with 2+ selected the composer auto-names from first names
    // and only offers an Edit toggle, so this is the DEFAULT path a leader takes.
    await composer(page).getByRole("button", { name: /^Create Chat/ }).click()
    await page.waitForTimeout(2500)

    const { data: grp } = await sb.client.from("groups")
      .select("id, type, category, name_is_generated")
      .eq("ministry_id", sb.ministryId).eq("type", "church")
      .gte("created_at", startedAt)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
    expect(grp, "a church chat should exist").toBeTruthy()
    expect((grp as { type: string }).type).toBe("church")
    expect((grp as { category: string | null }).category).toBe("general")
    madeGroupIds.push((grp as { id: string }).id)
  })
})
