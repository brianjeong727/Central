// Shared E2E fixtures: storage-state paths + a service-role sandbox helper.
//
// Every data helper here is HARD-SCOPED to the E2E sandbox ministry
// (E2E_MINISTRY_ID) and refuses to run without it — so a misconfigured run can
// never arrange or delete data in a real congregation. All test rows carry the
// "E2E::" title prefix so cleanup is surgical (deleteAnnouncementsByPrefix /
// deleteGroupsByPrefix).
//
// Node caveat: supabase-js needs an explicit WebSocket impl under Node < 22, or
// createClient throws at construction — hence `realtime: { transport: ws }`.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import ws from "ws"
import { loadEnv } from "./load-env"

// supabase-js's `realtime.transport` expects a browser-ish WebSocket constructor;
// the `ws` default export is structurally compatible at runtime (this is the same
// pattern scripts/seed-e2e.mjs uses) but its constructor signature differs under
// strict TS. Cast through the option type so the assertion stays precise.
type ClientOptions = NonNullable<Parameters<typeof createClient>[2]>
type RealtimeTransport = NonNullable<NonNullable<ClientOptions["realtime"]>["transport"]>
const wsTransport = ws as unknown as RealtimeTransport

loadEnv()

// Storage states written by e2e/auth.setup.ts. Specs that need the member
// session opt in with `test.use({ storageState: memberState })`.
export const adminState = "e2e/.auth/admin.json"
export const memberState = "e2e/.auth/member.json"

// Every arranged row starts with this. Cleanup matches on it.
export const E2E_PREFIX = "E2E::"

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`[e2e/fixtures] missing required env var: ${key}`)
  return v
}

let _client: SupabaseClient | null = null
function serviceClient(): SupabaseClient {
  if (_client) return _client
  _client = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: wsTransport },
    },
  )
  return _client
}

let _adminId: string | null = null
async function adminUserId(db: SupabaseClient): Promise<string> {
  if (_adminId) return _adminId
  const email = requireEnv("E2E_ADMIN_EMAIL")
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const u = data.users.find((x) => x.email === email)
  if (!u) throw new Error(`[e2e/fixtures] sandbox admin user not found: ${email}`)
  _adminId = u.id
  return _adminId
}

let _memberId: string | null = null
async function memberUserId(db: SupabaseClient): Promise<string> {
  if (_memberId) return _memberId
  const email = requireEnv("E2E_MEMBER_EMAIL")
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const u = data.users.find((x) => x.email === email)
  if (!u) throw new Error(`[e2e/fixtures] sandbox member user not found: ${email}`)
  _memberId = u.id
  return _memberId
}

export interface CreateAnnouncementInput {
  title: string
  body: string
  is_event?: boolean
  is_pinned?: boolean
  /** Event start time (timestamptz ISO). Only meaningful with is_event=true; used by
   *  the v2b event-reminder sender. */
  event_date?: string | null
  /** Override the author. Pass `null` for an unattributed announcement (e.g. to
   *  test recipient resolution without the "exclude the creator" rule kicking in).
   *  Defaults to the sandbox admin, matching prior behavior. */
  created_by?: string | null
}

/**
 * Service-role helpers, pre-scoped to the E2E sandbox ministry. Constructing
 * this hard-requires E2E_MINISTRY_ID, so a run with a missing/blank sandbox id
 * fails loudly before touching the database.
 */
