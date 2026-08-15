import { test, expect, request } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

// FCM sender (Android shell). The dispatch route delivers platform='android-native'
// rows over FCM (lib/fcm.ts), the exact counterpart to the ios-native → APNs lane.
// The sibling spec push-apns.spec.ts covers the iOS half; this covers Android and,
// crucially, the INTERACTION between them.
//
// Deliberately routing-only (dryRun), unlike push-apns.spec.ts which also does one
// real send. A real FCM round trip needs a Firebase service account, and unlike the
// APNs key that is not configured yet — fcmReady() is false, so a real dispatch would
// skip the row and prove nothing. Routing is the part that can silently regress from
// an unrelated edit; the send path is a thin mirror of the APNs one.
//
// The load-bearing assertion is the LAST test: an android-native row must never fall
// through to the web-push lane. web-push would try to encrypt to a NULL p256dh, and
// the failure mode is a silently undelivered notification, not an error.

const FCM_ENDPOINT = "fcm:E2E-FCM-FAKETOKEN-0000000000000000000000000000000000000000"
const APNS_ENDPOINT = "apns:E2E-APNS-FAKETOKEN-0000000000000000000000000000000000000000"
const WEB_ENDPOINT = `https://fcm.googleapis.com/fcm/send/${E2E_PREFIX}fcm-web-endpoint`

test.describe.serial("FCM sender routing", () => {
  let memberId: string
  // Slot-aware (see push-apns.spec.ts): a hardcoded 3001 POSTs at a sibling
  // worktree's dev server while assertions read this slot's database.
  const dispatchUrl = `http://localhost:${process.env.E2E_PORT ?? 3001}/api/push/dispatch`
  const secret = process.env.PUSH_WEBHOOK_SECRET

  test.beforeAll(async () => {
    expect(secret, "PUSH_WEBHOOK_SECRET must be set in .env.local").toBeTruthy()
    const sb = sandbox()
    memberId = await sb.memberUserId()
    await sb.resetNotificationSettings(memberId)
    await sb.deletePushSubscriptionsForUser(memberId)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.resetNotificationSettings(memberId)
    await sb.deletePushSubscriptionsForUser(memberId)
  })

  async function dryRun(ctx: Awaited<ReturnType<typeof request.newContext>>, table: string, event: string, recordId: string) {
    const res = await ctx.post(`${dispatchUrl}?dryRun=1`, {
      headers: { "x-push-secret": secret! },
      data: { table, event, record_id: recordId },
    })
    expect(res.status()).toBe(200)
    return res.json()
  }

  // ── Tier-1 (all platforms): android-native routes to the FCM lane ────────────
  test("a Tier-1 event routes the recipient's android-native sub to the FCM lane", async () => {
    const sb = sandbox()
    await sb.deletePushSubscriptionsForUser(memberId)
    await sb.insertPushSubscription({ userId: memberId, endpoint: FCM_ENDPOINT, platform: "android-native" })
    const ctx = await request.newContext()

    const body = await dryRun(ctx, "profiles", "role_change", memberId)
    expect(body.recipients).toEqual([memberId])
    expect(body.lanes.fcm).toBe(1) // routed to FCM…
    expect(body.lanes.apns).toBe(0) // …not APNs…
    expect(body.lanes.web).toBe(0) // …and NOT web-push (the silent-failure case)
    // `native` is the "not web-push" count, shared with the APNs spec's shape.
    expect(body.routing[memberId]).toEqual({ web: 0, native: 1 })

    await sb.deletePushSubscriptionsForUser(memberId)
    await ctx.dispose()
  })

  // ── A web sub and an android sub are counted in DIFFERENT lanes ──────────────
  test("a web sub and an android-native sub route to separate lanes", async () => {
    const sb = sandbox()
    await sb.deletePushSubscriptionsForUser(memberId)
    await sb.insertPushSubscription({ userId: memberId, endpoint: WEB_ENDPOINT, platform: "web" })
    await sb.insertPushSubscription({ userId: memberId, endpoint: FCM_ENDPOINT, platform: "android-native" })
    const ctx = await request.newContext()

    const body = await dryRun(ctx, "profiles", "role_change", memberId)
    // The old lane split was `platform !== "ios-native"` ⇒ web, which would have
    // counted BOTH of these as web (lanes.web === 2) and sent the Android token
    // through web-push. Asserting one-each is what catches that regression.
    expect(body.lanes.web).toBe(1)
    expect(body.lanes.fcm).toBe(1)
    expect(body.lanes.apns).toBe(0)
    expect(body.routing[memberId]).toEqual({ web: 1, native: 1 })

    await sb.deletePushSubscriptionsForUser(memberId)
    await ctx.dispose()
  })

  // ── The two native lanes coexist without stealing each other's rows ──────────
  test("ios-native and android-native subs route to their own lanes simultaneously", async () => {
    const sb = sandbox()
    await sb.deletePushSubscriptionsForUser(memberId)
    await sb.insertPushSubscription({ userId: memberId, endpoint: APNS_ENDPOINT, platform: "ios-native" })
    await sb.insertPushSubscription({ userId: memberId, endpoint: FCM_ENDPOINT, platform: "android-native" })
    const ctx = await request.newContext()

    const body = await dryRun(ctx, "profiles", "role_change", memberId)
    // The regression this exists for: adding the FCM branch must not divert iOS rows
    // (a `platform !== "ios-native"` test would have swept android into web-push, and
    // a mis-ordered branch would sweep iOS into FCM).
    expect(body.lanes.apns).toBe(1)
    expect(body.lanes.fcm).toBe(1)
    expect(body.lanes.web).toBe(0)
    expect(body.routing[memberId]).toEqual({ web: 0, native: 2 })

    await sb.deletePushSubscriptionsForUser(memberId)
    await ctx.dispose()
  })
})
