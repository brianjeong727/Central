import { test, expect, request } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

// Regression + click-through for Web Push v1 (feat/web-push, commit 19616b4):
//  - Chats-tab PushSubscribeCard enable flow
//  - /api/push/dispatch auth gate
//  - /api/push/dispatch recipient resolution (dryRun) for messages + announcements
//
// Headless-Chromium caveat (documented, not a bug): Chrome does not support the
// Push API in incognito/automation contexts (crbug.com/41124656) and Playwright's
// Notification.permission is pinned "denied" outside of an explicit CDP grant. So
// a REAL end-to-end pushManager.subscribe() cannot complete in this harness. This
// spec (a) proves the card's gating + enable-click UI behavior with the browser
// permission mocked to "default"/"granted" via addInitScript, and (b) falls back
// to a service-client-arranged push_subscriptions row (fake endpoint) — exactly
// the fallback path called out in architecture.md's e2e section — to unblock the
// dispatch-route assertions that don't require a live browser subscription.

const GROUP_PREFIX = `${E2E_PREFIX}push-test-group `
const ANN_PREFIX = `${E2E_PREFIX}push-test-ann `

test.describe.serial("Web push v1", () => {
  let adminId: string
  let memberId: string
  const dispatchUrl = "http://localhost:3001/api/push/dispatch"

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    await sb.deletePushSubscriptionsForUser(adminId)
    await sb.resetNotificationSettings(adminId)
    await sb.deleteGroupsByPrefix(GROUP_PREFIX)
    await sb.deleteAnnouncementsByPrefix(ANN_PREFIX)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.deletePushSubscriptionsForUser(adminId)
    await sb.resetNotificationSettings(adminId)
    await sb.deleteGroupsByPrefix(GROUP_PREFIX)
    await sb.deleteAnnouncementsByPrefix(ANN_PREFIX)
  })

  // ── (a) Chats-tab subscribe card ────────────────────────────────────────
  test.describe("subscribe card", () => {
    test.use({ storageState: "e2e/.auth/admin.json" })

    test("real headless permission is denied, so the card correctly stays hidden", async ({ page }) => {
      await page.goto("/home?tab=chats")
      // Give the code-split ChatListPanel time to mount.
      await page.waitForTimeout(2000)
      await expect(page.getByRole("button", { name: "Turn on notifications" })).toHaveCount(0)
    })

    test("with permission mocked to 'default', the card renders and a failed enable recovers (idle button + inline error), not a stuck state", async ({ page }) => {
      // Mock the browser Notification API the way a real un-decided browser would
      // report it (headless Chromium always reports "denied" — see file header).
      await page.addInitScript(() => {
        Object.defineProperty(Notification, "permission", { value: "default", configurable: true })
        Notification.requestPermission = async () => {
          Object.defineProperty(Notification, "permission", { value: "granted", configurable: true })
          return "granted" as NotificationPermission
        }
      })
      await page.goto("/home?tab=chats")

      const enableBtn = page.getByRole("button", { name: "Turn on notifications" })
      await expect(enableBtn).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText("Get notified about messages and announcements").first()).toBeVisible()

      await enableBtn.click()

      // reg.pushManager.subscribe() rejects in this Chromium/incognito context
      // ("Registration failed - permission denied", crbug.com/41124656). FIXED:
      // subscribeToPush() now wraps every failure path in try/catch and returns a
      // discriminated result, so handleEnable resolves, setBusy(false) runs, and
      // the card RECOVERS — the button returns to its idle label and a quiet
      // inline error appears (retry possible). Permission is granted-mocked here,
      // so this is the transient-error path, not the denied/settings-hint path.
      await expect(page.getByText("Couldn't turn on notifications — try again")).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole("button", { name: "Turn on notifications" })).toBeVisible()
      await expect(page.getByRole("button", { name: "Turning on…" })).toHaveCount(0)
    })
  })

  // ── (a, fallback) service-client-arranged subscription row ─────────────
  test("fallback: a claimed push_subscriptions row is visible via the service client", async () => {
    const sb = sandbox()
    const row = await sb.insertPushSubscription({
      userId: adminId,
      endpoint: "https://fcm.googleapis.com/fcm/send/E2E-fake-endpoint-000",
    })
    expect(row.user_id).toBe(adminId)
    expect(row.platform).toBe("web")
    expect(row.ministry_id).toBe(sb.ministryId)

    const { data, error } = await sb.client
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", adminId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].platform).toBe("web")
    expect(data![0].ministry_id).toBe(sb.ministryId)
  })

  // ── (b) dispatch route auth gate ────────────────────────────────────────
  test("dispatch route: missing secret -> 401", async () => {
    const ctx = await request.newContext()
    const res = await ctx.post(dispatchUrl, { data: { table: "messages", record_id: "00000000-0000-0000-0000-000000000000" } })
    expect(res.status()).toBe(401)
    await ctx.dispose()
  })

  test("dispatch route: wrong secret -> 401", async () => {
    const ctx = await request.newContext()
    const res = await ctx.post(dispatchUrl, {
      headers: { "x-push-secret": "definitely-not-the-secret" },
      data: { table: "messages", record_id: "00000000-0000-0000-0000-000000000000" },
    })
    expect(res.status()).toBe(401)
    await ctx.dispose()
  })

  // ── (c) recipient resolution (dryRun) ───────────────────────────────────
  test.describe("dryRun recipient resolution", () => {
    const secret = process.env.PUSH_WEBHOOK_SECRET

    test.beforeAll(() => {
      expect(secret, "PUSH_WEBHOOK_SECRET must be set in .env.local to run dryRun assertions").toBeTruthy()
    })

    test("message in a 2-member group: recipients = other member only (not the sender)", async () => {
      const sb = sandbox()
      const group = await sb.createGroup({ name: "push-test-group dm", memberIds: [adminId, memberId] })
      const msg = await sb.insertMessage({ groupId: group.id, senderId: adminId, content: "E2E push test message" })

      const ctx = await request.newContext()
      const res = await ctx.post(`${dispatchUrl}?dryRun=1`, {
        headers: { "x-push-secret": secret! },
        data: { table: "messages", record_id: msg.id },
      })
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.count).toBe(1)
      expect(body.recipients).toEqual([memberId])
      expect(body.reasons[memberId]).toBe("group")

      // ── mute: recipients become empty ──
      await sb.setGroupMemberMuted(group.id, memberId, true)
      const res2 = await ctx.post(`${dispatchUrl}?dryRun=1`, {
        headers: { "x-push-secret": secret! },
        data: { table: "messages", record_id: msg.id },
      })
      expect(res2.status()).toBe(200)
      const body2 = await res2.json()
      expect(body2.count).toBe(0)
      expect(body2.recipients).toEqual([])

      await sb.setGroupMemberMuted(group.id, memberId, false)
      await ctx.dispose()
    })

    test("published announcement: recipients include both sandbox users when unattributed, and exclude the author when attributed", async () => {
      const sb = sandbox()
      const ctx = await request.newContext()

      // Attributed (created_by = admin, the sandbox default): admin is excluded
      // as "the author who just published it" — this is the shipped behavior
      // (build-report.md flags this as an interpretation, not spec-literal).
      const annByAdmin = await sb.createAnnouncement({
        title: `${ANN_PREFIX}by-admin`,
        body: "E2E push test announcement (authored)",
      })
      const resAuthored = await ctx.post(`${dispatchUrl}?dryRun=1`, {
        headers: { "x-push-secret": secret! },
        data: { table: "announcements", record_id: annByAdmin.id },
      })
      const bodyAuthored = await resAuthored.json()
      expect(bodyAuthored.recipients).toEqual([memberId])

      // Unattributed (created_by = null): no author to exclude, so both sandbox
      // users are recipients.
      const annUnattributed = await sb.createAnnouncement({
        title: `${ANN_PREFIX}unattributed`,
        body: "E2E push test announcement (unattributed)",
        created_by: null,
      })
      const resBoth = await ctx.post(`${dispatchUrl}?dryRun=1`, {
        headers: { "x-push-secret": secret! },
        data: { table: "announcements", record_id: annUnattributed.id },
      })
      const bodyBoth = await resBoth.json()
      expect(bodyBoth.count).toBe(2)
      expect(new Set(bodyBoth.recipients)).toEqual(new Set([adminId, memberId]))

      await ctx.dispose()
    })
  })
})
