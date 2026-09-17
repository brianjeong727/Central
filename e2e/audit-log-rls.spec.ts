// audit_logs row policy — behavioural proof against the live DB, as the real
// roles a browser session carries (anon key + password sign-in), never the
// service role. Ratified 2026-09-15 (permissions.md "View audit log": admin only):
//   SELECT  → admin-tier of the same ministry only.
//   INSERT  → own ministry + self as actor, AND the action is one the caller's
//             tier can perform: leader-tier may self-report `announcement.*`
//             only; admin-tier may self-report anything.
//   UPDATE / DELETE → nothing for `authenticated` (append-only).
// The E2E member is promoted to `leader` for the leader cases and restored in
// afterAll; every probe row is E2E::-labelled and deleted with the service role.
import { test, expect } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import ws from "ws"
import { sandbox, E2E_PREFIX } from "./fixtures"

const LABEL = `${E2E_PREFIX}audit-rls probe`
// "E2E Sandbox 2" — the lane-2 tenant. Exists in the live DB; never written to here.
const OTHER_MINISTRY_ID = "cb51c42c-22a2-414d-949c-003b7abe0dcf"

function userClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws as never },
  })
}

async function signedIn(email: string): Promise<SupabaseClient> {
  const c = userClient()
  const { error } = await c.auth.signInWithPassword({ email, password: process.env.E2E_PASSWORD! })
  if (error) throw error
  return c
}

function row(ministryId: string, actorId: string, action: string) {
  return { ministry_id: ministryId, actor_id: actorId, actor_name: "E2E probe", action, entity_type: "probe", entity_label: LABEL }
}

test.describe.serial("audit_logs RLS", () => {
  const sb = sandbox()
  let memberId = ""
  let adminId = ""
  let memberRoleBefore = ""
  let seededId = ""

  test.beforeAll(async () => {
    memberId = await sb.memberUserId()
    adminId = await sb.adminUserId()
    const { data: prof } = await sb.client.from("profiles").select("role").eq("id", memberId).single()
    memberRoleBefore = prof?.role ?? "member"
    // One real admin-written row so the SELECT cases have something to (not) see.
    const { data, error } = await sb.client.from("audit_logs").insert(row(sb.ministryId, adminId, "settings.general_edit")).select("id").single()
    if (error) throw error
    seededId = data.id
  })

  test.afterAll(async () => {
    await sb.client.from("profiles").update({ role: memberRoleBefore }).eq("id", memberId)
    await sb.client.from("audit_logs").delete().eq("entity_label", LABEL)
  })

  test("a member reads nothing and can't write anything", async () => {
    const c = await signedIn(process.env.E2E_MEMBER_EMAIL!)
    const sel = await c.from("audit_logs").select("id").eq("id", seededId)
    expect(sel.error).toBeNull()
    expect(sel.data).toHaveLength(0)

    const ins = await c.from("audit_logs").insert(row(sb.ministryId, memberId, "announcement.pin"))
    expect(ins.error?.code).toBe("42501")
    await c.auth.signOut()
  })

  test("a leader may self-report an announcement action, nothing else, and reads nothing", async () => {
    await sb.client.from("profiles").update({ role: "leader" }).eq("id", memberId)
    const c = await signedIn(process.env.E2E_MEMBER_EMAIL!)

    const sel = await c.from("audit_logs").select("id").eq("id", seededId)
    expect(sel.error).toBeNull()
    expect(sel.data).toHaveLength(0)

    const ok = await c.from("audit_logs").insert(row(sb.ministryId, memberId, "announcement.pin"))
    expect(ok.error).toBeNull()
    // INSERT…RETURNING is checked by the SELECT policy too: a row a leader may
    // write is a row they may read back, so a future `.select()` in lib/audit.ts
    // can't break leaders only, silently.
    const okReturning = await c.from("audit_logs").insert(row(sb.ministryId, memberId, "announcement.unpin")).select("id").single()
    expect(okReturning.error).toBeNull()
    expect(okReturning.data?.id).toBeTruthy()

    const settings = await c.from("audit_logs").insert(row(sb.ministryId, memberId, "settings.general_edit"))
    expect(settings.error?.code).toBe("42501")

    const asAdmin = await c.from("audit_logs").insert(row(sb.ministryId, adminId, "announcement.pin"))
    expect(asAdmin.error?.code).toBe("42501")

    await c.auth.signOut()
    await sb.client.from("profiles").update({ role: memberRoleBefore }).eq("id", memberId)
  })

  test("an admin reads own-ministry rows, writes any self-attributed action, and can't edit or delete", async () => {
    const c = await signedIn(process.env.E2E_ADMIN_EMAIL!)

    const sel = await c.from("audit_logs").select("id").eq("id", seededId)
    expect(sel.error).toBeNull()
    expect(sel.data).toHaveLength(1)

    const ok = await c.from("audit_logs").insert(row(sb.ministryId, adminId, "settings.general_edit"))
    expect(ok.error).toBeNull()

    const foreignActor = await c.from("audit_logs").insert(row(sb.ministryId, memberId, "settings.general_edit"))
    expect(foreignActor.error?.code).toBe("42501")

    // A real other tenant (lane-2 sandbox), so the denial is provably RLS and not the FK.
    const foreignMinistry = await c.from("audit_logs").insert(row(OTHER_MINISTRY_ID, adminId, "settings.general_edit"))
    expect(foreignMinistry.error?.code).toBe("42501")

    // Append-only: no grant, so PostgREST refuses before RLS is even consulted.
    const upd = await c.from("audit_logs").update({ actor_name: "tampered" }).eq("id", seededId)
    expect(upd.error).not.toBeNull()
    const del = await c.from("audit_logs").delete().eq("id", seededId)
    expect(del.error).not.toBeNull()
    const { data: still } = await sb.client.from("audit_logs").select("actor_name").eq("id", seededId).single()
    expect(still?.actor_name).toBe("E2E probe")

    await c.auth.signOut()
  })
})
