// Regression pin: a nickname must never replace a person's photo with a
// monogram of the NICKNAME's initials.
//
// Root cause (fixed in app/home/tabs/chats-tab.tsx): the transcript resolved a
// message's display NAME through the nickname-aware ["chat-roster", groupId]
// SWR but left sender_avatar_url on whatever the message row already carried.
// A message arriving over REALTIME for a sender who is first-seen in this
// render session carries a null avatar (the INSERT handler back-filled only
// the name from `profiles`, never `avatar_url`), so the row fell back to
// initials — of the nickname, since that half DID resolve. The fix resolves
// name and avatar together from the same roster row.
//
// Why "first message, before any earlier one" matters: any EARLIER message
// from the same sender (loaded on initial fetch, which always live-joins
// profiles.avatar_url) already warms the per-sender avatar cache the realtime
// path reads as a fallback — masking the bug for every message after the
// first. So this spec deliberately nicknames someone BEFORE their first-ever
// message in the room, then sends that first message live (a direct DB
// insert, mid-test, while the page is open and subscribed).
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const SHOT_DIR = process.env.NICK_AV_SHOT_DIR
const NICK = "Photobooth Pat"
const REALTIME_MSG = "hi from the realtime path"
const LEFT_MSG = "seed before I leave the chat"
const THIRD_EMAIL = "e2e.nickavatar.third@test.com"
const THIRD_NAME = `${E2E_PREFIX}Nick Avatar Third`

// A small, VISIBLY distinct 64x64 photo (an orange square with a simple
// face) rather than a 1x1 transparent pixel — the pin here is that a real
// photo renders, and the final screenshots are read by a human, so the
// avatar has to actually be visible content, not an invisible img tag a
// transparent pixel would make indistinguishable from initials at a glance.
const PNG_PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAABdUlEQVR4nOWZYXaDIBCEJ/M8VjlVrlFOxcHa99qmj1i1sLtRRr9/Mcsyw4Kg3j7e36AMIQ4hDiEOIQ4hDiEOIQ4hDiHO9JKs97L6V04DG7iXjpggJ9N+0heb5DTAGjCoD2kbY8CtAL4MPFi9Ow+PV+/LxiHUO3JyFPXWzBxIvSm//FGCYw1/fy+RR4mUfrbVUoonposYA7+y6p8ziS0xL55C+8yfzr4CFvFsaBevt8TYuNpd6JQGyspCrK+3xFy0AlNIlu+B3L7Ht8QYiNzIWjRF6T7PFGJHbPQbkZC+LlWBMxjIu8yi3NHL1SqAheFJXxj6Xm7YWWRTBao+/MfJVGfon6I3+3fix5G9VtC4Ty03yZaxcBhY8TCXVbEVlo2V9BnY9PAvfvURBp4f/xptPNUnu1ZRhIE/j7AbNuZTK3vvAUEGDE/9Y32hmWlS/UZ2xLmVEIcQhxCHEIcQhxCHEIcQhxCHEIcQhxCHEIcQhxCHRwvw8gnXZ4L1bUS4sAAAAABJRU5ErkJggg==",
  "base64",
)

function vis(page: Page, text: string, exact = false) {
  return page.getByText(text, { exact }).filter({ visible: true }).first()
}

async function openMemberList(page: Page) {
  const members = page.getByText("Members", { exact: true }).filter({ visible: true }).first()
  await members.waitFor({ state: "visible", timeout: 15000 })
  await members.click()
}

function pencilFor(page: Page, name: string) {
  return page.locator(`button[aria-label="Set nickname for ${name}"]`).filter({ visible: true })
}

// The Settings > Members row (mobile: "flex items-center gap-3"), located via
// the pencil's aria-label rather than the row's own (unstable) class list.
function memberRowContainer(page: Page, name: string) {
  return page
    .locator(`xpath=//button[@aria-label="Set nickname for ${name}"]/ancestor::div[contains(concat(" ", normalize-space(@class), " "), " items-center ") and contains(concat(" ", normalize-space(@class), " "), " gap-3 ")][1]`)
    .filter({ visible: true })
    .first()
}

