import { NextRequest, NextResponse } from "next/server"
import webpush, { WebPushError } from "web-push"
import { createAdminClient } from "@/lib/supabase-admin"
import { apnsReady, sendApnsNotification } from "@/lib/apns"
import { isAdminRole } from "@/lib/roles"
import type { NotificationSettings } from "@/app/home/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ── Web Push dispatch (v1 messages/announcements + v2 event-driven + v2b cron) ──
// A Postgres AFTER trigger POSTs { table, record_id, event? } here with the shared
// secret in `x-push-secret`. We re-read the row with the service-role client (never
// trust the payload), resolve recipients + per-user prefs + per-chat mutes + the
// ≥30 smart threshold, then fan out via web-push, pruning dead (404/410) endpoints.
//
// v2 adds an `event` discriminator (from the trigger's TG_ARGV[0]) so several senders
// can share one table (receipts submitted vs decision; profiles role-change vs join).
// Tier-1 senders honor the `activity` pref; Tier-3 (desk-work) senders honor `desk_web`
// AND are delivered ONLY to platform='web' subscriptions (webOnly on the Resolved).
//
// v2b adds two CRON-driven senders (no source row of their own):
//   • event_reminder (Tier 1): a pg_cron job (`enqueue_due_event_reminders`) finds
//     events starting within ~2h and POSTs { table:'announcements', record_id, event:
//     'event_reminder' } once per event; the resolver pushes every RSVP'd user (ALL
//     platforms). Honors the `announcements` pref (see build-report §Pref choice).
//   • desk_digest (Tier 3, mobile): a daily pg_cron job POSTs { event:'desk_digest' }
//     with NO record_id; the resolver fans across ALL ministries in one invocation,
//     computes per-recipient 24h pending counts, and emits ONE summary per eligible
//     leader/admin — delivered ONLY to their NON-web subs (mobileOnly on the Resolved).

type PushPayload = { title: string; body: string; url: string; tag: string }
// webOnly   = Tier-3 desk-work push: deliver to this recipient's platform='web' subs only.
// mobileOnly = Tier-3 daily digest: deliver to this recipient's platform!='web' subs only.
// counts     = digest per-recipient item breakdown (surfaced in dryRun for verification).
type Resolved = {
  userId: string
  reason: string
  payload: PushPayload
  webOnly?: boolean
  mobileOnly?: boolean
  counts?: { forms: number; receipts: number; members: number }
}

interface SubRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string | null // NULL on platform='ios-native' (APNs token rows — filtered out before web-push send)
  auth: string | null
  platform: string
}

const SMART_THRESHOLD = 30 // mirrors read-receipt large-room threshold (Convention #18)

// The subset of a recipient's subscriptions a given Resolved actually delivers to,
// after Tier-3 platform gating. Shared by dryRun's routing breakdown and the real
// fan-out so both agree exactly:
//   • webOnly (Tier-3 desk-work) → platform='web' ONLY (excludes ios-pwa AND ios-native)
//   • mobileOnly (Tier-3 digest) → platform!='web' (ios-pwa + ios-native, the mobile subs)
//   • neither → all platforms
// After gating, ios-native rows go to the APNs lane; web/ios-pwa go to web-push.
function subsForRecipient(r: Resolved, all: SubRow[]): SubRow[] {
  if (r.webOnly) return all.filter((s) => s.platform === "web")
  if (r.mobileOnly) return all.filter((s) => s.platform !== "web")
  return all
}

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

// Ministry sign-off authorities — mirrors finance-auth.computeFinanceCapability's
// canSignOff: admin-tier (fallback) OR `is_president` on a team_type='finance' team.
async function resolveSignoffIds(admin: AdminClient, ministryId: string): Promise<Set<string>> {
  const ids = new Set<string>()
  const { data: profs } = await admin.from("profiles").select("id, role").eq("ministry_id", ministryId)
  for (const p of (profs ?? []) as { id: string; role: string | null }[]) {
    if (isAdminRole(p.role)) ids.add(p.id)
  }
  const { data: financeTeams } = await admin
    .from("teams").select("id").eq("ministry_id", ministryId).eq("team_type", "finance")
  const teamIds = (financeTeams ?? []).map((t: { id: string }) => t.id)
  if (teamIds.length > 0) {
    const { data: rows } = await admin
      .from("team_members")
      .select("user_id, team_roles!role_id(is_president)")
      .in("team_id", teamIds)
    for (const row of (rows ?? []) as { user_id: string; team_roles: { is_president?: boolean } | null }[]) {
      if (row.team_roles?.is_president) ids.add(row.user_id)
    }
  }
  return ids
}

