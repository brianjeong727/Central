// Chat avatars — group photo upload + DM partner photo.
//
// First real exercise of groups.avatar_url + get_chat_list/get_chat_previews'
// group_avatar_url/partner_avatar_url columns (migration applied, app code
// never run against it before this pass — see .claude/task-context/chat-avatars).
//
// Covers:
//   1. Admin uploads a photo to a seeded church chat via chat Settings — lands in
//      storage AND groups.avatar_url (read both back from Postgres, not the UI).
//   2. It renders at every chip surface: mobile chat list, chat header, chat
//      Settings hero, chat search, Home recent-chats strip, and the desktop chat
//      list panel.
//   3. It survives a reload (proves it's RPC-sourced, not local state).
//   4. A DM shows the partner's PROFILE photo — and keeps showing it even after
//      groups.avatar_url is planted directly on the DM row (the W1 security
//      boundary documented in app/home/chat-avatar.ts).
//   5. A member-tier user gets NO upload affordance on a church chat.
//   6. "Remove photo": clears groups.avatar_url, falls back to initials at the
//      chat list + header, survives a reload; the control is absent once there
//      is no photo, and absent for a member-tier viewer even while a photo
//      exists.
import { test, expect, type Page, type Locator } from "@playwright/test"
import { sandbox, memberState, E2E_PREFIX } from "./fixtures"

const CHURCH = `${E2E_PREFIX}Avatar Church`
const CHURCH_MSG = "E2E:: avatar test message"
const DM_MSG = "E2E:: hey from third"
const THIRD_EMAIL = "e2e.avatar.third@test.com"
const THIRD_NAME = `${E2E_PREFIX}Avatar Third`

// 1x1 transparent PNG — small, valid, decodable by createImageBitmap (the
// engineer's client-side downscale step requires a real decodable image).
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
)

function vis(page: Page, text: string, exact = false) {
  return page.getByText(text, { exact }).filter({ visible: true }).first()
}

function pocketRow(page: Page, title: string) {
  return page.locator(`[data-pocket-row="${title}"]`).filter({ visible: true }).first()
}

// The label wrapping the hidden file input + MonogramChip in ChatSettings —
// present only when chatCapabilities().canManage is true for the viewer.
function photoLabel(page: Page) {
  return page.locator('label[title="Change chat photo"]').filter({ visible: true }).first()
}

// The ChatScreen top bar — unique class combo (verified against no other match
// in the codebase), scoped further by the header h2's text.
function chatHeaderBar(page: Page, name: string) {
  return page
    .locator("div.flex-shrink-0.flex.items-center.gap-3")
    .filter({ has: page.locator("h2", { hasText: name }) })
    .filter({ visible: true })
    .first()
}

