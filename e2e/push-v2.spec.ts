import { test, expect, request } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

// Web Push v2 — event-driven senders (feat/push-v2-senders). Extends the v1
// pipeline (trigger → pg_net → dispatch route) with per-table handlers.
//
// These tests hit the dispatch route DIRECTLY with { table, record_id, event }
// (dryRun for recipient resolution; one real POST for the platform filter), so
// they are valid PRE-migration: the v2 DB triggers are drafted but not yet
// applied. An end-to-end "insert row → trigger fires → route called" path can
// only be exercised AFTER the orchestrator applies migration-v2.sql; those are
// out of scope here and tagged TODO(migration) below.

const ANN_PREFIX = `${E2E_PREFIX}push-v2-ann `

test.describe.serial("Web push v2 senders", () => {
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
    await sb.deleteReceiptsByPrefix()
    await sb.deletePulseQuestionsByPrefix()
    await sb.deleteFormsByPrefix()
    await sb.deleteAnnouncementsByPrefix(ANN_PREFIX)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.resetNotificationSettings(adminId)
    await sb.resetNotificationSettings(memberId)
    await sb.deletePushSubscriptionsForUser(adminId)
    await sb.deletePushSubscriptionsForUser(memberId)
    await sb.deleteReceiptsByPrefix()
    await sb.deletePulseQuestionsByPrefix()
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

  // ── Tier 1: receipt decision -> submitter only ──────────────────────────────
  test("receipt decision resolves to the submitter only, and never fires while pending", async () => {
    const sb = sandbox()
    const receipt = await sb.createReceipt({ submittedBy: memberId, amount: 42, eventName: "supplies", status: "pending" })
    const ctx = await request.newContext()

    // Still pending -> the decision sender resolves no one.
    const pending = await dryRun(ctx, "receipts", "receipt_decision", receipt.id)
    expect(pending.count).toBe(0)

    // Treasurer approves -> the submitter (not the approver) is the recipient.
    await sb.updateReceiptStatus(receipt.id, "approved")
    const decided = await dryRun(ctx, "receipts", "receipt_decision", receipt.id)
    expect(decided.recipients).toEqual([memberId])
    expect(decided.reasons[memberId]).toBe("receipt_approved")

    await ctx.dispose()
  })

  // ── Tier 1: role change -> that user only, honoring the `activity` pref ──────
  test("role change resolves to the affected user only, and the activity pref suppresses it", async () => {
    const sb = sandbox()
    const ctx = await request.newContext()

    const on = await dryRun(ctx, "profiles", "role_change", memberId)
    expect(on.recipients).toEqual([memberId])
    expect(on.reasons[memberId]).toBe("role_change")

    // activity=false -> suppressed.
    await sb.setNotificationSettings(memberId, { activity: false })
    const off = await dryRun(ctx, "profiles", "role_change", memberId)
    expect(off.count).toBe(0)
    await sb.resetNotificationSettings(memberId)

    await ctx.dispose()
  })

  // ── Tier 1: pulse question -> all members except the author ──────────────────
  test("pulse question resolves to members minus the author", async () => {
    const sb = sandbox()
    const q = await sb.createPulseQuestion({ createdBy: adminId, questionText: "How is your walk this week?" })
    const ctx = await request.newContext()

    const body = await dryRun(ctx, "congregation_questions", "pulse_question", q.id)
    expect(body.recipients).toContain(memberId)
    expect(body.recipients).not.toContain(adminId) // author excluded
    expect(body.reasons[memberId]).toBe("pulse_question")

    await ctx.dispose()
  })

  // ── Tier 3: form response -> the announcement creator only (web-only marked) ─
  test("form response resolves to the announcement creator, excludes the responder, and is marked web-only", async () => {
    const sb = sandbox()
    const ann = await sb.createAnnouncement({ title: `${ANN_PREFIX}signup`, body: "RSVP form" }) // created_by = admin
    const form = await sb.createForm({ createdBy: adminId, title: "rsvp", announcementId: ann.id })
    const resp = await sb.insertFormResponse({ formId: form.id, announcementId: ann.id, userId: memberId })
    const ctx = await request.newContext()

    const body = await dryRun(ctx, "form_responses", "form_response", resp.id)
    expect(body.recipients).toEqual([adminId]) // the announcement's creator; responder (member) excluded
    expect(body.reasons[adminId]).toBe("form_response")
    expect(body.webOnly[adminId]).toBe(true) // Tier-3 desk-work is web-only

    await ctx.dispose()
  })

  // ── Tier 3: real dispatch delivers to platform='web' subs, not ios-pwa ──────
  test("a Tier-3 sender attempts only the recipient's web subscription, skipping ios-pwa", async () => {
    const sb = sandbox()
    // Admin (the form/announcement creator) gets one web + one ios-pwa subscription.
    await sb.deletePushSubscriptionsForUser(adminId)
    await sb.insertPushSubscription({ userId: adminId, endpoint: "https://fcm.googleapis.com/fcm/send/E2E-v2-web-000", platform: "web" })
    await sb.insertPushSubscription({ userId: adminId, endpoint: "https://fcm.googleapis.com/fcm/send/E2E-v2-ios-000", platform: "ios-pwa" })

    const ann = await sb.createAnnouncement({ title: `${ANN_PREFIX}webfilter`, body: "form" })
    const form = await sb.createForm({ createdBy: adminId, title: "webfilter", announcementId: ann.id })
    const resp = await sb.insertFormResponse({ formId: form.id, announcementId: ann.id, userId: memberId })

    const ctx = await request.newContext()
    // Real dispatch (no dryRun). Fake sub keys make the ONE attempted send reject
    // (web-push async-rejects on the bad p256dh — no crash), so `failed` counts the
    // exact number of subscriptions ATTEMPTED. web-only filtering means only the
    // web sub is tried: failed === 1. If the ios sub were not excluded it would be 2.
    const res = await ctx.post(dispatchUrl, {
      headers: { "x-push-secret": secret! },
      data: { table: "form_responses", event: "form_response", record_id: resp.id },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.recipients).toBe(1)
    expect(body.sent).toBe(0)
    expect(body.failed).toBe(1) // exactly one attempt — the web sub; ios-pwa skipped

    await sb.deletePushSubscriptionsForUser(adminId)
    await ctx.dispose()
  })

  // ── Trigger-level coverage lives in the DB gate, not here ──────────────────
  // migration web_push_v2_senders was probe-verified post-apply (rls-reviewer
  // Mode 2, 2026-07-12, 10/10: one pg_net enqueue per real transition with the
  // correct event discriminator; zero on drafts/no-ops/unpublished). Re-probe
  // via the rls-reviewer if trigger WHEN clauses ever change — committed-write
  // trigger tests don't belong in this suite (real HTTP + cleanup burden).
})
