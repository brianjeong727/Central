import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

// Account deletion (App Store 5.1.1). We arrange a THROWAWAY member in the
// sandbox ministry (never e2e.admin/member — those must survive), send a
// message as them, log in through the REAL /login UI, and drive the delete
// flow from the Profile tab's Danger Zone.
//
// ⚠️  The full-deletion EXECUTION path is migration-gated (see
//     .claude/task-context/account-deletion/migration.sql). Until the FK
//     alterations land, calling auth.admin.deleteUser() either fails (a FK
//     still references the user) or cascades the tombstone/messages away —
//     so the assertions that depend on the delete actually running (redirect
//     out, login fails, scrubbed tombstone, "Former member" message) live in a
//     test.fixme block tagged TODO(migration). The guard/confirm-surface tests
//     run live and are NOT gated.

const THROWAWAY_EMAIL = `e2e-delete-${Date.now()}@example.com`
const THROWAWAY_PASSWORD = "E2E-Delete-Passw0rd!"
const THROWAWAY_NAME = `${E2E_PREFIX}Deletable Member`

let userId = ""
let groupId = ""
let dmId = ""
let dmKey = ""
let adminId = ""

test.beforeAll(async () => {
  const box = sandbox()
  // 1. Create the auth identity (handle_new_user trigger seeds a profiles row
  //    with a null ministry_id).
  const { data: created, error } = await box.client.auth.admin.createUser({
    email: THROWAWAY_EMAIL,
    password: THROWAWAY_PASSWORD,
    email_confirm: true,
  })
  if (error || !created?.user) throw new Error(`[account-deletion] createUser failed: ${error?.message}`)
  userId = created.user.id

  // 2. Attach them to the sandbox ministry so /login lands on /home. gender +
  //    graduation_year are also required — the OAuth onboarding gate
  //    (proxy.ts) redirects any member-tier profile missing either to
  //    /complete-profile, which would break loginAsThrowaway's /home wait.
  const { error: upErr } = await box.client
    .from("profiles")
    .update({ ministry_id: box.ministryId, role: "member", name: THROWAWAY_NAME, gender: "female", graduation_year: new Date().getFullYear() + 2 })
    .eq("id", userId)
  if (upErr) throw new Error(`[account-deletion] profile attach failed: ${upErr.message}`)

  // 3. Arrange a message from them (must survive as "Former member").
  adminId = await box.adminUserId()
  const group = await box.createGroup({ name: "Delete Trail", memberIds: [userId, adminId] })
  groupId = group.id
  await box.insertMessage({ groupId, senderId: userId, content: `${E2E_PREFIX}I was here` })

  // 4. And a DM with the admin. This is the surface the bug actually showed on:
  //    deletion used to remove the throwaway's group_members row, so the
  //    per-viewer DM title lost "the other member" and fell back to the stale
  //    groups.name — showing the SURVIVING user their own name.
  dmKey = [userId, adminId].sort().join(":")
  await box.client.from("groups").delete()
    .eq("ministry_id", box.ministryId).eq("type", "dm").eq("dm_key", dmKey)
  const { data: dm, error: dmErr } = await box.client
    .from("groups")
    // Stored name is the ADMIN's id-side value on purpose — nothing should read it.
    .insert({ ministry_id: box.ministryId, name: THROWAWAY_NAME, type: "dm", created_by: adminId, dm_key: dmKey })
    .select("id").single()
  if (dmErr) throw new Error(`[account-deletion] dm insert failed: ${dmErr.message}`)
  dmId = dm.id
  await box.client.from("group_members").insert([
    { group_id: dmId, user_id: userId },
    { group_id: dmId, user_id: adminId },
  ])
  await box.insertMessage({ groupId: dmId, senderId: userId, content: `${E2E_PREFIX}dm from the deletable one` })
})

test.afterAll(async () => {
  const box = sandbox()
  // Group delete cascades group_members + messages, so the throwaway no longer
  // references anything; then remove the profile + auth identity. Idempotent.
  await box.deleteGroupsByPrefix()
  // The DM is named after the throwaway, not the E2E prefix — drop it by pair key.
  if (dmKey) {
    await box.client.from("groups").delete()
      .eq("ministry_id", box.ministryId).eq("type", "dm").eq("dm_key", dmKey)
  }
  await box.client.from("profiles").delete().eq("id", userId)
  await box.client.auth.admin.deleteUser(userId).catch(() => {})
})