test.describe("chat avatars — group photo + DM partner photo", () => {
  // The shared dev machine runs several sibling test suites concurrently
  // (session-slots.json), so a single Supabase round trip that's normally
  // sub-second can occasionally take several — widen the per-test budget
  // rather than let that read as a product bug.
  test.beforeEach(({}, testInfo) => { testInfo.setTimeout(60_000) })

  let adminId = ""
  let memberId = ""
  let thirdId = ""
  let adminName = ""
  let churchId = ""
  let dmId = ""
  let thirdAvatarUrl = ""
  let churchAvatarUrl = ""
  let churchAvatarStoragePath = ""
  const uploadedStoragePaths: string[] = []

  // Generous — beforeAll makes ~15 sequential round trips (users, groups,
  // members, messages, a storage upload); under a loaded shared dev machine
  // any single one can take several seconds.
  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    const sb = sandbox()
    const db = sb.client
    // Idempotent: a prior run's beforeAll can have created the third user and
    // then failed before afterAll ran. Clear it first so createUser below never
    // hits "user already registered" on a retry.
    {
      const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 })
      const stale = existing.users.find((u) => u.email === THIRD_EMAIL)
      if (stale) {
        await db.from("profiles").delete().eq("id", stale.id)
        await db.auth.admin.deleteUser(stale.id).catch(() => {})
      }
    }
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    adminName = await sb.adminName()

    // ── Church chat, admin + member ──
    await db.from("groups").delete().eq("ministry_id", sb.ministryId).eq("name", CHURCH)
    const { data: church, error: churchErr } = await db
      .from("groups")
      .insert({ ministry_id: sb.ministryId, name: CHURCH, type: "church", category: "general", created_by: adminId })
      .select("id").single()
    if (churchErr) throw churchErr
    churchId = church.id
    await db.from("group_members").insert([
      { group_id: churchId, user_id: adminId },
      { group_id: churchId, user_id: memberId },
    ])
    await sb.insertMessage({ groupId: churchId, senderId: adminId, content: CHURCH_MSG })

    // ── Third person, with a REAL profile photo (a genuine visible image for
    //    the required screenshot, not a broken-image icon) ──
    const { data: created, error: cErr } = await db.auth.admin.createUser({
      email: THIRD_EMAIL, password: "e2e-avatar-third-pw", email_confirm: true,
    })
    if (cErr || !created?.user) throw new Error(`createUser failed: ${cErr?.message}`)
    thirdId = created.user.id
    await db.from("profiles").update({
      ministry_id: sb.ministryId, role: "member", name: THIRD_NAME,
      gender: "female", graduation_year: new Date().getFullYear() + 2,
    }).eq("id", thirdId)

    const thirdPhotoPath = `e2e-avatar-third/${thirdId}.png`
    const { error: upErr } = await db.storage.from("profile-images").upload(thirdPhotoPath, PNG_1PX, {
      contentType: "image/png", upsert: true,
    })
    if (upErr) throw upErr
    uploadedStoragePaths.push(thirdPhotoPath)
    thirdAvatarUrl = db.storage.from("profile-images").getPublicUrl(thirdPhotoPath).data.publicUrl
    await db.from("profiles").update({ avatar_url: thirdAvatarUrl }).eq("id", thirdId)

    // ── DM between admin and third ──
    const dmKey = [adminId, thirdId].sort().join(":")
    await db.from("groups").delete().eq("ministry_id", sb.ministryId).eq("type", "dm").eq("dm_key", dmKey)
    const { data: dm, error: dmErr } = await db
      .from("groups")
      .insert({ ministry_id: sb.ministryId, name: `${E2E_PREFIX}DM Avatar`, type: "dm", created_by: adminId, dm_key: dmKey })
      .select("id").single()
    if (dmErr) throw dmErr
    dmId = dm.id
    await db.from("group_members").insert([
      { group_id: dmId, user_id: adminId },
      { group_id: dmId, user_id: thirdId },
    ])
    await sb.insertMessage({ groupId: dmId, senderId: thirdId, content: DM_MSG })
  })

  test.afterAll(async () => {
    const sb = sandbox()
    const db = sb.client
    // Storage cleanup — profile photo + the uploaded chat photo (path captured
    // mid-run, since its name is timestamp-suffixed and unknown in advance).
    if (churchAvatarStoragePath) uploadedStoragePaths.push(churchAvatarStoragePath)
    if (uploadedStoragePaths.length) {
      await db.storage.from("profile-images").remove(uploadedStoragePaths.filter((p) => p.startsWith("e2e-avatar-third/")))
      const chatAvatarPaths = uploadedStoragePaths.filter((p) => p.startsWith("chat-avatars/"))
      if (chatAvatarPaths.length) await db.storage.from("announcement-images").remove(chatAvatarPaths)
    }
    await db.from("groups").delete().eq("ministry_id", sb.ministryId).eq("name", CHURCH)
    await db.from("groups").delete().eq("ministry_id", sb.ministryId).eq("name", `${E2E_PREFIX}DM Avatar`)
    if (thirdId) {
      await db.from("profiles").delete().eq("id", thirdId)
      await db.auth.admin.deleteUser(thirdId).catch(() => {})
    }
  })

  // ── Member-tier gate: no upload affordance on a church chat ────────────────
  test.describe("as a member", () => {
    test.use({ storageState: memberState })

    test("member-tier user gets no photo-upload affordance in a church chat's settings", async ({ page }) => {
      await page.goto(`/home?tab=chats&chat=${churchId}`)
      await expect(vis(page, CHURCH_MSG)).toBeVisible({ timeout: 15000 })
      await page.locator("h2", { hasText: CHURCH }).filter({ visible: true }).first().click()
      // Settings loaded (the plain, non-uploadable chip is present)…
      await expect(page.locator("h2", { hasText: CHURCH }).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 })
      // …but no upload label anywhere on the settings screen.
      await expect(page.locator('label[title="Change chat photo"]')).toHaveCount(0)
    })
  })

  // ── Admin: upload + render everywhere + survive reload ─────────────────────
  test("admin uploads a church-chat photo: lands in storage + DB, and renders in Settings", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${churchId}`)
    await expect(vis(page, CHURCH_MSG)).toBeVisible({ timeout: 15000 })
    await page.locator("h2", { hasText: CHURCH }).filter({ visible: true }).first().click()

    const label = photoLabel(page)
    await expect(label).toBeVisible({ timeout: 15000 })
    // The persistent camera badge — the judgment call flagged for Brian.
    await expect(label.locator("svg")).toBeVisible()

    await label.locator('input[type="file"]').setInputFiles({
      name: "group-avatar.png", mimeType: "image/png", buffer: PNG_1PX,
    })

    // Renders in the settings hero once the upload completes (optimistic paint
    // first, then the real stored url).
    await expect(label.locator("img")).toBeVisible({ timeout: 15000 })

    // Read back from Postgres directly — never trust the UI.
    const sb = sandbox()
    const db = sb.client
    await expect(async () => {
      const { data } = await db.from("groups").select("avatar_url").eq("id", churchId).single()
      expect(data?.avatar_url).toBeTruthy()
      churchAvatarUrl = data!.avatar_url as string
    }).toPass({ timeout: 10000 })

    const marker = "/object/public/announcement-images/"
    const idx = churchAvatarUrl.indexOf(marker)
    expect(idx, `unexpected avatar_url shape: ${churchAvatarUrl}`).toBeGreaterThan(-1)
    churchAvatarStoragePath = churchAvatarUrl.slice(idx + marker.length)
    expect(churchAvatarStoragePath).toMatch(new RegExp(`^chat-avatars/${sb.ministryId}/${churchId}-`))

    // The object is actually IN storage, not just referenced.
    const { data: dl, error: dlErr } = await db.storage.from("announcement-images").download(churchAvatarStoragePath)
    expect(dlErr).toBeNull()
    expect(dl).toBeTruthy()

    // The settings chip's <img> resolves to THIS chat's photo, not a stray one.
    await expect(label.locator("img")).toHaveAttribute("src", new RegExp(churchId))
  })

  test("the photo renders in the mobile chat list row", async ({ page }) => {
    await page.goto("/home?tab=chats")
    const row = pocketRow(page, CHURCH)
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row.locator("img")).toBeVisible({ timeout: 15000 })
    await expect(row.locator("img")).toHaveAttribute("src", new RegExp(churchId))
  })

  test("the photo renders in the chat header, and survives a reload", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${churchId}`)
    let bar = chatHeaderBar(page, CHURCH)
    await expect(bar).toBeVisible({ timeout: 15000 })
    await expect(bar.locator("img")).toBeVisible({ timeout: 15000 })
    await expect(bar.locator("img")).toHaveAttribute("src", new RegExp(churchId))

    // Reload — this must come from get_chat_list/group-meta (the RPC/DB), not
    // any client-side state left over from the upload.
    await page.reload()
    bar = chatHeaderBar(page, CHURCH)
    await expect(bar).toBeVisible({ timeout: 15000 })
    await expect(bar.locator("img")).toBeVisible({ timeout: 15000 })
    await expect(bar.locator("img")).toHaveAttribute("src", new RegExp(churchId))
  })

  test("the photo renders in chat search results", async ({ page }) => {
    await page.goto("/home?tab=chats")
    const search = page.getByPlaceholder("Search").filter({ visible: true }).first()
    await search.fill(CHURCH)
    const row = pocketRow(page, CHURCH)
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row.locator("img")).toBeVisible({ timeout: 15000 })
    await expect(row.locator("img")).toHaveAttribute("src", new RegExp(churchId))
  })

  test("the photo renders in the Home recent-chats strip", async ({ page }) => {
    const sb = sandbox()
    // Bump recency so the church chat is guaranteed to be among Home's top 2.
    await sb.insertMessage({ groupId: churchId, senderId: adminId, content: "E2E:: avatar bump" })

    await page.goto("/home?tab=home")
    const row = pocketRow(page, CHURCH)
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row.locator("img")).toBeVisible({ timeout: 15000 })
    await expect(row.locator("img")).toHaveAttribute("src", new RegExp(churchId))
  })

  // Desktop chat-list panel. chat-avatars.mobile.spec.ts is filename-locked to
  // the "mobile" project (chromium ignores *.mobile.spec.ts), so this widens the
  // SAME mobile-project page's viewport to 1024px+ instead — lib/breakpoints.ts's
  // DESKTOP_QUERY is `(min-width:768) and (hover:hover OR min-width:1024)`, so a
  // touch-emulated context at 1440 still resolves to the desktop layout (the
  // >=1024 arm is exactly what keeps a touchscreen tablet on desktop today).
  test.describe("desktop chat list panel", () => {
    test.use({ viewport: { width: 1440, height: 900 } })

    test("the photo renders in the desktop ChatListPanel card", async ({ page }) => {
      await page.goto("/home?tab=chats")
      const card = page.locator("button").filter({ hasText: CHURCH }).filter({ visible: true }).first()
      await expect(card).toBeVisible({ timeout: 15000 })
      // Two style divs (mobile/desktop) live inside ONE button (md:hidden /
      // hidden md:flex), each with its own <img> — scope to the visible one.
      const cardImg = card.locator("img").filter({ visible: true }).first()
      await expect(cardImg).toBeVisible({ timeout: 15000 })
      await expect(cardImg).toHaveAttribute("src", new RegExp(churchId))
    })
  })

  // ── DM: partner's photo, and the W1 security boundary ──────────────────────
  test("a DM shows the partner's profile photo, and ignores a directly-written groups.avatar_url", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${dmId}`)
    await expect(vis(page, DM_MSG)).toBeVisible({ timeout: 15000 })

    let bar = chatHeaderBar(page, THIRD_NAME)
    await expect(bar).toBeVisible({ timeout: 15000 })
    await expect(bar.locator("img")).toBeVisible({ timeout: 15000 })
    // The partner's own profile-images photo — not any chat-avatars path.
    await expect(bar.locator("img")).toHaveAttribute("src", /profile-images/)

    // Plant a group photo directly on the DM row (RLS allows either DM
    // participant to write groups.avatar_url even though no UI offers it — see
    // app/home/chat-avatar.ts's W1 note). The UI must keep showing the partner.
    const sb = sandbox()
    const db = sb.client
    expect(churchAvatarUrl, "church photo must already be uploaded by this point in the run").toBeTruthy()
    const { error: plantErr } = await db.from("groups").update({ avatar_url: churchAvatarUrl }).eq("id", dmId)
    expect(plantErr).toBeNull()

    await page.reload()
    bar = chatHeaderBar(page, THIRD_NAME)
    await expect(bar).toBeVisible({ timeout: 15000 })
    await expect(bar.locator("img")).toBeVisible({ timeout: 15000 })
    // STILL the partner's photo — never the planted chat-avatars/<churchId> url.
    await expect(bar.locator("img")).toHaveAttribute("src", /profile-images/)
    await expect(bar.locator("img")).not.toHaveAttribute("src", new RegExp(churchId))

    // Same check in the mobile chat list row (get_chat_list-sourced).
    await page.goto("/home?tab=chats&chats=my")
    const dmName = `${E2E_PREFIX}DM Avatar`
    // The list row's title is derived per-viewer (dm-identity.mobile.spec.ts) —
    // it shows the PARTNER's name, not the stored groups.name.
    const row = pocketRow(page, THIRD_NAME)
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row.locator("img")).toBeVisible({ timeout: 15000 })
    await expect(row.locator("img")).toHaveAttribute("src", /profile-images/)
    await expect(row.locator("img")).not.toHaveAttribute("src", new RegExp(churchId))
    void dmName // referenced for clarity only — the row keys on THIRD_NAME
  })

  // ── Remove-photo path ───────────────────────────────────────────────────────
  // Order matters here and deliberately reuses churchId's live photo state
  // (set by "admin uploads a church-chat photo" above) rather than seeding a
  // fresh chat: the member-tier check runs FIRST, while the chat still has a
  // photo (proving the gate is role-based, not presence-based); the removal
  // test runs second and actually clears it; the no-photo check runs LAST,
  // reusing the now-photo-less churchId instead of a third fixture.
  test.describe("as a member, remove-photo control", () => {
    test.use({ storageState: memberState })

    test("member-tier viewer gets no remove-photo control even though the chat has a photo", async ({ page }) => {
      expect(churchAvatarUrl, "church photo must already be uploaded by this point in the run").toBeTruthy()
      await page.goto(`/home?tab=chats&chat=${churchId}`)
      await expect(vis(page, CHURCH_MSG)).toBeVisible({ timeout: 15000 })
      await page.locator("h2", { hasText: CHURCH }).filter({ visible: true }).first().click()
      await expect(page.locator("h2", { hasText: CHURCH }).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 })
      // Member-tier still can't touch it — same gate as upload (canSetChatPhoto).
      await expect(page.getByRole("button", { name: "Remove photo" })).toHaveCount(0)
    })
  })

  // Runs BEFORE the destructive removal test and deliberately leaves the photo
  // in place: removal is one tap with no confirm, so Undo is the only thing
  // standing between a mis-tap and everyone in the room losing the picture.
  test('"Remove photo" offers an Undo toast that restores the photo in the DB', async ({ page }) => {
    expect(churchAvatarUrl, "church photo must already be uploaded by this point in the run").toBeTruthy()
    await page.goto(`/home?tab=chats&chat=${churchId}`)
    await expect(vis(page, CHURCH_MSG)).toBeVisible({ timeout: 15000 })
    await page.locator("h2", { hasText: CHURCH }).filter({ visible: true }).first().click()

    const label = photoLabel(page)
    await expect(label.locator("img")).toBeVisible({ timeout: 15000 })
    await page.getByRole("button", { name: "Remove photo" }).filter({ visible: true }).first().click()

    // Optimistic removal + the toast in the same frame.
    await expect(label.locator("img")).toHaveCount(0, { timeout: 15000 })
    await expect(page.getByText("Photo removed")).toBeVisible({ timeout: 15000 })

    await page.getByRole("button", { name: "Undo" }).click()

    // The chip paints the photo back…
    await expect(label.locator("img")).toBeVisible({ timeout: 15000 })
    // …and so does Postgres — an Undo that only repaints the client would leave
    // every OTHER member looking at an empty chip.
    const sb = sandbox()
    const db = sb.client
    await expect(async () => {
      const { data } = await db.from("groups").select("avatar_url").eq("id", churchId).single()
      expect(data?.avatar_url).toBe(churchAvatarUrl)
    }).toPass({ timeout: 10000 })
  })

  test('"Remove photo" clears groups.avatar_url, falls back to initials at the chat list + header, and stays removed after a reload', async ({ page }) => {
    expect(churchAvatarUrl, "church photo must already be uploaded by this point in the run").toBeTruthy()
    await page.goto(`/home?tab=chats&chat=${churchId}`)
    await expect(vis(page, CHURCH_MSG)).toBeVisible({ timeout: 15000 })
    await page.locator("h2", { hasText: CHURCH }).filter({ visible: true }).first().click()

    const label = photoLabel(page)
    await expect(label).toBeVisible({ timeout: 15000 })
    await expect(label.locator("img")).toBeVisible({ timeout: 15000 })

    const removeBtn = page.getByRole("button", { name: "Remove photo" }).filter({ visible: true }).first()
    await expect(removeBtn).toBeVisible({ timeout: 15000 })
    await removeBtn.click()

    // Optimistic: the settings hero chip drops its <img> immediately (falls
    // back to the plum/initials MonogramChip render — see MonogramChip.tsx).
    await expect(label.locator("img")).toHaveCount(0, { timeout: 15000 })
    // The "Remove photo" control itself disappears once there's nothing to remove.
    await expect(page.getByRole("button", { name: "Remove photo" })).toHaveCount(0)

    // Read back from Postgres directly — never trust the UI.
    const sb = sandbox()
    const db = sb.client
    await expect(async () => {
      const { data } = await db.from("groups").select("avatar_url").eq("id", churchId).single()
      expect(data?.avatar_url).toBeNull()
    }).toPass({ timeout: 10000 })

    // Mobile chat list row falls back to initials (no <img> at all).
    await page.goto("/home?tab=chats")
    const row = pocketRow(page, CHURCH)
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row.locator("img")).toHaveCount(0)

    // Chat header falls back to initials.
    await page.goto(`/home?tab=chats&chat=${churchId}`)
    let bar = chatHeaderBar(page, CHURCH)
    await expect(bar).toBeVisible({ timeout: 15000 })
    await expect(bar.locator("img")).toHaveCount(0)

    // Survives a reload — sourced from get_chat_list/group-meta, not local state.
    await page.reload()
    bar = chatHeaderBar(page, CHURCH)
    await expect(bar).toBeVisible({ timeout: 15000 })
    await expect(bar.locator("img")).toHaveCount(0)
  })

  test("the remove-photo control is absent once the chat has no photo", async ({ page }) => {
    // Depends on the removal test above having already cleared churchId's photo.
    await page.goto(`/home?tab=chats&chat=${churchId}`)
    await expect(vis(page, CHURCH_MSG)).toBeVisible({ timeout: 15000 })
    await page.locator("h2", { hasText: CHURCH }).filter({ visible: true }).first().click()
    await expect(page.locator("h2", { hasText: CHURCH }).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 })
    // The upload label is still offered (canSetChatPhoto is unchanged)…
    await expect(photoLabel(page)).toBeVisible({ timeout: 15000 })
    // …but there is nothing to remove.
    await expect(page.getByRole("button", { name: "Remove photo" })).toHaveCount(0)
  })
})
