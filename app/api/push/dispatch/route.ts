import { NextRequest, NextResponse } from "next/server"
import webpush, { WebPushError } from "web-push"
import { createAdminClient } from "@/lib/supabase-admin"
import { isAdminRole } from "@/lib/roles"
import type { NotificationSettings } from "@/app/home/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ── Web Push dispatch (v1 messages/announcements + v2 event-driven senders) ──
// A Postgres AFTER trigger POSTs { table, record_id, event? } here with the shared
// secret in `x-push-secret`. We re-read the row with the service-role client (never
// trust the payload), resolve recipients + per-user prefs + per-chat mutes + the
// ≥30 smart threshold, then fan out via web-push, pruning dead (404/410) endpoints.
//
// v2 adds an `event` discriminator (from the trigger's TG_ARGV[0]) so several senders
// can share one table (receipts submitted vs decision; profiles role-change vs join).
// Tier-1 senders honor the `activity` pref; Tier-3 (desk-work) senders honor `desk_web`
// AND are delivered ONLY to platform='web' subscriptions (webOnly on the Resolved).

type PushPayload = { title: string; body: string; url: string; tag: string }
// webOnly = Tier-3 desk-work: deliver to this recipient's platform='web' subs only.
type Resolved = { userId: string; reason: string; payload: PushPayload; webOnly?: boolean }

interface SubRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  platform: string
}

const SMART_THRESHOLD = 30 // mirrors read-receipt large-room threshold (Convention #18)

function vapidReady(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:brianjeong13@gmail.com",
    pub,
    priv,
  )
  return true
}

function preview(text: string | null | undefined, max = 120): string {
  if (!text) return ""
  const t = text.replace(/\s*\n+\s*/g, " ").trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t
}

function firstLine(text: string | null | undefined): string {
  if (!text) return ""
  const line = text.split("\n").find((l) => l.trim()) ?? ""
  return preview(line, 120)
}

// ── Message recipients ───────────────────────────────────────────────────────
async function resolveMessage(
  admin: ReturnType<typeof createAdminClient>,
  recordId: string,
): Promise<Resolved[]> {
  const { data: msg } = await admin
    .from("messages")
    .select("id, group_id, sender_id, content, reply_to_id, message_type")
    .eq("id", recordId)
    .single()
  if (!msg || msg.message_type === "system" || !msg.sender_id) return []

  const { data: group } = await admin
    .from("groups")
    .select("id, name, type")
    .eq("id", msg.group_id)
    .single()
  if (!group) return []

  const { data: members } = await admin
    .from("group_members")
    .select("user_id, muted")
    .eq("group_id", msg.group_id)
  if (!members || members.length === 0) return []

  const memberCount = members.length
  const recipientIds = members
    .filter((m) => m.user_id !== msg.sender_id)
    .map((m) => m.user_id)
  if (recipientIds.length === 0) return []

  const profileIds = [
    ...new Set([...members.map((m) => m.user_id), msg.sender_id].filter(Boolean)),
  ]
  const { data: profs } = await admin
    .from("profiles")
    .select("id, name, notification_settings")
    .in("id", profileIds)
  const profMap = new Map((profs ?? []).map((p) => [p.id, p]))
  const senderName = profMap.get(msg.sender_id)?.name ?? "Someone"

  // Mentions are inserted by the composer as `@FirstName` (single token, no spaces).
  const mentionTokens = new Set(
    (msg.content?.match(/@(\w+)/g) ?? []).map((t: string) => t.slice(1).toLowerCase()),
  )

  let repliedAuthor: string | null = null
  if (msg.reply_to_id) {
    const { data: rep } = await admin
      .from("messages")
      .select("sender_id")
      .eq("id", msg.reply_to_id)
      .single()
    repliedAuthor = rep?.sender_id ?? null
  }

  const muteMap = new Map(members.map((m) => [m.user_id, !!m.muted]))
  const isDM = group.type === "dm"
  const body = preview(msg.content, 120)
  const results: Resolved[] = []

  for (const uid of recipientIds) {
    if (muteMap.get(uid)) continue // per-chat mute is a hard override
    const settings: NotificationSettings =
      (profMap.get(uid)?.notification_settings as NotificationSettings) ?? {}
    const firstName = (profMap.get(uid)?.name ?? "").split(" ")[0].toLowerCase()
    const isMention = !!firstName && mentionTokens.has(firstName)
    const isReply = repliedAuthor === uid

    let reason: string | null = null
    if (isDM) {
      if (settings.dms === false) continue
      reason = "dm"
    } else if (isReply && settings.replies !== false) {
      reason = "reply"
    } else if (isMention && settings.mentions !== false) {
      reason = "mention"
    } else {
      const mode = settings.group_mode ?? "smart"
      if (mode === "off" || mode === "mentions") continue
      if (mode === "smart" && memberCount >= SMART_THRESHOLD) continue
      reason = "group"
    }

    let title: string
    if (isDM) title = senderName
    else if (reason === "mention") title = `${senderName} mentioned you · ${group.name}`
    else if (reason === "reply") title = `${senderName} replied · ${group.name}`
    else title = `${senderName} · ${group.name}`

    results.push({
      userId: uid,
      reason,
      payload: { title, body, url: `/home?tab=chats&chat=${group.id}`, tag: `chat-${group.id}` },
    })
  }
  return results
}

