import { test, expect, type Page, type Locator } from "@playwright/test"
import { sandbox, memberState } from "./fixtures"

// App Store compliance milestone (commit bf28093 — §1.2 UGC report/block, §5.1.1
// privacy, §1.5 support, §3.2.2 Give de-risk). Permanent regression spec.
//
// Data hygiene: every arranged row is scoped to the E2E sandbox ministry. Chat
// fixtures use the sandbox() helpers (E2E:: group name → cascade delete). The
// content_reports / user_blocks tables have no fixture helper, so this spec
// writes/reads them through sandbox().client and hard-scopes every delete to the
// sandbox ministry id. afterAll wipes both tables for the sandbox ministry (all
// rows there are test data) plus any E2E:: group.

const SIGNED_OUT = { cookies: [], origins: [] }
const M = { width: 390, height: 844 }
const D = { width: 1440, height: 900 }

// Benign console noise that is not a regression signal.
const NOISE = [/Download the React DevTools/i, /ResizeObserver loop/i, /favicon/i]
function watchConsole(page: Page) {
  const errors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() !== "error") return
    const t = msg.text()
    if (NOISE.some((re) => re.test(t))) return
    errors.push(`console: ${t}`)
  })
  page.on("pageerror", (err) => {
    if (NOISE.some((re) => re.test(err.message))) return
    errors.push(`pageerror: ${err.message}`)
  })
  return errors
}

