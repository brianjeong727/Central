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
  const group = await box.createGroup({ name: "Delete Trail", memberIds: [userId, await box.adminUserId()] })
  groupId = group.id
  await box.insertMessage({ groupId, senderId: userId, content: `${E2E_PREFIX}I was here` })
})

test.afterAll(async () => {
  const box = sandbox()
  // Group delete cascades group_members + messages, so the throwaway no longer
  // references anything; then remove the profile + auth identity. Idempotent.
  await box.deleteGroupsByPrefix()
  await box.client.from("profiles").delete().eq("id", userId)
  await box.client.auth.admin.deleteUser(userId).catch(() => {})
})

async function loginAsThrowaway(page: Page) {
  await page.goto("/login")
  await page.getByPlaceholder("you@university.edu").fill(THROWAWAY_EMAIL)
  await page.getByPlaceholder("••••••••").fill(THROWAWAY_PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
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
  })
})
