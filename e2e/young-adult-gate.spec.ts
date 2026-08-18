// Guards the profile-completeness gate against re-trapping young adults.
//
// The gate demands gender + a cohort before letting a member-tier user into the
// app. It used to spell "cohort" as `graduation_year != null`, which a young
// adult never has (lib/cohort.ts) — so ticking "I'm a young adult" at signup sent
// them to /complete-profile, whose only cohort control is a class-year picker and
// whose submit button therefore never enables. A dead end, reachable by the
// documented happy path. memberProfileIncomplete is now shared by the gate and
// the form so they cannot disagree again.
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

test.describe("profile completeness gate — young adults", () => {
  test.describe.configure({ timeout: 180000 })
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

  async function makeUser(meta: Record<string, unknown>): Promise<string> {
    const email = `gate.${Date.now()}.${Math.floor(Number(process.hrtime.bigint() % 100000n))}@test.com`
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name: "Gate Probe", ...meta },
    })
    if (error) throw error
    made.push(data.user.id)
    await admin.from("profiles").update({ ministry_id: env.E2E_MINISTRY_ID }).eq("id", data.user.id)
    return email
  }

  async function landingPathFor(page: import("@playwright/test").Page, email: string): Promise<string> {
    await page.goto("/login")
    await page.getByPlaceholder("you@university.edu").fill(email)
    await page.getByPlaceholder("••••••••").fill(password)
    await page.getByRole("button", { name: "Sign in" }).click()
    await page.waitForTimeout(9000)
    return new URL(page.url()).pathname
  }

  test("a young adult is NOT diverted to /complete-profile", async ({ page }) => {
    // Exactly what the signup form now sends when the box is ticked.
    const email = await makeUser({ gender: "male", grade: "young_adult" })
    const path = await landingPathFor(page, email)
    console.log("### young adult landed on:", path)
    expect(path, "a young adult has no graduation year BY DESIGN — the gate must not demand one")
      .not.toContain("/complete-profile")
  })

  test("completing as a young adult sets the cohort AND joins the chat", async ({ page }) => {
    // The form's write is what gets you past the gate; the chat move is what makes
    // the label true. Setting one without the other is the split that made the
    // graduation flow look like it worked for months.
    const email = await makeUser({ gender: "male" })
    const path = await landingPathFor(page, email)
    expect(path).toContain("/complete-profile")

    // The form never prefills gender, even when the profile already has one.
    await page.getByRole("button", { name: "Male", exact: true }).filter({ visible: true }).first().click()
    await page.getByRole("button", { name: /young adult/i }).filter({ visible: true }).first().click()
    await page.getByRole("button", { name: /continue/i }).filter({ visible: true }).first().click()
    await page.waitForTimeout(9000)

    const id = made[made.length - 1]
    const { data: prof } = await admin.from("profiles")
      .select("grade, graduation_year").eq("id", id).single()
    console.log("### after completing as YA:", JSON.stringify(prof))
    expect(prof?.grade).toBe("young_adult")
    expect(prof?.graduation_year).toBeNull()

    const { data: rows } = await admin.from("group_members")
      .select("groups!group_id(name)").eq("user_id", id)
    const names = (rows ?? []).map((r) => (r as { groups?: { name?: string } }).groups?.name).filter(Boolean)
    console.log("### chats after completing:", JSON.stringify(names))
    expect(names, "the label and the chat must move together").toContain("Young Adults")
  })

  test("someone genuinely missing a cohort IS still diverted", async ({ page }) => {
    // The gate must still do its job — this is the OAuth case it exists for.
    const email = await makeUser({ gender: "male" })
    const path = await landingPathFor(page, email)
    console.log("### no gender/cohort landed on:", path)
    expect(path, "the gate must still catch a member with no cohort at all")
      .toContain("/complete-profile")
  })
})