// Long-press a chat message bubble to open its context menu (Convention #7:
// ≥400ms = context menu). Holds the pointer down, waits for a menu item to
// appear, then releases.
async function longPress(page: Page, target: Locator, appears: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error("longPress: target has no bounding box")
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await expect(appears).toBeVisible({ timeout: 3000 })
  await page.mouse.up()
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Public pages — /privacy + /support (signed out, mobile)
// ────────────────────────────────────────────────────────────────────────────
test.describe("compliance §5.1.1/§1.5 — public pages (signed out, mobile)", () => {
  test.use({ viewport: M, storageState: SIGNED_OUT })

  test("1a. /privacy loads (200) with support email + Former-member retention line", async ({ page }) => {
    const errors = watchConsole(page)
    const resp = await page.goto("/privacy")
    expect(resp?.status(), "privacy HTTP status").toBe(200)
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible()
    await expect(page.getByText("team@joincentral.app").first()).toBeVisible()
    await expect(page.getByText(/Former member/)).toBeVisible()
    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })

  test("1b. /support loads (200) with support email", async ({ page }) => {
    const errors = watchConsole(page)
    const resp = await page.goto("/support")
    expect(resp?.status(), "support HTTP status").toBe(200)
    await expect(page.getByRole("heading", { name: "Contact the Central team" })).toBeVisible()
    await expect(page.getByText("team@joincentral.app").first()).toBeVisible()
    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 2. Privacy link on signup + Privacy/Support in landing footer (signed out, desktop)
// ────────────────────────────────────────────────────────────────────────────
test.describe("compliance §5.1.1 — links (signed out, desktop)", () => {
  test.use({ viewport: D, storageState: SIGNED_OUT })

  test("2a. signup page shows a Privacy Policy link → /privacy", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto("/signup")
    // /signup opens on the role-choice screen; the Privacy note lives on the form.
    await page.getByText("Join a ministry").click()
    const link = page.getByRole("link", { name: "Privacy Policy" }).first()
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute("href", "/privacy")
    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })

  test("2b. landing footer has Privacy + Support links", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto("/")
    const privacy = page.locator('footer a[href="/privacy"]')
    const support = page.locator('footer a[href="/support"]')
    await expect(privacy).toBeVisible()
    await expect(support).toBeVisible()
    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 3 + 5. Member perspective (mobile): report a message, block a user
// ────────────────────────────────────────────────────────────────────────────
test.describe("compliance §1.2 — member: report + block (mobile)", () => {
  test.use({ viewport: M, storageState: memberState })

  const MSG = "E2E:: reportable message from admin"
  let groupId = ""
  let adminId = ""
  let memberId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    // Group with both users; admin authors the message the member will report/see.
    const grp = await sb.createGroup({ name: "UGC report chat", memberIds: [memberId, adminId] })
    groupId = grp.id
    await sb.insertMessage({ groupId, senderId: adminId, content: MSG })
    // Clean any stale UGC rows in the sandbox before we start.
    await sb.client.from("content_reports").delete().eq("ministry_id", sb.ministryId)
    await sb.client.from("user_blocks").delete().eq("ministry_id", sb.ministryId)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.client.from("content_reports").delete().eq("ministry_id", sb.ministryId)
    await sb.client.from("user_blocks").delete().eq("ministry_id", sb.ministryId)
    await sb.deleteGroupsByPrefix()
  })

  test("3. long-press another user's message → Report → content_reports row written", async ({ page }) => {
    const errors = watchConsole(page)
    const sb = sandbox()
    await page.goto(`/home?tab=chats&chat=${groupId}`)

    const bubble = page.getByText(MSG, { exact: true })
    await expect(bubble).toBeVisible({ timeout: 20000 })

    // Long-press opens the message context menu; "Report" appears for others' msgs.
    const reportItem = page.getByRole("button", { name: "Report", exact: true })
    await longPress(page, bubble, reportItem)
    await reportItem.click()

    // Report modal → pick reason → submit.
    await expect(page.getByRole("heading", { name: "Report content" })).toBeVisible()
    await page.getByText("Inappropriate content").click()
    await page.getByRole("button", { name: "Report", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Report received" })).toBeVisible()

    // Verify the row via the service client (poll — write is fire-then-confirm).
    await expect
      .poll(async () => {
        const { data } = await sb.client
          .from("content_reports")
          .select("reporter_id, reported_user_id, target_type, ministry_id, reason")
          .eq("ministry_id", sb.ministryId)
        return data?.length ?? 0
      }, { timeout: 8000 })
      .toBe(1)

    const { data } = await sb.client
      .from("content_reports")
      .select("reporter_id, reported_user_id, target_type, ministry_id, reason")
      .eq("ministry_id", sb.ministryId)
    const row = data![0]
    expect(row.reporter_id, "reporter is the member").toBe(memberId)
    expect(row.reported_user_id, "reported is the admin (sender)").toBe(adminId)
    expect(row.target_type).toBe("message")
    expect(row.ministry_id).toBe(sb.ministryId)
    expect(row.reason).toBe("inappropriate")

    // Cleanup this report so item 5's assertions start clean.
    await sb.client.from("content_reports").delete().eq("ministry_id", sb.ministryId)
    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })

  test("5. block a user → row written, msgs hidden, create-chat disabled, profile lists + unblock", async ({ page }) => {
    const errors = watchConsole(page)
    const sb = sandbox()

    // Precondition: admin message visible in the chat before blocking.
    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await expect(page.getByText(MSG, { exact: true })).toBeVisible({ timeout: 20000 })

    // Block via the directory member kebab.
    await page.goto("/home?tab=directory")
    await page.getByPlaceholder("Search members…").fill("E2E Admin 2")
    const memberRow = page.getByRole("button", { name: /E2E Admin 2/ })
    await memberRow.first().click()
    await page.getByRole("button", { name: "Member actions" }).click()
    await page.getByRole("button", { name: "Block", exact: true }).click()

    // user_blocks row exists.
    await expect
      .poll(async () => {
        const { data } = await sb.client
          .from("user_blocks")
          .select("blocker_id, blocked_id, ministry_id")
          .eq("ministry_id", sb.ministryId)
        return data?.length ?? 0
      }, { timeout: 8000 })
      .toBe(1)
    const { data: blocks } = await sb.client
      .from("user_blocks")
      .select("blocker_id, blocked_id, ministry_id")
      .eq("ministry_id", sb.ministryId)
    expect(blocks![0].blocker_id).toBe(memberId)
    expect(blocks![0].blocked_id).toBe(adminId)

    // Blocked sender's messages disappear from the chat (fresh ChatScreen mount).
    await page.goto(`/home?tab=chats&chat=${groupId}`)
    // The chat itself loads; the blocked admin's message must NOT render.
    await expect(page.getByText(MSG, { exact: true })).toHaveCount(0, { timeout: 15000 })

    // CreateChatScreen shows the blocked member disabled. Open a new (My) chat.
    await page.goto("/home?tab=chats&chats=my")
    await page.getByRole("button", { name: "New chat" }).click()
    await expect(page.getByRole("heading", { name: "New Chat" })).toBeVisible()
    await page.getByPlaceholder("Search members…").fill("E2E Admin 2")
    // Scope to the create-chat member row via the "Blocked" label (the only place
    // that text appears here) — the background chat list also has E2E Admin 2 buttons.
    const blockedRow = page.locator('button:has-text("E2E Admin 2")').filter({ hasText: "Blocked" })
    await expect(blockedRow).toBeVisible({ timeout: 8000 })
    await expect(blockedRow).toBeDisabled()

    // Profile → Blocked users lists the admin; Unblock removes the row.
    await page.goto("/home?tab=profile")
    const blockedToggle = page.getByRole("button", { name: /Blocked users/ })
    await expect(blockedToggle).toBeVisible({ timeout: 15000 })
    await blockedToggle.click()
    await expect(page.getByText("E2E Admin 2")).toBeVisible()
    await page.getByRole("button", { name: "Unblock" }).first().click()

    await expect
      .poll(async () => {
        const { data } = await sb.client
          .from("user_blocks")
          .select("blocker_id")
          .eq("ministry_id", sb.ministryId)
        return data?.length ?? 0
      }, { timeout: 8000 })
      .toBe(0)

    // Messages reappear after unblock.
    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await expect(page.getByText(MSG, { exact: true })).toBeVisible({ timeout: 20000 })

    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 4. Admin Reports inbox (mobile)
// ────────────────────────────────────────────────────────────────────────────
test.describe("compliance §1.2 — admin Reports inbox (mobile)", () => {
  test.use({ viewport: M }) // default admin storageState

  let reportId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const memberId = await sb.memberUserId()
    await sb.client.from("content_reports").delete().eq("ministry_id", sb.ministryId)
    const { data, error } = await sb.client
      .from("content_reports")
      .insert({
        ministry_id: sb.ministryId,
        reporter_id: memberId,
        target_type: "profile",
        target_id: adminId,
        reported_user_id: adminId,
        reason: "harassment",
        status: "open",
      })
      .select("id")
      .single()
    if (error) throw error
    reportId = data.id
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.client.from("content_reports").delete().eq("ministry_id", sb.ministryId)
  })

  test("4. Reports sub-tab lists the open report; Mark reviewed updates status", async ({ page }) => {
    const errors = watchConsole(page)
    const sb = sandbox()
    await page.goto("/home?tab=settings&stab=reports")

    await expect(page.getByRole("heading", { name: "Reports" }).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("Harassment or bullying")).toBeVisible({ timeout: 10000 })
    await page.getByRole("button", { name: "Mark reviewed" }).first().click()

    await expect
      .poll(async () => {
        const { data } = await sb.client
          .from("content_reports")
          .select("status")
          .eq("id", reportId)
          .maybeSingle()
        return data?.status ?? "?"
      }, { timeout: 8000 })
      .toBe("reviewed")

    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 6 + 7 + 8. Admin surfaces (mobile): Give, Profile switch-ministry, Create-chat
// ────────────────────────────────────────────────────────────────────────────
test.describe("compliance — admin surfaces (mobile)", () => {
  test.use({ viewport: M }) // default admin storageState

  let createdGiving = false

  test.beforeAll(async () => {
    const sb = sandbox()
    const { data: existing } = await sb.client
      .from("ministry_giving")
      .select("ministry_id")
      .eq("ministry_id", sb.ministryId)
      .maybeSingle()
    if (!existing) {
      const adminId = await sb.adminUserId()
      const { error } = await sb.client.from("ministry_giving").insert({
        ministry_id: sb.ministryId,
        zelle_info: "e2e-giving@test.com",
        zelle_name: "E2E Sandbox Ministry",
        updated_by: adminId,
      })
      if (error) throw error
      createdGiving = true
    }
  })

  test.afterAll(async () => {
    if (!createdGiving) return
    const sb = sandbox()
    await sb.client.from("ministry_giving").delete().eq("ministry_id", sb.ministryId)
  })

  test("6. Give page: no preset amount chips; Zelle info + copy present", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto("/home?tab=give")

    await expect(page.getByRole("button", { name: /Open Zelle/ })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole("button", { name: /Copy info/ })).toBeVisible()
    // Old preset chips must be gone.
    for (const v of ["$10", "$25", "$50", "$100", "$250"]) {
      await expect(page.getByRole("button", { name: v, exact: true })).toHaveCount(0)
    }
    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })

  test("7. Profile: Switch ministry row → /ministries", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto("/home?tab=profile")
    const row = page.getByRole("link", { name: "Switch ministry" })
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row).toHaveAttribute("href", "/ministries")
    await row.click()
    await page.waitForURL(/\/ministries/, { timeout: 15000 })
    await expect(page).toHaveURL(/\/ministries/)
    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })

  test("8. Create church chat (mobile restyle): pills, name, search, list, create pill", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto("/home?tab=chats")
    await page.getByRole("button", { name: "New chat" }).click()

    await expect(page.getByRole("heading", { name: "New Church Chat" })).toBeVisible({ timeout: 10000 })
    // Section pills.
    for (const label of ["General", "Groups", "Teams"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible()
    }
    // Name field, search, member list, create pill.
    await expect(page.getByPlaceholder(/e\.g\./)).toBeVisible() // chat-name input
    await expect(page.getByPlaceholder("Search members…")).toBeVisible()
    await expect(page.getByRole("button", { name: /E2E (Admin|Member) 2/ }).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button", { name: /Create Chat/ })).toBeVisible()
    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 9. Desktop spot-check (1440): Reports tab, directory kebab Report/Block
// ────────────────────────────────────────────────────────────────────────────
test.describe("compliance — desktop spot-check (1440)", () => {
  test.use({ viewport: D }) // default admin storageState

  test("9a. Settings Reports tab renders on desktop", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto("/home?tab=settings&stab=reports")
    await expect(page.getByRole("heading", { name: "Reports" }).first()).toBeVisible({ timeout: 15000 })
    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })

  test("9b. Directory detail kebab exposes Report + Block; no mobile tree", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto("/home?tab=directory")
    // Select another member in the desktop list panel.
    const listItem = page.getByRole("button", { name: /E2E Member 2/ }).first()
    await expect(listItem).toBeVisible({ timeout: 15000 })
    await listItem.click()
    await page.getByRole("button", { name: "Member actions" }).click()
    await expect(page.getByRole("button", { name: "Report", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Block", exact: true })).toBeVisible()
    // No mobile-only directory tree leaking at desktop width.
    await expect(page.getByPlaceholder("Search members…")).not.toBeVisible()
    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })
})