// event_date is timestamptz (UTC — the composer writes `new Date(local).toISOString()`).
// There is NO per-ministry timezone column (verified), so absolute reminder times are
// rendered in a single platform-default zone; documented in build-report §Timezone.
// A follow-on to add `ministries.timezone` would make this per-ministry correct.
const DEFAULT_EVENT_TZ = "America/Los_Angeles"
function eventTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: DEFAULT_EVENT_TZ })
}

// Today's / tomorrow's calendar date in PT as 'YYYY-MM-DD' (matches event_tasks.due_date,
// a plain DATE). en-CA formats as ISO date; tomorrow is computed from a UTC-anchored copy of
// today so it's DST-safe (we only ever add one calendar day to a date-only string).
function ptDate(offsetDays = 0): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: DEFAULT_EVENT_TZ })
  if (offsetDays === 0) return today
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

// event_plan → { team (for deep-link), event title, plan creator, ministry } via calendar_events.
// Sequential single-table reads to match the resolver style above.
type PlanContext = { teamId: string | null; eventTitle: string; createdBy: string | null; ministryId: string | null }
async function planContext(admin: AdminClient, eventPlanId: string): Promise<PlanContext> {
  const { data: ep } = await admin
    .from("event_plans")
    .select("id, ministry_id, created_by, calendar_event_id")
    .eq("id", eventPlanId)
    .single()
  if (!ep) return { teamId: null, eventTitle: "", createdBy: null, ministryId: null }
  let teamId: string | null = null
  let eventTitle = ""
  if (ep.calendar_event_id) {
    const { data: ce } = await admin
      .from("calendar_events")
      .select("title, team_id")
      .eq("id", ep.calendar_event_id)
      .single()
    teamId = ce?.team_id ?? null
    eventTitle = ce?.title ?? ""
  }
  return { teamId, eventTitle, createdBy: ep.created_by ?? null, ministryId: ep.ministry_id ?? null }
}

function planUrl(teamId: string | null): string {
  return teamId ? `/home?tab=plan&team=${teamId}` : "/home?tab=plan"
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

// ── Run Sheet: Task due nudge -> assignee (Tier 1, NEW `deadlines` pref) ──────
// Cron-driven (run_sheet_tick, offsets due_tomorrow/due_today). Two nudges max, no re-nag.
async function resolveTaskDue(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: t } = await admin
    .from("event_tasks")
    .select("id, title, assigned_to, completed, due_date, event_plan_id")
    .eq("id", recordId)
    .single()
  if (!t || t.completed === true || !t.assigned_to) return []

  const settings = await settingsFor(admin, t.assigned_to)
  if (settings.deadlines === false) return []

  // Wording keys off due_date (a DATE) vs today/tomorrow in PT.
  const title = t.title || "a task"
  let body: string
  if (t.due_date === ptDate(0)) body = `Due today: ${title}`
  else if (t.due_date === ptDate(1)) body = `Due tomorrow: ${title}`
  else body = `Task due soon: ${title}`

  const { teamId } = await planContext(admin, t.event_plan_id)
  return [{
    userId: t.assigned_to,
    reason: "task_due",
    payload: {
      title: "Task reminder",
      body: preview(body),
      url: planUrl(teamId),
      tag: `task-due-${t.id}`,
    },
  }]
}