async function loginAsThrowaway(page: Page) {
  await page.goto("/login")
  // Phone width opens on a provider-choice screen (Apple / Google / email); the
  // email+password form is behind "Continue with email". Desktop shows the form
  // directly, so this step is conditional rather than unconditional.
  const emailEntry = page.getByRole("button", { name: "Continue with email" })
  if (await emailEntry.isVisible().catch(() => false)) await emailEntry.click()
  // The provider screen swaps to the form; fill the VISIBLE field only, and wait
  // for it — filling during the transition silently targets the outgoing node and
  // leaves the form empty (which then just times out at waitForURL).
  const emailField = page.getByPlaceholder("you@university.edu").filter({ visible: true }).first()
  await emailField.waitFor({ state: "visible", timeout: 15_000 })
  await emailField.fill(THROWAWAY_EMAIL)
  await page.getByPlaceholder("••••••••").filter({ visible: true }).first().fill(THROWAWAY_PASSWORD)
  await expect(emailField).toHaveValue(THROWAWAY_EMAIL)
  await page.getByRole("button", { name: "Sign in" }).filter({ visible: true }).first().click()
  await page.waitForURL(/\/home/, { timeout: 30_000 })
}

// Fresh, unauthenticated context — override the project's admin storageState.
test.describe("account deletion — confirm surface + guards (live)", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Danger Zone exposes delete, requires an exact email match to arm", async ({ page }) => {
    await loginAsThrowaway(page)
    await page.goto("/home?tab=profile")

    // The idle affordance.
    const deleteBtn = page.getByRole("button", { name: "Delete account" })
    await deleteBtn.scrollIntoViewIfNeeded()
    await expect(deleteBtn).toBeVisible()

    // Navigate-to-confirm (in-place surface swap, not a modal).
    await deleteBtn.click()
    await expect(page.getByText("Delete your account?")).toBeVisible()

    const confirm = page.getByRole("button", { name: "Permanently delete" })

    // Wrong email → stays disarmed.
    await page.getByPlaceholder("you@university.edu").fill("not-my@email.com")
    await expect(confirm).toBeDisabled()

    // Exact email → armed (we do NOT click — execution is migration-gated).
    await page.getByPlaceholder("you@university.edu").fill(THROWAWAY_EMAIL)
    await expect(confirm).toBeEnabled()
  })
})

// Phone width drives a DIFFERENT render branch: the Danger zone is its own
// settings subpage (?pset=danger) and the confirm button is labelled "Delete",
// not "Permanently delete". The desktop test below therefore proves nothing
// about mobile — this walks the real phone-width path up to the armed button.
test.describe("account deletion — mobile confirm surface (390x844)", () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } })

  test("Danger zone subpage arms the delete only on an exact email match", async ({ page }) => {
    await loginAsThrowaway(page)
    await page.goto("/home?tab=profile&pset=danger")

    const deleteBtn = page.getByRole("button", { name: "Delete account" }).filter({ visible: true }).first()
    await expect(deleteBtn).toBeVisible({ timeout: 15000 })
    await deleteBtn.click()
    await expect(page.getByText("Delete your account?").filter({ visible: true })).toBeVisible()

    const confirm = page.getByRole("button", { name: "Delete", exact: true }).filter({ visible: true }).first()
    const field = page.getByPlaceholder("you@university.edu").filter({ visible: true }).first()

    await field.fill("not-my@email.com")
    await expect(confirm).toBeDisabled()

    await field.fill(THROWAWAY_EMAIL)
    await expect(confirm).toBeEnabled()
    // Not clicked — the destructive execution is covered once, below, and the
    // throwaway can only be deleted a single time.
  })
})

