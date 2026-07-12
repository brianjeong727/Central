import { test, expect, request } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

// Web Push v2b — cron-driven senders (feat/push-v2b-cron). Two senders with no
// source-row trigger of their own:
//   • event_reminder (Tier 1) — ~2h before an event, push everyone who RSVP'd (all
//     platforms), honoring the `announcements` pref.
//   • desk_digest (Tier 3, mobile) — one daily summary per eligible leader/admin to
//     their NON-web subs, computed from 24h pending counts; zero-item recipients skipped.
//
// These hit the dispatch route DIRECTLY (dryRun for recipient/count resolution), so
// they are valid PRE-migration: the v2b pg_cron jobs are drafted but not yet applied.
// The cron→route enqueue path is probe-verified by the rls-reviewer post-apply.

const ANN_PREFIX = `${E2E_PREFIX}push-v2b-ann `

test.describe.serial("Web push v2b cron senders", () => {
  let adminId: string
  let memberId: string
  const dispatchUrl = "http://localhost:3001/api/push/dispatch"
  const secret = process.env.PUSH_WEBHOOK_SECRET
  const createdAnnIds: string[] = []

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
    await sb.deleteRsvpsForAnnouncements(createdAnnIds)
    await sb.resetNotificationSettings(adminId)
    await sb.resetNotificationSettings(memberId)
    await sb.deletePushSubscriptionsForUser(adminId)
    await sb.deletePushSubscriptionsForUser(memberId)
    await sb.deleteFormsByPrefix()
    await sb.deleteAnnouncementsByPrefix(ANN_PREFIX)
  })

  async function dryRun(
    ctx: Awaited<ReturnType<typeof request.newContext>>,
    payload: Record<string, unknown>,
  ) {
    const res = await ctx.post(`${dispatchUrl}?dryRun=1`, {
      headers: { "x-push-secret": secret! },
      data: payload,
    })
    expect(res.status()).toBe(200)
    return res.json()
  }

  const inHours = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString()

  // ── Event reminder: RSVP'd users only, all platforms ────────────────────────
  test("event reminder resolves to RSVP'd users only; non-RSVP'd are excluded", async () => {
    const sb = sandbox()
    const ann = await sb.createAnnouncement({
      title: `${ANN_PREFIX}gathering`, body: "Come out tonight", is_event: true, event_date: inHours(1.5),
    })
    createdAnnIds.push(ann.id)
    // Only the member RSVPs; the admin (author) does not.
    await sb.insertRsvp({ announcementId: ann.id, userId: memberId })
    const ctx = await request.newContext()

    const body = await dryRun(ctx, { table: "announcements", record_id: ann.id, event: "event_reminder" })
    expect(body.recipients).toEqual([memberId])
    expect(body.recipients).not.toContain(adminId) // didn't RSVP
    expect(body.reasons[memberId]).toBe("event_reminder")
    // Not a Tier-3 desk sender: no web/mobile platform restriction.
    expect(body.webOnly[memberId]).toBeUndefined()
    expect(body.mobileOnly[memberId]).toBeUndefined()

    await ctx.dispose()
  })

  test("event reminder honors the `announcements` pref, and never fires for a past/started event", async () => {
    const sb = sandbox()
    const ctx = await request.newContext()

    const ann = await sb.createAnnouncement({
      title: `${ANN_PREFIX}pref`, body: "later", is_event: true, event_date: inHours(1),
    })
    createdAnnIds.push(ann.id)
    await sb.insertRsvp({ announcementId: ann.id, userId: memberId })

    // announcements=false suppresses the reminder for that RSVP'd user.
    await sb.setNotificationSettings(memberId, { announcements: false })
    const off = await dryRun(ctx, { table: "announcements", record_id: ann.id, event: "event_reminder" })
    expect(off.count).toBe(0)
    await sb.resetNotificationSettings(memberId)

    // A past-dated event never reminds (defensive future-guard in the resolver).
    const past = await sb.createAnnouncement({
      title: `${ANN_PREFIX}past`, body: "already happened", is_event: true, event_date: inHours(-2),
    })
    createdAnnIds.push(past.id)
    await sb.insertRsvp({ announcementId: past.id, userId: memberId })
    const pastRun = await dryRun(ctx, { table: "announcements", record_id: past.id, event: "event_reminder" })
    expect(pastRun.count).toBe(0)

    await ctx.dispose()
  })

  // ── Desk digest: per-recipient counts, zero-item + web-only exclusion ────────
  test("desk digest returns per-recipient counts, excludes zero-item candidates", async () => {
    const sb = sandbox()
    await sb.deletePushSubscriptionsForUser(adminId)
    await sb.deletePushSubscriptionsForUser(memberId)
    await sb.resetNotificationSettings(adminId)
    await sb.resetNotificationSettings(memberId)

    // Both users have a NON-web (mobile) sub, so both are digest candidates…
    await sb.insertPushSubscription({ userId: adminId, endpoint: "https://fcm.googleapis.com/fcm/send/E2E-v2b-ios-adm", platform: "ios-pwa" })
    await sb.insertPushSubscription({ userId: memberId, endpoint: "https://fcm.googleapis.com/fcm/send/E2E-v2b-ios-mem", platform: "ios-pwa" })

    // …but only the admin has any last-24h desk work: a form response on their announcement.
    const ann = await sb.createAnnouncement({ title: `${ANN_PREFIX}digest-signup`, body: "rsvp form" }) // created_by = admin
    createdAnnIds.push(ann.id)
    const form = await sb.createForm({ createdBy: adminId, title: "digest-rsvp", announcementId: ann.id })
    await sb.insertFormResponse({ formId: form.id, announcementId: ann.id, userId: memberId })

    const ctx = await request.newContext()
    const body = await dryRun(ctx, { event: "desk_digest" })

    // Admin appears with a form-response count; delivered mobile-only.
    expect(body.recipients).toContain(adminId)
    expect(body.reasons[adminId]).toBe("desk_digest")
    expect(body.mobileOnly[adminId]).toBe(true)
    expect(body.counts[adminId].forms).toBeGreaterThanOrEqual(1)
    // Member is a candidate (has a mobile sub) but has ZERO items -> excluded (no spam).
    expect(body.recipients).not.toContain(memberId)

    await ctx.dispose()
  })

  test("desk digest excludes web-only recipients and honors the desk_digest pref", async () => {
    const sb = sandbox()
    const ctx = await request.newContext()

    // Admin has items (an announcement with a form response) but ONLY a web sub -> not a
    // digest candidate (the digest targets non-web platforms).
    await sb.deletePushSubscriptionsForUser(adminId)
    await sb.insertPushSubscription({ userId: adminId, endpoint: "https://fcm.googleapis.com/fcm/send/E2E-v2b-web-adm", platform: "web" })
    const ann = await sb.createAnnouncement({ title: `${ANN_PREFIX}webonly`, body: "form" })
    createdAnnIds.push(ann.id)
    const form = await sb.createForm({ createdBy: adminId, title: "webonly", announcementId: ann.id })
    await sb.insertFormResponse({ formId: form.id, announcementId: ann.id, userId: memberId })

    const webOnlyRun = await dryRun(ctx, { event: "desk_digest" })
    expect(webOnlyRun.recipients).not.toContain(adminId)

    // Give the admin a mobile sub back -> now a candidate with items -> included…
    await sb.insertPushSubscription({ userId: adminId, endpoint: "https://fcm.googleapis.com/fcm/send/E2E-v2b-ios-adm2", platform: "ios-pwa" })
    const included = await dryRun(ctx, { event: "desk_digest" })
    expect(included.recipients).toContain(adminId)

    // …but desk_digest=false suppresses them entirely.
    await sb.setNotificationSettings(adminId, { desk_digest: false })
    const suppressed = await dryRun(ctx, { event: "desk_digest" })
    expect(suppressed.recipients).not.toContain(adminId)
    await sb.resetNotificationSettings(adminId)

    await ctx.dispose()
  })
})