// ── Run Sheet: Confirmation request -> the assigned role-holder (Tier 1, `deadlines`) ──
// Cron/action-driven. Skips if the row is no longer 'requested' (a race: already responded).
async function resolveConfirmRequest(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: c } = await admin
    .from("event_confirmations")
    .select("id, user_id, status, subject_type, subject_id, event_plan_id")
    .eq("id", recordId)
    .single()
  if (!c || c.status !== "requested" || !c.user_id) return []

  const settings = await settingsFor(admin, c.user_id)
  if (settings.deadlines === false) return []

  let roleName = "your role"
  if (c.subject_type === "role") {
    const { data: role } = await admin
      .from("event_roles")
      .select("role_name")
      .eq("id", c.subject_id)
      .single()
    if (!role) return [] // role deleted out from under the confirmation → no misleading ping
    roleName = role.role_name || roleName
  }

  const { teamId, eventTitle } = await planContext(admin, c.event_plan_id)
  const evTitle = eventTitle || "your event"
  return [{
    userId: c.user_id,
    reason: "confirm_request",
    payload: {
      title: "Please confirm",
      body: preview(`${evTitle}: confirm you're set for ${roleName}`),
      url: planUrl(teamId),
      tag: `confirm-${c.id}`,
    },
  }]
}

// ── Run Sheet: Confirmation escalation -> the event creator (Tier 1, `activity`) ──
// Cron-driven (24h silence). Recipient = event_plan.created_by; falls back to ministry
// admin-tier if the creator is gone / no longer in the ministry.
async function resolveConfirmEscalation(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: c } = await admin
    .from("event_confirmations")
    .select("id, user_id, status, subject_type, subject_id, event_plan_id, ministry_id")
    .eq("id", recordId)
    .single()
  if (!c || c.status !== "escalated") return []

  const { teamId, eventTitle, createdBy, ministryId } = await planContext(admin, c.event_plan_id)
  const planMinistry = ministryId ?? c.ministry_id

  // Recipient resolution: creator if still a member of the plan's ministry, else admin-tier fallback.
  let recipientIds: string[] = []
  if (createdBy) {
    const { data: creator } = await admin
      .from("profiles")
      .select("id, ministry_id")
      .eq("id", createdBy)
      .maybeSingle()
    if (creator && creator.ministry_id === planMinistry) recipientIds = [createdBy]
  }
  if (recipientIds.length === 0 && planMinistry) {
    recipientIds = await adminTierIds(admin, planMinistry)
  }
  if (recipientIds.length === 0) return []

  // The silent user's name + the role they went quiet on.
  let userName = "Someone"
  if (c.user_id) {
    const { data: prof } = await admin.from("profiles").select("name").eq("id", c.user_id).single()
    userName = prof?.name ?? "Someone"
  }
  let roleName = "their role"
  if (c.subject_type === "role") {
    const { data: role } = await admin.from("event_roles").select("role_name").eq("id", c.subject_id).single()
    roleName = role?.role_name || roleName
  }
  const evTitle = eventTitle || "an event"

  const results: Resolved[] = []
  for (const uid of recipientIds) {
    if (uid === c.user_id) continue // don't escalate a person to themselves
    const settings = await settingsFor(admin, uid)
    if (settings.activity === false) continue
    results.push({
      userId: uid,
      reason: "confirm_escalation",
      payload: {
        title: "Confirmation needed",
        body: preview(`${userName} hasn't confirmed ${roleName} for ${evTitle}`),
        url: planUrl(teamId),
        tag: `confirm-esc-${c.id}`,
      },
    })
  }
  return results
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