// ── Announcement recipients ──────────────────────────────────────────────────
async function resolveAnnouncement(
  admin: ReturnType<typeof createAdminClient>,
  recordId: string,
): Promise<Resolved[]> {
  const { data: ann } = await admin
    .from("announcements")
    .select("id, ministry_id, title, body, audience, status, created_by")
    .eq("id", recordId)
    .single()
  if (!ann || ann.status !== "published") return []

  // Audience semantics mirror announcements-tab's read filter: null / "all" /
  // "group" → whole ministry; a 4-digit year → only that graduating class.
  let query = admin
    .from("profiles")
    .select("id, notification_settings")
    .eq("ministry_id", ann.ministry_id)
  if (ann.audience && /^\d{4}$/.test(ann.audience)) {
    query = query.eq("graduation_year", parseInt(ann.audience, 10))
  }
  const { data: profs } = await query
  if (!profs) return []

  const title = ann.title || "New announcement"
  const body = firstLine(ann.body)
  const results: Resolved[] = []
  for (const p of profs) {
    if (p.id === ann.created_by) continue // author just published it
    const settings = (p.notification_settings as NotificationSettings) ?? {}
    if (settings.announcements === false) continue
    results.push({
      userId: p.id,
      reason: "announcement",
      payload: {
        title,
        body,
        url: `/home?tab=announcements&ann=${ann.id}`,
        tag: `announcement-${ann.id}`,
      },
    })
  }
  return results
}

// ── v2 shared helpers ────────────────────────────────────────────────────────
type AdminClient = ReturnType<typeof createAdminClient>

const money = (n: number | null | undefined) =>
  typeof n === "number" ? `$${n.toFixed(2)}` : ""

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a"
}

const ROLE_LABEL: Record<string, string> = {
  visitor: "Visitor", member: "Member", leader: "Leader", admin: "Admin",
  deacon: "Deacon", elder: "Elder", pastor: "Pastor",
}
function roleLabel(role: string): string {
  return ROLE_LABEL[role?.toLowerCase()] ?? (role ? role[0].toUpperCase() + role.slice(1) : "Member")
}

const DGL_SLOT_LABEL: Record<string, string> = {
  wednesday_pm: "Wednesday", friday_sg: "Friday small group", sunday_service: "Sunday service",
}

function formatWeek(iso: string | null | undefined): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return ""
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// Fetch a single profile's notification_settings (default {} if absent).
async function settingsFor(admin: AdminClient, userId: string): Promise<NotificationSettings> {
  const { data } = await admin.from("profiles").select("notification_settings").eq("id", userId).maybeSingle()
  return (data?.notification_settings as NotificationSettings) ?? {}
}

// Ministry treasurers — mirrors finance-auth.computeFinanceCapability's canApprove:
// admin-tier (fallback) OR a member of a team_type='finance' team whose role grants
// `can_view_finances`. Server-side replica so the route needs no session.
async function resolveTreasurers(admin: AdminClient, ministryId: string): Promise<Set<string>> {
  const ids = new Set<string>()
  const { data: profs } = await admin
    .from("profiles").select("id, role").eq("ministry_id", ministryId)
  for (const p of (profs ?? []) as { id: string; role: string | null }[]) {
    if (isAdminRole(p.role)) ids.add(p.id)
  }
  const { data: financeTeams } = await admin
    .from("teams").select("id").eq("ministry_id", ministryId).eq("team_type", "finance")
  const teamIds = (financeTeams ?? []).map((t: { id: string }) => t.id)
  if (teamIds.length > 0) {
    const { data: rows } = await admin
      .from("team_members")
      .select("user_id, team_roles!role_id(permissions)")
      .in("team_id", teamIds)
    for (const row of (rows ?? []) as { user_id: string; team_roles: { permissions?: string[] } | null }[]) {
      if ((row.team_roles?.permissions ?? []).includes("can_view_finances")) ids.add(row.user_id)
    }
  }
  return ids
}

