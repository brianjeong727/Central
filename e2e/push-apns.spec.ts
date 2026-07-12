import { test, expect, request } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

// APNs sender (feat/apns-sender). The dispatch route now delivers platform='ios-native'
// rows over APNs (lib/apns.ts) instead of skipping them. These tests prove:
//   1. Routing — a fake ios-native sub is routed to the APNs lane on a Tier-1 event
//      (all platforms) and EXCLUDED on a Tier-3 webOnly event, asserted via dryRun's
//      per-recipient `routing` breakdown + aggregate `lanes` (no notification sent).
//   2. Real delivery + prune classification — one real (non-dry) dispatch against the
//      fake token. The production APNs host rejects a bogus token with 400 BadDeviceToken,
//      which the route classifies as a PERMANENT failure → the row is pruned (parity with
//      web-push 404/410). This is the single acceptable real-key round trip (per the task).
//
// NOTE: requires the dispatch server (:3001) to have APNS_* env loaded (APNS_KEY_ID/
// TEAM_ID/BUNDLE_ID/PRIVATE_KEY_BASE64). Without them apnsReady() is false and native
// rows are skipped (failed:0, pruned:0) — the real-delivery test would then fail loudly,
// which is the correct signal that the env is missing.

const ANN_PREFIX = `${E2E_PREFIX}push-apns-ann `
const APNS_ENDPOINT = "apns:E2E-APNS-FAKETOKEN-0000000000000000000000000000000000000000000000"

test.describe.serial("APNs sender routing + prune classification", () => {
  let adminId: string
  let memberId: string
  const dispatchUrl = "http://localhost:3001/api/push/dispatch"
  const secret = process.env.PUSH_WEBHOOK_SECRET

  test.beforeAll(async () => {
    expect(secret, "PUSH_WEBHOOK_SECRET must be set in .env.local").toBeTruthy()
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    await sb.resetNotificationSettings(adminId)
    await sb.resetNotificationSettings(memberId)
    await sb.deletePushSubscriptionsForUser(adminId)
    await sb.deletePushSubscriptionsForUser(memberId)
    await sb.deleteFormsByPrefix()
    await sb.deleteAnnouncementsByPrefix(ANN_PREFIX)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.resetNotificationSettings(adminId)
    await sb.resetNotificationSettings(memberId)
    await sb.deletePushSubscriptionsForUser(adminId)
    await sb.deletePushSubscriptionsForUser(memberId)
    await sb.deleteFormsByPrefix()
    await sb.deleteAnnouncementsByPrefix(ANN_PREFIX)
  })

  async function dryRun(ctx: Awaited<ReturnType<typeof request.newContext>>, table: string, event: string, recordId: string) {
    const res = await ctx.post(`${dispatchUrl}?dryRun=1`, {
      headers: { "x-push-secret": secret! },
      data: { table, event, record_id: recordId },
    })
    expect(res.status()).toBe(200)
    return res.json()
  }

  // ── Tier-1 (all platforms): ios-native sub routes to the APNs lane ──────────
  test("a Tier-1 event routes the recipient's ios-native sub to the APNs lane", async () => {
    const sb = sandbox()
    await sb.deletePushSubscriptionsForUser(memberId)
    await sb.insertPushSubscription({ userId: memberId, endpoint: APNS_ENDPOINT, platform: "ios-native" })
    const ctx = await request.newContext()

    // role_change -> the member, no webOnly/mobileOnly -> all platforms.
    const body = await dryRun(ctx, "profiles", "role_change", memberId)
    expect(body.recipients).toEqual([memberId])
    expect(body.reasons[memberId]).toBe("role_change")
    expect(body.routing[memberId]).toEqual({ web: 0, native: 1 }) // the one ios-native sub
    expect(body.lanes.apns).toBe(1) // routed to APNs, not web-push
    expect(body.lanes.web).toBe(0)

    await sb.deletePushSubscriptionsForUser(memberId)
    await ctx.dispose()
  })

  // ── Tier-3 webOnly: ios-native sub is EXCLUDED from the APNs lane ────────────
  test("a Tier-3 webOnly event excludes the recipient's ios-native sub from the APNs lane", async () => {
    const sb = sandbox()
    // Admin is the announcement/form creator (the Tier-3 recipient). Give the admin BOTH
    // a web sub and an ios-native sub; webOnly must keep only the web one.
    await sb.deletePushSubscriptionsForUser(adminId)
    await sb.insertPushSubscription({ userId: adminId, endpoint: "https://fcm.googleapis.com/fcm/send/E2E-apns-web-000", platform: "web" })
    await sb.insertPushSubscription({ userId: adminId, endpoint: APNS_ENDPOINT, platform: "ios-native" })

    const ann = await sb.createAnnouncement({ title: `${ANN_PREFIX}webonly`, body: "form" }) // created_by = admin
    const form = await sb.createForm({ createdBy: adminId, title: "webonly", announcementId: ann.id })
    const resp = await sb.insertFormResponse({ formId: form.id, announcementId: ann.id, userId: memberId })

    const ctx = await request.newContext()
    const body = await dryRun(ctx, "form_responses", "form_response", resp.id)
    expect(body.recipients).toEqual([adminId])
    expect(body.webOnly[adminId]).toBe(true)
    // ios-native EXCLUDED by webOnly gating; only the web sub survives.
    expect(body.routing[adminId]).toEqual({ web: 1, native: 0 })
    expect(body.lanes.apns).toBe(0) // nothing reaches the APNs lane
    expect(body.lanes.web).toBe(1)

    await sb.deletePushSubscriptionsForUser(adminId)
    await ctx.dispose()
  })

  // ── Real dispatch: fake token fails BadDeviceToken -> attempted-failed + PRUNED ──
  test("a real dispatch against the fake ios-native token fails and prunes the dead row", async () => {
    const sb = sandbox()
    await sb.deletePushSubscriptionsForUser(memberId)
    const sub = await sb.insertPushSubscription({ userId: memberId, endpoint: APNS_ENDPOINT, platform: "ios-native" })

    const ctx = await request.newContext()
    // Real (non-dry) dispatch. The APNs production host rejects the bogus token with
    // 400 BadDeviceToken — a PERMANENT failure — so the send is counted as failed AND
    // the subscription row is pruned (mirrors web-push 404/410 pruning). Verified against
    // the real key: production host + fake token => statusCode 400, reason BadDeviceToken.
    const res = await ctx.post(dispatchUrl, {
      headers: { "x-push-secret": secret! },
      data: { table: "profiles", event: "role_change", record_id: memberId },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.recipients).toBe(1)
    expect(body.sent).toBe(0)
    expect(body.failed).toBe(1) // the one native attempt failed
    expect(body.pruned).toBe(1) // BadDeviceToken is permanent -> row pruned

    // Confirm the row is actually gone from the DB.
    const { data: after } = await sb.client
      .from("push_subscriptions").select("id").eq("id", sub.id)
    expect(after ?? []).toHaveLength(0)

    await sb.deletePushSubscriptionsForUser(memberId)
    await ctx.dispose()
  })
})