// ── v2b: Event reminder -> everyone who RSVP'd (Tier 1, `announcements`, ALL platforms) ──
// Fired by the `enqueue_due_event_reminders` cron ~2h before an event. The cron already
// scopes to future, published, unsent events; the future-guard here is defense-in-depth
// so a stray/replayed call never reminds a past or already-started event.
async function resolveEventReminder(admin: AdminClient, recordId: string): Promise<Resolved[]> {
  const { data: ann } = await admin
    .from("announcements")
    .select("id, ministry_id, title, event_date, is_event, status")
    .eq("id", recordId)
    .single()
  if (!ann || ann.is_event !== true || ann.status !== "published" || !ann.event_date) return []
  if (new Date(ann.event_date).getTime() <= Date.now()) return [] // never remind a started/past event

  const { data: rsvps } = await admin.from("rsvps").select("user_id").eq("announcement_id", recordId)
  const userIds = [...new Set(((rsvps ?? []) as { user_id: string | null }[]).map((r) => r.user_id).filter(Boolean))] as string[]
  if (userIds.length === 0) return []

  const { data: profs } = await admin.from("profiles").select("id, notification_settings").in("id", userIds)
  const time = eventTime(ann.event_date)
  const title = "Starting soon"
  const body = time
    ? `${ann.title || "An event you're attending"} at ${time}`
    : ann.title || "An event you're attending is starting soon."

  const results: Resolved[] = []
  for (const p of (profs ?? []) as { id: string; notification_settings: NotificationSettings | null }[]) {
    const settings = (p.notification_settings as NotificationSettings) ?? {}
    if (settings.announcements === false) continue // event reminders ride the announcements pref
    results.push({
      userId: p.id,
      reason: "event_reminder",
      payload: {
        title,
        body: preview(body),
        url: `/home?tab=announcements&ann=${ann.id}`,
        tag: `event-reminder-${ann.id}`,
      },
    })
  }
  return results
}

