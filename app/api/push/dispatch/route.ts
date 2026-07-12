import { NextRequest, NextResponse } from "next/server"
import webpush, { WebPushError } from "web-push"
import { createAdminClient } from "@/lib/supabase-admin"
import type { NotificationSettings } from "@/app/home/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ── Web Push v1 dispatch ─────────────────────────────────────────────────────
// A Postgres AFTER-INSERT trigger POSTs { table, record_id } here with the shared
// secret in `x-push-secret`. We re-read the row with the service-role client (never
// trust the payload), resolve recipients + per-user prefs + per-chat mutes + the
// ≥30 smart threshold, then fan out via web-push, pruning dead (404/410) endpoints.

type PushPayload = { title: string; body: string; url: string; tag: string }
type Resolved = { userId: string; reason: string; payload: PushPayload }

interface SubRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
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

export async function POST(req: NextRequest) {
  // 1. Shared-secret gate.
  const secret = req.headers.get("x-push-secret")
  if (!process.env.PUSH_WEBHOOK_SECRET || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let table: string
  let recordId: string
  try {
    const body = await req.json()
    table = body.table
    recordId = body.record_id
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 })
  }
  if (!table || !recordId) {
    return NextResponse.json({ error: "missing-fields" }, { status: 400 })
  }

  const admin = createAdminClient()

  // 2. Resolve recipients per table.
  let resolved: Resolved[] = []
  try {
    if (table === "messages") resolved = await resolveMessage(admin, recordId)
    else if (table === "announcements") resolved = await resolveAnnouncement(admin, recordId)
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
    for (const r of resolved) reasons[r.userId] = r.reason
    return NextResponse.json({
      table,
      record_id: recordId,
      recipients: resolved.map((r) => r.userId),
      reasons,
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
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds)
  const subsByUser = new Map<string, SubRow[]>()
  for (const s of (subs ?? []) as SubRow[]) {
    const list = subsByUser.get(s.user_id) ?? []
    list.push(s)
    subsByUser.set(s.user_id, list)
  }

  // 4. Fan out. One notification per (recipient × their subscriptions).
  type SendResult = { ok: boolean; prune?: string }
  const sends: Promise<SendResult>[] = []
  for (const r of resolved) {
    const list = subsByUser.get(r.userId) ?? []
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