// Migration account_deletion_tombstone APPLIED 2026-07-12 — full path live. (Was gated on
// .claude/task-context/account-deletion/migration.sql are applied. Executing
// the delete against the un-migrated DB is unsafe (may fail or cascade the
// tombstone/messages away), so these end-state assertions can't run yet.
test.describe("account deletion — full execution", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("deletes auth identity, scrubs profile, keeps message as Former member", async ({ page }) => {
    const box = sandbox()
    await loginAsThrowaway(page)
    await page.goto("/home?tab=profile")

    await page.getByRole("button", { name: "Delete account" }).click()
    await page.getByPlaceholder("you@university.edu").fill(THROWAWAY_EMAIL)
    await page.getByRole("button", { name: "Permanently delete" }).click()

    // Redirected out of the app.
    await page.waitForURL(/\/$|\/login/, { timeout: 30_000 })

    // Login now fails (identity is gone).
    await page.goto("/login")
    await page.getByPlaceholder("you@university.edu").fill(THROWAWAY_EMAIL)
    await page.getByPlaceholder("••••••••").fill(THROWAWAY_PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).not.toHaveURL(/\/home/, { timeout: 10_000 })

    // Profile row is a scrubbed tombstone (service-client check).
    const { data: tomb } = await box.client
      .from("profiles")
      .select("name, email, avatar_url, deleted_at")
      .eq("id", userId)
      .maybeSingle()
    expect(tomb?.name).toBe("Former member")
    expect(tomb?.email).toMatch(/^deleted\+.*@removed\.invalid$/) // NOT NULL col — scrub uses placeholder (block-1 fix)
    expect(tomb?.deleted_at).not.toBeNull()

    // Their message still renders attributed to "Former member" in the chat.
    // (Re-authenticate as the sandbox admin here to read the room — omitted in
    //  this skipped scaffold; assert via service client that the message row
    //  survived with the tombstone sender.)
    const { data: msg } = await box.client
      .from("messages")
      .select("id, sender_id")
      .eq("group_id", groupId)
      .eq("sender_id", userId)
      .maybeSingle()
    expect(msg?.id).toBeTruthy()

    // ── The reported bug: what the SURVIVING person sees ──────────────────────
    // Deleting used to remove the tombstone's group_members rows, which severed
    // every membership-based join: the DM fell back to the stale groups.name and
    // showed the survivor their OWN name as the conversation title.

    // The membership is KEPT (so the tombstone stays resolvable) but scrubbed.
    const { data: mem } = await box.client
      .from("group_members")
      .select("group_id, last_read_at, muted, pinned, notify_mode")
      .eq("user_id", userId)
    expect(mem?.length).toBeGreaterThan(0)
    for (const row of mem ?? []) {
      expect(row.last_read_at).toBeNull()
      expect(row.muted).toBe(false)
      expect(row.pinned).toBe(false)
      expect(row.notify_mode).toBeNull()
    }

    // Both title producers must now say "Former member" for the admin's view of
    // that DM — get_chat_list (client SWR) and get_chat_previews (SSR/boot, which
    // also backfills the ChatScreen header on a deep link).
    for (const fn of ["get_chat_list", "get_chat_previews"] as const) {
      const { data: rows, error } = await box.client.rpc(fn, {
        p_user_id: adminId,
        p_ministry_id: box.ministryId,
      })
      expect(error).toBeNull()
      const row = (rows as { group_id: string; group_name: string }[] | null)
        ?.find((r) => r.group_id === dmId)
      expect(row, `${fn} did not return the DM`).toBeTruthy()
      expect(row!.group_name, `${fn} DM title`).toBe("Former member")
    }

    // ── Third producer: the dead-thread signal ────────────────────────────────
    // get_dm_groups_with_deleted_counterpart sinks + dims this DM in the
    // conversations list. It is SECURITY INVOKER and takes NO arguments, so it
    // must be called with the surviving admin's own JWT — box.client is
    // service-role, where auth.uid() is null AND EXECUTE is deliberately not
    // granted. Raw fetch rather than a second supabase-js client so this also
    // covers the PostgREST half (a missing schema-cache entry or a missing
    // EXECUTE grant is invisible to an SQL-only check).
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const tokenRes = await fetch(`${sbUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_PASSWORD }),
    })
    expect(tokenRes.status, "admin sign-in for the dead-DM RPC").toBe(200)
    const { access_token } = (await tokenRes.json()) as { access_token: string }
    const deadRes = await fetch(`${sbUrl}/rest/v1/rpc/get_dm_groups_with_deleted_counterpart`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: "{}",
    })
    expect(deadRes.status, "get_dm_groups_with_deleted_counterpart (authenticated)").toBe(200)
    const deadIds = ((await deadRes.json()) as { group_id: string }[]).map((r) => r.group_id)
    expect(deadIds, "dead-DM set must contain the tombstoned DM").toContain(dmId)
  })
})