// ── v2b: Desk digest -> eligible leaders/admins across ALL ministries (Tier 3, mobile) ──
// One daily summary per recipient of their last-24h desk work. Delivered ONLY to non-web
// subs (mobileOnly); the web equivalents already fired live via the Tier-3 `desk_web`
// senders. Recipients with zero items get NOTHING (an empty digest is spam). Queries are
// aggregated per ministry then mapped to recipients — no per-user round-trips.
async function resolveDeskDigest(admin: AdminClient): Promise<Resolved[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // 1. Candidate recipients = users with at least one NON-web subscription. (Web-only
  //    users can't receive a mobile digest, so they never enter the candidate set.)
  const { data: subs } = await admin.from("push_subscriptions").select("user_id, platform").neq("platform", "web")
  const candidateIds = [...new Set(((subs ?? []) as { user_id: string | null }[]).map((s) => s.user_id).filter(Boolean))] as string[]
  if (candidateIds.length === 0) return []

  // 2. Their profiles (ministry + role + prefs). Honor desk_digest here.
  const { data: profs } = await admin
    .from("profiles").select("id, ministry_id, role, notification_settings").in("id", candidateIds)
  type Cand = { id: string; ministryId: string; role: string | null }
  const byMinistry = new Map<string, Cand[]>()
  for (const p of (profs ?? []) as { id: string; ministry_id: string | null; role: string | null; notification_settings: NotificationSettings | null }[]) {
    if (!p.ministry_id) continue
    const settings = (p.notification_settings as NotificationSettings) ?? {}
    if (settings.desk_digest === false) continue
    const list = byMinistry.get(p.ministry_id) ?? []
    list.push({ id: p.id, ministryId: p.ministry_id, role: p.role })
    byMinistry.set(p.ministry_id, list)
  }
  if (byMinistry.size === 0) return []

  const results: Resolved[] = []
  for (const [ministryId, group] of byMinistry) {
    // a. Form responses in the last 24h -> tally by the response's recipient
    //    (announcement creator, fallback form creator — mirrors resolveFormResponse).
    const forms = new Map<string, number>()
    const { data: fr } = await admin
      .from("form_responses").select("id, form_id, announcement_id")
      .eq("ministry_id", ministryId).gte("submitted_at", since)
    if (fr && fr.length > 0) {
      const annIds = [...new Set((fr as { announcement_id: string | null }[]).map((r) => r.announcement_id).filter(Boolean))] as string[]
      const formIds = [...new Set((fr as { form_id: string | null }[]).map((r) => r.form_id).filter(Boolean))] as string[]
      const annCreator = new Map<string, string>()
      if (annIds.length > 0) {
        const { data: anns } = await admin.from("announcements").select("id, created_by").in("id", annIds)
        for (const a of (anns ?? []) as { id: string; created_by: string | null }[]) if (a.created_by) annCreator.set(a.id, a.created_by)
      }
      const formCreator = new Map<string, string>()
      if (formIds.length > 0) {
        const { data: fms } = await admin.from("announcement_forms").select("id, created_by").in("id", formIds)
        for (const f of (fms ?? []) as { id: string; created_by: string | null }[]) if (f.created_by) formCreator.set(f.id, f.created_by)
      }
      for (const r of fr as { announcement_id: string | null; form_id: string | null }[]) {
        const creator = (r.announcement_id && annCreator.get(r.announcement_id)) || (r.form_id && formCreator.get(r.form_id)) || null
        if (creator) forms.set(creator, (forms.get(creator) ?? 0) + 1)
      }
    }

    // b. Receipts awaiting action in the last 24h: pending (treasurer) + approved (president).
    const { data: pend } = await admin.from("receipts").select("id").eq("ministry_id", ministryId).eq("status", "pending").gte("submitted_at", since)
    const pendingReceipts = (pend ?? []).length
    const { data: appr } = await admin.from("receipts").select("id").eq("ministry_id", ministryId).eq("status", "approved").gte("reviewed_at", since)
    const approvedReceipts = (appr ?? []).length

    // c. New members joined in the last 24h (membership creation is the join moment).
    const { data: um } = await admin.from("user_ministries").select("id").eq("ministry_id", ministryId).gte("created_at", since)
    const joins = (um ?? []).length

    // Finance capability sets computed once per ministry, only when relevant.
    const treasurers = pendingReceipts > 0 ? await resolveTreasurers(admin, ministryId) : new Set<string>()
    const signers = approvedReceipts > 0 ? await resolveSignoffIds(admin, ministryId) : new Set<string>()

    for (const c of group) {
      const formCount = forms.get(c.id) ?? 0
      let receiptCount = 0
      if (treasurers.has(c.id)) receiptCount += pendingReceipts
      if (signers.has(c.id)) receiptCount += approvedReceipts
      const memberCount = joins > 0 && isAdminRole(c.role) ? joins : 0

      const clauses: string[] = []
      if (formCount > 0) clauses.push(`${formCount} form response${formCount === 1 ? "" : "s"}`)
      if (receiptCount > 0) clauses.push(`${receiptCount} receipt${receiptCount === 1 ? "" : "s"} awaiting review`)
      if (memberCount > 0) clauses.push(`${memberCount} new member${memberCount === 1 ? "" : "s"}`)
      if (clauses.length === 0) continue // zero items -> no digest

      results.push({
        userId: c.id,
        reason: "desk_digest",
        mobileOnly: true,
        counts: { forms: formCount, receipts: receiptCount, members: memberCount },
        payload: {
          title: "Your daily summary",
          body: clauses.slice(0, 3).join(" · "),
          url: "/home?tab=home",
          tag: "desk-digest",
        },
      })
    }
  }
  return results
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
  // desk_digest is a cron-driven global event with NO source row (no table/record_id).
  if (event !== "desk_digest" && (!table || !recordId)) {
    return NextResponse.json({ error: "missing-fields" }, { status: 400 })
  }

  const admin = createAdminClient()

  // 2. Resolve recipients per table (+ event discriminator for v2 senders that
  //    share a table, and v2b cron senders keyed on `event` alone).
  let resolved: Resolved[] = []
  try {
    if (event === "desk_digest") resolved = await resolveDeskDigest(admin)
    else if (table === "messages") resolved = await resolveMessage(admin, recordId)
    else if (table === "announcements" && event === "event_reminder") resolved = await resolveEventReminder(admin, recordId)
    else if (table === "announcements") resolved = await resolveAnnouncement(admin, recordId)
    else if (table === "receipts" && event === "receipt_decision") resolved = await resolveReceiptDecision(admin, recordId)
    else if (table === "receipts" && event === "receipt_submitted") resolved = await resolveReceiptSubmitted(admin, recordId)
    else if (table === "profiles" && event === "role_change") resolved = await resolveRoleChange(admin, recordId)
    else if (table === "profiles" && event === "member_joined") resolved = await resolveMemberJoined(admin, recordId)
    else if (table === "event_tasks" && event === "task_due") resolved = await resolveTaskDue(admin, recordId)
    else if (table === "event_tasks") resolved = await resolveTaskAssigned(admin, recordId)
    else if (table === "event_confirmations" && event === "confirm_request") resolved = await resolveConfirmRequest(admin, recordId)
    else if (table === "event_confirmations" && event === "confirm_escalation") resolved = await resolveConfirmEscalation(admin, recordId)
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

  // 3. Fetch each recipient's push subscriptions (shared by dryRun's routing
  //    breakdown and the real fan-out).
  const userIds = [...new Set(resolved.map((r) => r.userId))]
  const subsByUser = new Map<string, SubRow[]>()
  if (userIds.length > 0) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth, platform")
      .in("user_id", userIds)
    for (const s of (subs ?? []) as SubRow[]) {
      const list = subsByUser.get(s.user_id) ?? []
      list.push(s)
      subsByUser.set(s.user_id, list)
    }
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1"
  if (dryRun) {
    const reasons: Record<string, string> = {}
    const webOnly: Record<string, boolean> = {}
    const mobileOnly: Record<string, boolean> = {}
    const counts: Record<string, { forms: number; receipts: number; members: number }> = {}
    // Per-recipient lane routing after platform gating: how many web-push subs
    // (web + ios-pwa) vs how many APNs subs (ios-native) this recipient delivers to.
    // Lets tests assert routing (native → apns lane on Tier-1, EXCLUDED on Tier-3
    // webOnly) without sending a single notification.
    const routing: Record<string, { web: number; native: number }> = {}
    let webLane = 0
    let apnsLane = 0
    for (const r of resolved) {
      reasons[r.userId] = r.reason
      if (r.webOnly) webOnly[r.userId] = true
      if (r.mobileOnly) mobileOnly[r.userId] = true
      if (r.counts) counts[r.userId] = r.counts
      const list = subsForRecipient(r, subsByUser.get(r.userId) ?? [])
      const web = list.filter((s) => s.platform !== "ios-native").length
      const native = list.filter((s) => s.platform === "ios-native").length
      routing[r.userId] = { web, native }
      webLane += web
      apnsLane += native
    }
    return NextResponse.json({
      table: table ?? null,
      event: event ?? null,
      record_id: recordId ?? null,
      recipients: resolved.map((r) => r.userId),
      reasons,
      webOnly,
      mobileOnly,
      counts,
      routing,
      lanes: { web: webLane, apns: apnsLane },
      count: resolved.length,
    })
  }

  if (resolved.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, pruned: 0, recipients: 0 })
  }

  if (!vapidReady()) {
    return NextResponse.json({ error: "vapid-not-configured" }, { status: 500 })
  }
  const apnsOk = apnsReady()

  // 4. Fan out. One notification per (recipient × their gated subscriptions).
  //    ios-native rows go to APNs (sendApnsNotification); web + ios-pwa keep
  //    web-push. Prune parity: APNs 410/Unregistered/BadDeviceToken prunes the row
  //    exactly like web-push 404/410; transient errors are failed sends, no prune.
  type SendResult = { ok: boolean; prune?: string }
  const sends: Promise<SendResult>[] = []
  for (const r of resolved) {
    const list = subsForRecipient(r, subsByUser.get(r.userId) ?? [])
    const json = JSON.stringify(r.payload)
    for (const sub of list) {
      if (sub.platform === "ios-native") {
        // Native APNs lane. endpoint is 'apns:<token>' — strip the prefix.
        const token = sub.endpoint.startsWith("apns:") ? sub.endpoint.slice(5) : sub.endpoint
        if (!apnsOk || !token) {
          // No APNs env (dev slot without the key) → preserve the pre-APNs skip.
          console.log(`[push] TODO(apns): APNs client not configured — skipping ios-native subscription for user ${r.userId} (${r.reason})`)
          continue
        }
        sends.push(
          sendApnsNotification({
            token,
            title: r.payload.title,
            body: r.payload.body,
            url: r.payload.url,
            tag: r.payload.tag,
          })
            .then<SendResult>((res) =>
              res.ok ? { ok: true } : { ok: false, prune: res.prune ? sub.id : undefined },
            )
            .catch<SendResult>(() => ({ ok: false })),
        )
        continue
      }
      // Web-push lane (web + ios-pwa). Both carry real p256dh/auth keys.
      if (!sub.p256dh || !sub.auth) continue
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