export function sandbox() {
  const ministryId = requireEnv("E2E_MINISTRY_ID")
  const db = serviceClient()

  return {
    ministryId,
    client: db,

    /** Resolve the sandbox admin's auth user id (cached). */
    adminUserId: () => adminUserId(db),
    /** Resolve the sandbox member's auth user id (cached). */
    memberUserId: () => memberUserId(db),

    /** Insert a published announcement into the sandbox ministry. The title is
     *  force-prefixed with "E2E::" if the caller didn't already, so nothing this
     *  helper writes can escape prefix-based cleanup. */
    async createAnnouncement({ title, body, is_event = false, is_pinned = false, event_date = null, created_by }: CreateAnnouncementInput) {
      const author = created_by === undefined ? await adminUserId(db) : created_by
      const fullTitle = title.startsWith(E2E_PREFIX) ? title : `${E2E_PREFIX}${title}`
      const { data, error } = await db
        .from("announcements")
        .insert({
          title: fullTitle,
          body,
          is_event,
          is_pinned,
          event_date,
          audience: "all",
          status: "published",
          ministry_id: ministryId,
          created_by: author,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },

    /** RSVP a user to an announcement (idempotent upsert, matching the app's toggle
     *  upsert). Used by the v2b event-reminder sender tests. */
    async insertRsvp({ announcementId, userId }: { announcementId: string; userId: string }) {
      const { error } = await db
        .from("rsvps")
        .upsert({ announcement_id: announcementId, user_id: userId }, { onConflict: "announcement_id,user_id" })
      if (error) throw error
    },

    /** Remove all RSVPs for the given announcement ids (rsvps cascade off announcements,
     *  but the digest/reminder tests delete rsvps explicitly to stay surgical). */
    async deleteRsvpsForAnnouncements(announcementIds: string[]) {
      if (announcementIds.length === 0) return
      const { error } = await db.from("rsvps").delete().in("announcement_id", announcementIds)
      if (error) throw error
    },

    /** Delete every sandbox announcement whose title starts with `prefix`
     *  (defaults to the full "E2E::" namespace). Scoped to the sandbox ministry. */
    async deleteAnnouncementsByPrefix(prefix: string = E2E_PREFIX) {
      const { error } = await db
        .from("announcements")
        .delete()
        .eq("ministry_id", ministryId)
        .like("title", `${prefix}%`)
      if (error) throw error
    },

    /** Create a "my"-type group + membership rows for the given user ids. Name is
     *  force-prefixed with "E2E::". `group_members`/`messages` both cascade-delete
     *  off `groups`, so cleanup only needs to delete the group row. */
    async createGroup({ name, memberIds }: { name: string; memberIds: string[] }) {
      const creator = memberIds[0] ?? (await adminUserId(db))
      const fullName = name.startsWith(E2E_PREFIX) ? name : `${E2E_PREFIX}${name}`
      const { data: group, error } = await db
        .from("groups")
        .insert({ ministry_id: ministryId, name: fullName, type: "my", created_by: creator })
        .select()
        .single()
      if (error) throw error
      const { error: memErr } = await db
        .from("group_members")
        .insert(memberIds.map((user_id) => ({ group_id: group.id, user_id })))
      if (memErr) throw memErr
      return group
    },

    /** Delete every sandbox group whose name starts with `prefix` (cascades to
     *  group_members + messages). Scoped to the sandbox ministry. */
    async deleteGroupsByPrefix(prefix: string = E2E_PREFIX) {
      const { error } = await db
        .from("groups")
        .delete()
        .eq("ministry_id", ministryId)
        .like("name", `${prefix}%`)
      if (error) throw error
    },

    /** Flip a member's per-chat mute flag (group_members.muted — the hard override
     *  the push dispatch route checks before anything else). */
    async setGroupMemberMuted(groupId: string, userId: string, muted: boolean) {
      const { error } = await db
        .from("group_members")
        .update({ muted })
        .eq("group_id", groupId)
        .eq("user_id", userId)
      if (error) throw error
    },

    /** Insert a chat message directly (bypasses the composer). Fires the real
     *  `notify_new_message` DB trigger (fire-and-forget pg_net POST to the prod
     *  dispatch URL per app_config) — harmless no-op against fake/absent
     *  subscriptions, but tests should resolve recipients via a direct localhost
     *  dryRun POST rather than relying on that trigger. */
    async insertMessage({ groupId, senderId, content }: { groupId: string; senderId: string; content: string }) {
      const { data, error } = await db
        .from("messages")
        .insert({ group_id: groupId, sender_id: senderId, content, message_type: "text" })
        .select()
        .single()
      if (error) throw error
      return data
    },

    /** Reset a sandbox user's notification_settings to {} (defaults). */
    async resetNotificationSettings(userId: string) {
      const { error } = await db
        .from("profiles")
        .update({ notification_settings: {} })
        .eq("id", userId)
        .eq("ministry_id", ministryId)
      if (error) throw error
    },

    /** Directly insert a push_subscriptions row (bypassing the claim_push_endpoint
     *  RPC / real PushManager — used as the documented fallback when a headless
     *  browser can't complete a real subscribe(), per e2e/push.spec.ts). */
    async insertPushSubscription({
      userId,
      endpoint,
      platform = "web",
    }: {
      userId: string
      endpoint: string
      platform?: string
    }) {
      const { data, error } = await db
        .from("push_subscriptions")
        .insert({
          user_id: userId,
          ministry_id: ministryId,
          endpoint,
          p256dh: "E2E-fake-p256dh-key-000000000000000000000",
          auth: "E2E-fake-auth-key-0000000",
          platform,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },

    /** Delete every push_subscriptions row for a given user (cleanup for the
     *  fallback-created fake subscriptions above). */
    async deletePushSubscriptionsForUser(userId: string) {
      const { error } = await db.from("push_subscriptions").delete().eq("user_id", userId)
      if (error) throw error
    },

    // ── Web Push v2 sender fixtures ─────────────────────────────────────────
    /** Insert a receipt into the sandbox ministry. event_name is E2E::-prefixed for
     *  cleanup. Defaults to status 'pending' (the fresh-submission state). */
    async createReceipt({
      submittedBy, amount = 12.5, eventName = "coffee", status = "pending",
    }: { submittedBy: string; amount?: number; eventName?: string; status?: string }) {
      const name = eventName.startsWith(E2E_PREFIX) ? eventName : `${E2E_PREFIX}${eventName}`
      const { data, error } = await db
        .from("receipts")
        .insert({
          ministry_id: ministryId,
          submitted_by: submittedBy,
          submitted_by_name: "E2E Submitter",
          event_name: name,
          category: "Supplies",
          fund: "General",
          amount,
          purchase_date: "2026-07-01",
          status,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },

    async updateReceiptStatus(id: string, status: string) {
      const { error } = await db.from("receipts").update({ status }).eq("id", id).eq("ministry_id", ministryId)
      if (error) throw error
    },

    async deleteReceiptsByPrefix(prefix: string = E2E_PREFIX) {
      const { error } = await db.from("receipts").delete().eq("ministry_id", ministryId).like("event_name", `${prefix}%`)
      if (error) throw error
    },

    /** Insert an active congregation pulse question authored by `createdBy`. */
    async createPulseQuestion({ createdBy, questionText = "How are you today?" }: { createdBy: string; questionText?: string }) {
      const text = questionText.startsWith(E2E_PREFIX) ? questionText : `${E2E_PREFIX}${questionText}`
      const { data, error } = await db
        .from("congregation_questions")
        .insert({ ministry_id: ministryId, created_by: createdBy, question_text: text, question_type: "open", options: null, is_active: true })
        .select()
        .single()
      if (error) throw error
      return data
    },

    async deletePulseQuestionsByPrefix(prefix: string = E2E_PREFIX) {
      const { error } = await db.from("congregation_questions").delete().eq("ministry_id", ministryId).like("question_text", `${prefix}%`)
      if (error) throw error
    },

    /** Create an announcement_forms row (optionally attached to an announcement). */
    async createForm({ createdBy, title = "signup", announcementId = null }: { createdBy: string; title?: string; announcementId?: string | null }) {
      const t = title.startsWith(E2E_PREFIX) ? title : `${E2E_PREFIX}${title}`
      const { data, error } = await db
        .from("announcement_forms")
        .insert({ ministry_id: ministryId, title: t, announcement_id: announcementId, created_by: createdBy })
        .select()
        .single()
      if (error) throw error
      return data
    },

    async insertFormResponse({ formId, announcementId = null, userId }: { formId: string; announcementId?: string | null; userId: string }) {
      const { data, error } = await db
        .from("form_responses")
        .insert({ form_id: formId, announcement_id: announcementId, ministry_id: ministryId, user_id: userId })
        .select()
        .single()
      if (error) throw error
      return data
    },

    /** Delete E2E form_responses + announcement_forms (responses first — FK). */
    async deleteFormsByPrefix(prefix: string = E2E_PREFIX) {
      const { data: forms } = await db.from("announcement_forms").select("id").eq("ministry_id", ministryId).like("title", `${prefix}%`)
      const ids = ((forms ?? []) as { id: string }[]).map((f) => f.id)
      if (ids.length > 0) {
        await db.from("form_responses").delete().in("form_id", ids)
        await db.from("announcement_forms").delete().in("id", ids)
      }
    },

    /** Set a sandbox user's notification_settings to an explicit object. */
    async setNotificationSettings(userId: string, settings: Record<string, unknown>) {
      const { error } = await db.from("profiles").update({ notification_settings: settings }).eq("id", userId).eq("ministry_id", ministryId)
      if (error) throw error
    },
  }
}
