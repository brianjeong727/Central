// Guards the profile-completeness gate. Two describes: the young-adult dead end it
// was written for, and (below) WHO the gate may ask at all.
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

  async function makeUser(
    meta: Record<string, unknown>,
    opts: { ministry?: boolean; role?: string } = {},
  ): Promise<string> {
    const email = `gate.${Date.now()}.${Math.floor(Number(process.hrtime.bigint() % 100000n))}@test.com`
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name: "Gate Probe", ...meta },
    })
    if (error) throw error
    made.push(data.user.id)
    // `ministry: false` is the FOUNDER-MID-REGISTRATION shape and it is not exotic:
    // handle_new_user hardcodes role='member' for every account (the metadata role was
    // forgeable), and a ministry founder's real role is not written until
    // submitMinistryApplication runs at the END of the wizard. So a registering pastor
    // looks exactly like this for the whole of registration.
    const patch: Record<string, unknown> = {}
    if (opts.ministry !== false) patch.ministry_id = env.E2E_MINISTRY_ID
    if (opts.role) patch.role = opts.role
    if (Object.keys(patch).length > 0) {
      await admin.from("profiles").update(patch).eq("id", data.user.id)
    }
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

    // Poll: the chat move runs after the profile write, so a single read races it.
    const chatNames = async () => {
      const { data: rows } = await admin.from("group_members")
        .select("groups!group_id(name)").eq("user_id", id)
      return (rows ?? []).map((r) => (r as { groups?: { name?: string } }).groups?.name).filter(Boolean)
    }
    await expect.poll(chatNames, {
      message: "the label and the chat must move together", timeout: 30000,
    }).toContain("Young Adults")
    console.log("### chats after completing:", JSON.stringify(await chatNames()))
  })

  test("someone genuinely missing a cohort IS still diverted", async ({ page }) => {
    // The gate must still do its job — this is the OAuth case it exists for.
    // Also the regression guard for the two tests below: it is what proves the gate
    // was narrowed rather than switched off.
    const email = await makeUser({ gender: "male" })
    const path = await landingPathFor(page, email)
    console.log("### no gender/cohort landed on:", path)
    expect(path, "the gate must still catch a member with no cohort at all")
      .toContain("/complete-profile")
  })

  // ── who the gate may ask ────────────────────────────────────────────────────
  // Central is a college ministry: the cohort exists to seat a STUDENT in their
  // class chat. A pastor has no graduating class, and being asked for one is the
  // first thing a new church would have seen of the product.

  test("a founder mid-registration is never asked for a graduation year", async ({ page }) => {
    // No ministry, role='member', nothing filled in — the exact shape of a pastor
    // partway through the registration wizard. /onboarding and /register-ministry
    // were already exempt, but any step outside them (reopening the app at /home, a
    // link from an email, coming back to an abandoned wizard) hit the gate.
    const email = await makeUser({}, { ministry: false })
    const path = await landingPathFor(page, email)
    console.log("### founder mid-registration landed on:", path)
    expect(path, "a registering founder must never be asked for a graduating class")
      .not.toContain("/complete-profile")

    // And the route they are most likely to arrive on — the native shell reopening,
    // a link from an email — must send them on to /ministries (browse, invite code,
    // or register), which is where the no-ministry branch has always pointed. This is
    // the assertion that would have caught the bug: before the fix the gate ran
    // BEFORE that branch, so /home became the form instead.
    await page.goto("/home")
    await page.waitForTimeout(6000)
    const fromHome = new URL(page.url()).pathname
    console.log("### founder mid-registration hitting /home landed on:", fromHome)
    expect(fromHome).not.toContain("/complete-profile")
    expect(fromHome).toContain("/ministries")
  })

  test("an admin-tier profile is never asked for a cohort, even landing on the form itself", async ({ page }) => {
    const email = await makeUser({}, { role: "pastor" })
    const path = await landingPathFor(page, email)
    console.log("### pastor with no gender/cohort landed on:", path)
    expect(path).not.toContain("/complete-profile")

    // The role rule used to live ONLY in proxy.ts, so the page itself had no idea it
    // existed: reaching /complete-profile by any other route showed a pastor a
    // class-year picker and "Enter a valid graduation year" with no way past. Both
    // now read the same predicate, so the page bounces them straight back out.
    await page.goto("/complete-profile")
    await page.waitForTimeout(6000)
    const after = new URL(page.url()).pathname
    console.log("### pastor deep-linking the form landed on:", after)
    expect(after, "the form must not hold a pastor it has nothing to ask")
      .not.toContain("/complete-profile")

    const id = made[made.length - 1]
    const { data: prof } = await admin.from("profiles")
      .select("graduation_year, grade").eq("id", id).single()
    // Nothing may have been written on the way through — a cohort on a pastor is
    // what would put them in a class chat.
    expect(prof?.graduation_year).toBeNull()
    expect(prof?.grade).toBeNull()
  })
})