// The message row's avatar chip, located via the swipe/reply anchor
// data-message-bubble (message-row.tsx) rather than any text, so it survives
// a nickname/real-name text swap. Two ancestor divs up from the bubble is the
// "Avatar + bubble row" flex container the avatar chip is a sibling inside.
function messageAvatarChip(page: Page, messageId: string) {
  return page
    .locator(`xpath=//div[@data-message-bubble="${messageId}"]/ancestor::div[contains(concat(" ", normalize-space(@class), " "), " items-end ")][1]//div[@data-monogram]`)
    .filter({ visible: true })
    .first()
}

test.describe("nickname + realtime avatar (photo must survive a nickname)", () => {
  test.beforeEach(({}, testInfo) => { testInfo.setTimeout(60_000) })

  let adminId = ""
  let thirdId = ""
  let thirdAvatarUrl = ""
  let chatId = ""
  let chatId2 = ""
  let realtimeMsgId = ""
  const uploadedStoragePaths: string[] = []

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000)
    const sb = sandbox()
    const db = sb.client
    // Idempotent — a prior failed run can leave the third user behind.
    {
      const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 })
      const stale = existing.users.find((u) => u.email === THIRD_EMAIL)
      if (stale) {
        await db.from("profiles").delete().eq("id", stale.id)
        await db.auth.admin.deleteUser(stale.id).catch(() => {})
      }
    }
    adminId = await sb.adminUserId()

    const { data: created, error: cErr } = await db.auth.admin.createUser({
      email: THIRD_EMAIL, password: "e2e-nickavatar-third-pw", email_confirm: true,
    })
    if (cErr || !created?.user) throw new Error(`createUser failed: ${cErr?.message}`)
    thirdId = created.user.id
    await db.from("profiles").update({
      ministry_id: sb.ministryId, role: "member", name: THIRD_NAME,
      gender: "female", graduation_year: new Date().getFullYear() + 2,
    }).eq("id", thirdId)

    const photoPath = `e2e-nickavatar-third/${thirdId}.png`
    const { error: upErr } = await db.storage.from("profile-images").upload(photoPath, PNG_PHOTO, {
      contentType: "image/png", upsert: true,
    })
    if (upErr) throw upErr
    uploadedStoragePaths.push(photoPath)
    thirdAvatarUrl = db.storage.from("profile-images").getPublicUrl(photoPath).data.publicUrl
    await db.from("profiles").update({ avatar_url: thirdAvatarUrl }).eq("id", thirdId)

    const my = await sb.createGroup({ name: "Nick Avatar Group", memberIds: [adminId, thirdId] })
    chatId = my.id
    // Deliberately NO seeded message from third yet — see header comment.

    // A SECOND, separate room for the desktop pass. The mobile tests above
    // leave message history from third sitting in `chatId` by the time the
    // desktop test runs — a fresh page load would then warm the avatar cache
    // from THAT history before the "live" message ever arrives, which would
    // make the desktop test pass even on the buggy code. A clean room keeps
    // it a true first-message-over-realtime repro.
    const my2 = await sb.createGroup({ name: "Nick Avatar Group Desktop", memberIds: [adminId, thirdId] })
    chatId2 = my2.id
  })

  test.afterAll(async () => {
    const sb = sandbox()
    const db = sb.client
    if (uploadedStoragePaths.length) await db.storage.from("profile-images").remove(uploadedStoragePaths)
    await sb.deleteGroupsByPrefix()
    if (thirdId) {
      await db.from("profiles").delete().eq("id", thirdId)
      await db.auth.admin.deleteUser(thirdId).catch(() => {})
    }
  })

  test("baseline: the person's photo shows in the member list before any nickname exists", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${chatId}`)
    await expect(page.locator("h2").filter({ visible: true }).first()).toBeVisible({ timeout: 15000 })
    await page.locator("h2").filter({ visible: true }).first().click()
    await openMemberList(page)
    const pencil = pencilFor(page, THIRD_NAME)
    await expect(pencil).toBeVisible({ timeout: 10000 })
    const rowContainer = memberRowContainer(page, THIRD_NAME)
    await expect(rowContainer.locator("img")).toBeVisible({ timeout: 10000 })
  })

  test("set a nickname BEFORE the person's first message, then their first message arrives live with the photo intact", async ({ page }) => {
    const sb = sandbox()
    const db = sb.client

    // Nickname set directly against Postgres (not through the Settings UI) —
    // the UI round trip otherwise gives the roster fetch below such a head
    // start that it always resolves before the realtime message could ever
    // arrive, which is exactly why the race below has to be forced rather
    // than timed (see the route handler).
    const { error: nickErr } = await db
      .from("chat_nicknames")
      .insert({ group_id: chatId, target_user_id: thirdId, ministry_id: sb.ministryId, nickname: NICK, set_by: adminId })
    expect(nickErr).toBeNull()

    // Deterministically force the race the bug depends on: hold the
    // ["chat-roster", groupId] fetch (the group_members+profiles query this
    // is unique for, by its `last_read_at` column — no other query on this
    // page selects that column) open until AFTER the realtime message has
    // already rendered once. A local Supabase round trip for the roster is
    // reliably FASTER than a DB insert + realtime propagation back to the
    // browser, so without forcing it the roster always wins and the bug
    // never reproduces in a deterministic test.
    let releaseRoster: () => void = () => {}
    const rosterHeld = new Promise<void>((resolve) => { releaseRoster = resolve })
    // Only the FIRST matching request is held — dev-mode can fire a second,
    // duplicate roster fetch, and awaiting the same promise twice races two
    // route.continue() calls against each other (Playwright errors on a
    // route handled twice). Every request after the first just passes through.
    let firstHeld = false
    await page.route("**/rest/v1/group_members*", async (route) => {
      if (!firstHeld && route.request().url().includes("last_read_at")) {
        firstHeld = true
        await rosterHeld
      }
      await route.continue()
    })

    await page.goto(`/home?tab=chats&chat=${chatId}`)
    await expect(page.locator("h2").filter({ visible: true }).first()).toBeVisible({ timeout: 15000 })

    // The realtime path, while the roster fetch is still held back — this is
    // third's FIRST-EVER message in this room, so nothing else has warmed
    // any per-sender cache yet either.
    const msg = await sb.insertMessage({ groupId: chatId, senderId: thirdId, content: REALTIME_MSG })
    realtimeMsgId = msg.id as string
    await expect(vis(page, REALTIME_MSG)).toBeVisible({ timeout: 15000 })

    // Right now, with the roster still held, the sender's identity can only
    // come from what the realtime INSERT handler itself resolved — this is
    // the exact moment the bug lived in. The name isn't nickname-aware yet
    // either (that also depends on the roster), so it still reads the real
    // name; the avatar is the tell.
    const chipBeforeRelease = messageAvatarChip(page, realtimeMsgId)
    await expect(chipBeforeRelease).toBeVisible({ timeout: 10000 })
    await expect(chipBeforeRelease.locator("img")).toBeVisible({ timeout: 10000 })

    // Now let the roster resolve — the nickname takes over the sender label.
    // (No unroute(): the pattern's single held request is still in-flight
    // resolving its own route.continue() — removing the handler mid-flight
    // races Playwright's internal route bookkeeping. Every later request
    // already passes straight through via the firstHeld guard above.)
    releaseRoster()
    await expect(vis(page, NICK)).toBeVisible({ timeout: 10000 })

    // The photo must STILL be there — the historical bug is precisely a
    // renamed row (nickname now showing) whose avatar never got corrected.
    // MonogramChip renders either an <img> or bare initials text, never
    // both, so an <img> here is conclusive: the nickname's initials did not
    // take over the chip.
    const chip = messageAvatarChip(page, realtimeMsgId)
    await expect(chip).toBeVisible({ timeout: 10000 })
    await expect(chip.locator("img")).toBeVisible({ timeout: 10000 })

    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/nickname-realtime-390.png` })
  })

  test("clearing the nickname reverts the name and keeps the photo", async ({ page }) => {
    test.skip(!realtimeMsgId, "depends on the previous test's realtime message")
    await page.goto(`/home?tab=chats&chat=${chatId}`)
    await expect(vis(page, REALTIME_MSG)).toBeVisible({ timeout: 15000 })

    await page.locator("h2").filter({ visible: true }).first().click()
    await openMemberList(page)
    await pencilFor(page, THIRD_NAME).click()
    await page.getByRole("button", { name: "Remove", exact: true }).click()
    await expect(vis(page, THIRD_NAME)).toBeVisible({ timeout: 10000 })

    await page.goto(`/home?tab=chats&chat=${chatId}`)
    await expect(vis(page, REALTIME_MSG)).toBeVisible({ timeout: 15000 })
    // Name reverted to the real name...
    await expect(vis(page, THIRD_NAME)).toBeVisible({ timeout: 10000 })
    // ...and the photo is still there, unchanged.
    const chip = messageAvatarChip(page, realtimeMsgId)
    await expect(chip).toBeVisible({ timeout: 10000 })
    await expect(chip.locator("img")).toBeVisible({ timeout: 10000 })
  })

  test("a sender who has left the chat keeps their old message's stored name and photo", async ({ page }) => {
    const sb = sandbox()
    const db = sb.client
    // Seed a message via the initial-fetch path (not realtime) before removing
    // third from the room, exactly like a real "they left after messaging" case.
    await sb.insertMessage({ groupId: chatId, senderId: thirdId, content: LEFT_MSG })
    await db.from("group_members").delete().eq("group_id", chatId).eq("user_id", thirdId)

    await page.goto(`/home?tab=chats&chat=${chatId}`)
    await expect(vis(page, LEFT_MSG)).toBeVisible({ timeout: 15000 })
    // The old message is not blanked or nulled out — it keeps whatever it
    // already resolved to (real name; nickname was cleared in the prior test).
    await expect(vis(page, THIRD_NAME)).toBeVisible({ timeout: 10000 })
  })

  test.describe("desktop viewport", () => {
    test.use({ viewport: { width: 1440, height: 900 } })

    test("nicknamed realtime message with photo intact — desktop", async ({ page }) => {
      const sb = sandbox()
      const db = sb.client
      const desktopMsgContent = "hi from the desktop realtime path"

      // Nickname set directly (see the mobile test above for why the UI path
      // is avoided) on this fresh room, before third's first message in it.
      const { error: nickErr } = await db
        .from("chat_nicknames")
        .insert({ group_id: chatId2, target_user_id: thirdId, ministry_id: sb.ministryId, nickname: NICK, set_by: adminId })
      expect(nickErr).toBeNull()

      await page.goto(`/home?tab=chats&chat=${chatId2}`)
      await expect(page.locator("h2").filter({ visible: true }).first()).toBeVisible({ timeout: 15000 })

      const msg = await sb.insertMessage({ groupId: chatId2, senderId: thirdId, content: desktopMsgContent })
      await expect(vis(page, desktopMsgContent)).toBeVisible({ timeout: 15000 })
      await expect(vis(page, NICK)).toBeVisible({ timeout: 10000 })

      const chip = messageAvatarChip(page, msg.id as string)
      await expect(chip).toBeVisible({ timeout: 10000 })
      await expect(chip.locator("img")).toBeVisible({ timeout: 10000 })

      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/nickname-realtime-1440.png` })
    })
  })
})
