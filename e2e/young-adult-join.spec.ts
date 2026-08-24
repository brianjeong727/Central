// The path a real young adult takes: sign up → join a ministry → land in chats.
//
// None of the other young-adult specs covered THIS one. They exercised the
// profile switch and the /complete-profile form, both of which call
// setYoungAdult directly. The join path resolves the cohort differently — and it
// was broken in a way all of those stayed green through: handle_new_user has
// ALREADY written `grade` from signup metadata by the time the join runs, so the
// "what should I write" answer is correctly null, and passing that same null on
// as "what cohort is this person" left autoAddUserToChats with nothing. A young
// adult joined, got the central chat, and was silently missing from Young Adults.
// Assert on chat MEMBERSHIP, since the profile column was right the whole time.
import { test, expect } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import ws from "ws"

const env: Record<string, string> = {}
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim()
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, realtime: { transport: ws as never } })

test.describe("young adult joins a ministry", () => {
  test.describe.configure({ timeout: 240000 })
  test.use({ storageState: { cookies: [], origins: [] } })

  const password = "TestPassword123!"
  const made: string[] = []

  test.afterAll(async () => {
    for (const id of made) {
      await admin.from("group_members").delete().eq("user_id", id)
      await admin.from("profiles").delete().eq("id", id)
      await admin.auth.admin.deleteUser(id).catch(() => {})
    }
  })

  async function chatsOf(userId: string): Promise<string[]> {
    const { data } = await admin.from("group_members")
      .select("groups!group_id(name)").eq("user_id", userId)
    return (data ?? []).map((r) => (r as { groups?: { name?: string } }).groups?.name)
      .filter((n): n is string => !!n)
  }

  // Signs up exactly as the form does: the trigger writes `grade` from metadata,
  // so the profile already carries it before the join runs — which is the whole
  // point of the case.
  async function signUpAndJoin(page: import("@playwright/test").Page, meta: Record<string, unknown>) {
    // The NAME has to be unique per user, not just the email. Both cases in this
    // file join the SAME ministry, and a second member arriving with a name that
    // already belongs to one now stops at the duplicate-account interstitial
    // (lib/duplicate-account.ts) instead of joining — which is the product working,
    // but it left the second test looking like the join had silently failed.
    const stamp = `${Date.now()}.${process.pid}`
    const email = `yajoin.${stamp}@test.com`
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name: `YA Join ${stamp}`, gender: "male", ...meta },
    })
    if (error) throw error
    made.push(data.user.id)

    const { data: min } = await admin.from("ministries")
      .select("invite_code").eq("id", env.E2E_MINISTRY_ID).single()

    await page.goto("/login")
    await page.getByPlaceholder("you@university.edu").fill(email)
    await page.getByPlaceholder("••••••••").fill(password)
    await page.getByRole("button", { name: "Sign in" }).click()
    // Wait for the session to actually land rather than a fixed sleep — a
    // ministry-less user is routed away from /login once signed in.
    await expect.poll(async () => new URL(page.url()).pathname, { timeout: 60000 })
      .not.toBe("/login")

    await page.goto("/ministries")
    await page.waitForLoadState("networkidle")
    // The ?tab= param does not select it — the tab is client state. Scope to the
    // tab strip: each ministry ROW also has an "Invite code" button.
    await page.getByRole("button", { name: "Invite code" }).first().click()
    const codeBox = page.getByPlaceholder("MERCY24").filter({ visible: true }).first()
    await codeBox.waitFor({ state: "visible", timeout: 20000 })
    await codeBox.fill(min!.invite_code)
    // Submit via the form (Enter) rather than the button — the click was landing
    // while the panel re-rendered, leaving the tab reset and no join fired.
    await codeBox.press("Enter")

    // The join is a server action; poll the row it writes rather than guessing.
    await expect.poll(async () => {
      const { data: p } = await admin.from("profiles").select("ministry_id").eq("id", data.user.id).single()
      return p?.ministry_id ?? null
    }, { message: "the join must complete", timeout: 45000 }).not.toBeNull()

    return data.user.id
  }

  test("a young adult lands in Young Adults, not a class chat", async ({ page }) => {
    const id = await signUpAndJoin(page, { grade: "young_adult" })
    // autoAddUserToChats adds the central chat and the cohort chat in that order,
    // so poll for the COHORT one — asserting on "any chats yet" passes as soon as
    // the central chat lands and races the thing under test.
    await expect.poll(() => chatsOf(id),
      { message: "a young adult must be auto-added to Young Adults", timeout: 30000 })
      .toContain("Young Adults")
    const chats = await chatsOf(id)
    console.log("### YA chats:", JSON.stringify(chats))
    expect(chats.some((n) => n.startsWith("Class of")), "and NOT to a class chat").toBe(false)
  })

  test("a student still lands in their class chat", async ({ page }) => {
    // The other half of the same branch — proving the fix didn't just invert it.
    const year = new Date().getFullYear() + 2
    const id = await signUpAndJoin(page, { graduation_year: String(year) })
    await expect.poll(() => chatsOf(id),
      { message: "a student must still get their class chat", timeout: 30000 })
      .toContain(`Class of ${year}`)
    const chats = await chatsOf(id)
    console.log("### student chats:", JSON.stringify(chats))
    expect(chats, "and must not be put in Young Adults").not.toContain("Young Adults")
  })
})