async function adminTierIds(admin: AdminClient, ministryId: string): Promise<string[]> {
  const { data } = await admin.from("profiles").select("id, role").eq("ministry_id", ministryId)
  return ((data ?? []) as { id: string; role: string | null }[]).filter((p) => isAdminRole(p.role)).map((p) => p.id)
}

// ── v2: Receipt decision -> submitter (Tier 1, `activity`) ────────────────────
async function resolveReceiptDecision(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: r } = await admin
    .from("receipts")
    .select("id, submitted_by, amount, event_name, category, status")
    .eq("id", recordId)
    .single()
  if (!r || !r.submitted_by) return []
  const decided = ["approved", "rejected", "reimbursed", "declined"]
  if (!decided.includes(r.status)) return []

  const settings = await settingsFor(admin, r.submitted_by)
  if (settings.activity === false) return []

  const what = r.event_name || r.category || "receipt"
  const amt = money(r.amount)
  let title: string
  let body: string
  switch (r.status) {
    case "approved":
      title = "Receipt approved"; body = `${amt} for ${what} was approved.`; break
    case "reimbursed":
      title = "Receipt reimbursed"; body = `${amt} for ${what} has been reimbursed.`; break
    case "rejected":
      title = "Receipt not approved"; body = `${amt} for ${what} was not approved.`; break
    default: // declined
      title = "Receipt declined"; body = `${amt} for ${what} was declined.`; break
  }
  return [{
    userId: r.submitted_by,
    reason: `receipt_${r.status}`,
    payload: { title, body: preview(body), url: "/home?tab=plan&team=receipts", tag: `receipt-${r.id}` },
  }]
}

// ── v2: Receipt submitted -> treasurers (Tier 3, desk_web, web-only) ──────────
async function resolveReceiptSubmitted(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: r } = await admin
    .from("receipts")
    .select("id, ministry_id, submitted_by, submitted_by_name, amount, event_name, category, status")
    .eq("id", recordId)
    .single()
  if (!r || r.status !== "pending") return []

  const treasurers = await resolveTreasurers(admin, r.ministry_id)
  treasurers.delete(r.submitted_by) // the submitter isn't notified as a reviewer
  if (treasurers.size === 0) return []

  const what = r.event_name || r.category || "a purchase"
  const who = r.submitted_by_name || "A member"
  const body = preview(`${who} · ${money(r.amount)} — ${what}`)
  const results: Resolved[] = []
  for (const uid of treasurers) {
    const settings = await settingsFor(admin, uid)
    if (settings.desk_web === false) continue
    results.push({
      userId: uid,
      reason: "receipt_submitted",
      webOnly: true,
      payload: { title: "New receipt to review", body, url: "/home?tab=plan&team=receipts", tag: "receipt-inbox" },
    })
  }
  return results
}

// ── v2: Role change -> the person (Tier 1, `activity`) ────────────────────────
async function resolveRoleChange(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: p } = await admin
    .from("profiles")
    .select("id, role, notification_settings")
    .eq("id", recordId)
    .single()
  if (!p || !p.role) return []
  const settings = (p.notification_settings as NotificationSettings) ?? {}
  if (settings.activity === false) return []
  const label = roleLabel(p.role)
  return [{
    userId: p.id,
    reason: "role_change",
    payload: {
      title: "Your role changed",
      body: `You're now ${article(label)} ${label}.`,
      url: "/home?tab=profile",
      tag: `role-${p.id}`,
    },
  }]
}

// ── v2: New member joined -> admin-tier (Tier 3, desk_web, web-only) ──────────
async function resolveMemberJoined(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: p } = await admin
    .from("profiles")
    .select("id, name, ministry_id")
    .eq("id", recordId)
    .single()
  if (!p || !p.ministry_id) return []
  const admins = (await adminTierIds(admin, p.ministry_id)).filter((id) => id !== p.id)
  if (admins.length === 0) return []
  const name = p.name || "A new member"
  const results: Resolved[] = []
  for (const uid of admins) {
    const settings = await settingsFor(admin, uid)
    if (settings.desk_web === false) continue
    results.push({
      userId: uid,
      reason: "member_joined",
      webOnly: true,
      payload: { title: "New member joined", body: `${name} joined your ministry.`, url: "/home?tab=directory", tag: `member-joined-${p.id}` },
    })
  }
  return results
}

