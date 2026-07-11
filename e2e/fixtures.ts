// Shared E2E fixtures: storage-state paths + a service-role sandbox helper.
//
// Every data helper here is HARD-SCOPED to the E2E sandbox ministry
// (E2E_MINISTRY_ID) and refuses to run without it — so a misconfigured run can
// never arrange or delete data in a real congregation. All test rows carry the
// "E2E::" title prefix so cleanup is surgical (deleteAnnouncementsByPrefix).
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

export interface CreateAnnouncementInput {
  title: string
  body: string
  is_event?: boolean
  is_pinned?: boolean
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

    /** Insert a published announcement into the sandbox ministry. The title is
     *  force-prefixed with "E2E::" if the caller didn't already, so nothing this
     *  helper writes can escape prefix-based cleanup. */
    async createAnnouncement({ title, body, is_event = false, is_pinned = false }: CreateAnnouncementInput) {
      const created_by = await adminUserId(db)
      const fullTitle = title.startsWith(E2E_PREFIX) ? title : `${E2E_PREFIX}${title}`
      const { data, error } = await db
        .from("announcements")
        .insert({
          title: fullTitle,
          body,
          is_event,
          is_pinned,
          audience: "all",
          status: "published",
          ministry_id: ministryId,
          created_by,
        })
        .select()
        .single()
      if (error) throw error
      return data
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
  }
}