// ── v2: Task assignment -> assignee (Tier 1, `activity`) ──────────────────────
async function resolveTaskAssigned(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: t } = await admin
    .from("event_tasks")
    .select("id, title, assigned_to")
    .eq("id", recordId)
    .single()
  if (!t || !t.assigned_to) return []
  const settings = await settingsFor(admin, t.assigned_to)
  if (settings.activity === false) return []
  return [{
    userId: t.assigned_to,
    reason: "task_assigned",
    payload: {
      title: "New task assigned",
      body: preview(t.title || "You have a new task."),
      url: "/home?tab=plan",
      tag: `task-${t.id}`,
    },
  }]
}

// ── v2: Event-role assignment -> assignee (Tier 1, `activity`) ────────────────
async function resolveEventRoleAssigned(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: r } = await admin
    .from("event_roles")
    .select("id, role_name, assigned_to")
    .eq("id", recordId)
    .single()
  if (!r || !r.assigned_to) return []
  const settings = await settingsFor(admin, r.assigned_to)
  if (settings.activity === false) return []
  return [{
    userId: r.assigned_to,
    reason: "event_role_assigned",
    payload: {
      title: "You've been assigned a role",
      body: preview(r.role_name || "You have a new role."),
      url: "/home?tab=plan",
      tag: `event-role-${r.id}`,
    },
  }]
}

// ── v2: DGL week assignment -> assignee (Tier 1, `activity`) ──────────────────
async function resolveDglAssigned(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: a } = await admin
    .from("dgl_assignments")
    .select("id, user_id, team_id, week_date, slot, published")
    .eq("id", recordId)
    .single()
  if (!a || !a.user_id || a.published !== true) return []
  const settings = await settingsFor(admin, a.user_id)
  if (settings.activity === false) return []
  const slot = DGL_SLOT_LABEL[a.slot] ?? a.slot
  const week = formatWeek(a.week_date)
  return [{
    userId: a.user_id,
    reason: "dgl_assigned",
    payload: {
      title: "New DGL assignment",
      body: preview(week ? `${slot} · ${week}` : slot),
      url: a.team_id ? `/home?tab=plan&team=${a.team_id}` : "/home?tab=plan",
      // Coalesce a bulk-publish burst into one visible notification per person.
      tag: `dgl-${a.user_id}`,
    },
  }]
}

// ── v2: Pulse question -> all members (Tier 1, `activity`; author excluded) ───
async function resolvePulseQuestion(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: q } = await admin
    .from("congregation_questions")
    .select("id, ministry_id, created_by, question_text, is_active")
    .eq("id", recordId)
    .single()
  if (!q || q.is_active !== true) return []
  const { data: profs } = await admin
    .from("profiles")
    .select("id, notification_settings")
    .eq("ministry_id", q.ministry_id)
  if (!profs) return []
  const body = preview(q.question_text)
  const results: Resolved[] = []
  for (const p of profs as { id: string; notification_settings: NotificationSettings | null }[]) {
    if (p.id === q.created_by) continue
    const settings = (p.notification_settings as NotificationSettings) ?? {}
    if (settings.activity === false) continue
    results.push({
      userId: p.id,
      reason: "pulse_question",
      payload: { title: "A question from your pastor", body, url: "/home?tab=home", tag: `pulse-${q.id}` },
    })
  }
  return results
}

// ── v2: Form response -> announcement creator / form creator (Tier 3) ─────────
async function resolveFormResponse(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: resp } = await admin
    .from("form_responses")
    .select("id, form_id, announcement_id, user_id")
    .eq("id", recordId)
    .single()
  if (!resp) return []

  // Recipient = the announcement's creator; fall back to the form's creator when the
  // form isn't attached to an announcement.
  let recipient: string | null = null
  let contextTitle = "your form"
  if (resp.announcement_id) {
    const { data: ann } = await admin
      .from("announcements").select("created_by, title").eq("id", resp.announcement_id).single()
    recipient = ann?.created_by ?? null
    if (ann?.title) contextTitle = ann.title
  }
  if (!recipient && resp.form_id) {
    const { data: form } = await admin
      .from("announcement_forms").select("created_by, title").eq("id", resp.form_id).single()
    recipient = form?.created_by ?? null
    if (form?.title) contextTitle = form.title
  }
  if (!recipient || recipient === resp.user_id) return [] // no self-notify

  const settings = await settingsFor(admin, recipient)
  if (settings.desk_web === false) return []

  let responder = "Someone"
  if (resp.user_id) {
    const { data: prof } = await admin.from("profiles").select("name").eq("id", resp.user_id).single()
    responder = prof?.name ?? "Someone"
  }
  return [{
    userId: recipient,
    reason: "form_response",
    webOnly: true,
    payload: {
      title: "New form response",
      body: preview(`${responder} responded to ${contextTitle}.`),
      url: "/home?tab=forms",
      tag: `form-${resp.form_id ?? resp.id}`,
    },
  }]
}

export async function POST(req: NextRequest) {
  // 1. Shared-secret gate.
  const secret = req.headers.get("x-push-secret")
  if (!process.env.PUSH_WEBHOOK_SECRET || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let table: string
  let recordId: string
  let event: string | undefined
  try {
    const body = await req.json()
    table = body.table
    recordId = body.record_id
    event = body.event
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 })
  }
  if (!table || !recordId) {
    return NextResponse.json({ error: "missing-fields" }, { status: 400 })
  }

  const admin = createAdminClient()

  // 2. Resolve recipients per table (+ event discriminator for v2 senders that
  //    share a table).
  let resolved: Resolved[] = []
  try {
    if (table === "messages") resolved = await resolveMessage(admin, recordId)
    else if (table === "announcements") resolved = await resolveAnnouncement(admin, recordId)
    else if (table === "receipts" && event === "receipt_decision") resolved = await resolveReceiptDecision(admin, recordId)
    else if (table === "receipts" && event === "receipt_submitted") resolved = await resolveReceiptSubmitted(admin, recordId)
    else if (table === "profiles" && event === "role_change") resolved = await resolveRoleChange(admin, recordId)
    else if (table === "profiles" && event === "member_joined") resolved = await resolveMemberJoined(admin, recordId)
    else if (table === "event_tasks") resolved = await resolveTaskAssigned(admin, recordId)
    else if (table === "event_roles") resolved = await resolveEventRoleAssigned(admin, recordId)
    else if (table === "dgl_assignments") resolved = await resolveDglAssigned(admin, recordId)
    else if (table === "congregation_questions") resolved = await resolvePulseQuestion(admin, recordId)
    else if (table === "form_responses") resolved = await resolveFormResponse(admin, recordId)
    else return NextResponse.json({ error: "unsupported-table" }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "resolve-failed" },
      { status: 500 },
    )
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1"
  if (dryRun) {
    const reasons: Record<string, string> = {}
    const webOnly: Record<string, boolean> = {}
    for (const r of resolved) {
      reasons[r.userId] = r.reason
      if (r.webOnly) webOnly[r.userId] = true
    }
    return NextResponse.json({
      table,
      event: event ?? null,
      record_id: recordId,
      recipients: resolved.map((r) => r.userId),
      reasons,
      webOnly,
      count: resolved.length,
    })
  }

  if (resolved.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, pruned: 0, recipients: 0 })
  }

  // 3. Fetch each recipient's push subscriptions.
  if (!vapidReady()) {
    return NextResponse.json({ error: "vapid-not-configured" }, { status: 500 })
  }
  const userIds = [...new Set(resolved.map((r) => r.userId))]
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, platform")
    .in("user_id", userIds)
  const subsByUser = new Map<string, SubRow[]>()
  for (const s of (subs ?? []) as SubRow[]) {
    const list = subsByUser.get(s.user_id) ?? []
    list.push(s)
    subsByUser.set(s.user_id, list)
  }

  // 4. Fan out. One notification per (recipient × their subscriptions). Tier-3
  //    desk-work senders (webOnly) deliver ONLY to platform='web' subs — the desk
  //    default; mobile (ios-pwa) subs get the daily digest instead, never a push.
  type SendResult = { ok: boolean; prune?: string }
  const sends: Promise<SendResult>[] = []
  for (const r of resolved) {
    let list = subsByUser.get(r.userId) ?? []
    if (r.webOnly) list = list.filter((s) => s.platform === "web")
    const json = JSON.stringify(r.payload)
    for (const sub of list) {
      sends.push(
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            json,
            { TTL: 60 * 60 * 24 },
          )
          .then<SendResult>(() => ({ ok: true }))
          .catch<SendResult>((err: unknown) => {
            const status = err instanceof WebPushError ? err.statusCode : 0
            if (status === 404 || status === 410) return { ok: false, prune: sub.id }
            return { ok: false }
          }),
      )
    }
  }

  const outcomes = await Promise.allSettled(sends)
  let sent = 0
  let failed = 0
  const toPrune: string[] = []
  for (const o of outcomes) {
    if (o.status === "fulfilled") {
      if (o.value.ok) sent++
      else {
        failed++
        if (o.value.prune) toPrune.push(o.value.prune)
      }
    } else {
      failed++
    }
  }

  // 5. Prune dead endpoints.
  if (toPrune.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", toPrune)
  }

  return NextResponse.json({
    sent,
    failed,
    pruned: toPrune.length,
    recipients: resolved.length,
  })
}
