// Calling — the permission gate, the ring, and the join-a-call-in-progress strip.
//
// What this proves, and why these three and not others:
//
//  (a) The START gate is asymmetric by chat type. A member may open a call in a
//      `my` chat and may NOT open one in a church chat; a leader may do both.
//      That asymmetry is the whole product decision (a church chat is often the
//      entire ministry, so a member starting one is a broadcast, not a call), and
//      it is written down in THREE places — chatCapabilities(), the server action,
//      and the SQL helper can_start_call(). A test that only checked one of them
//      would pass while the other two disagreed.
//
//  (b) The ring arrives over realtime, from a row this test writes with the
//      service-role client. That deliberately bypasses the server action: what is
//      under test is the path from `calls` INSERT → broadcast_chat_change trigger
//      → the chat:<group_id> topic the shell already subscribes to → the incoming
//      call dialog. No LiveKit involved, so this is deterministic.
//
//  (c) Ending the call takes the ring away. A ringing screen that outlives its
//      call is the failure people would actually report.
//
// The media connection itself is NOT exercised here — that needs a real LiveKit
// project, and it is the one part a browser test cannot fake.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX, memberState, adminState } from "./fixtures"

const CHURCH = `${E2E_PREFIX}Call Church`
const MY = `${E2E_PREFIX}Call My`

let churchId = ""
let myId = ""
let adminId = ""
let memberId = ""

// Calling hides itself completely when LiveKit is unconfigured (livekitConfigured()
// → callingAvailable() → the button never renders), which is correct behaviour and
// would make every assertion below vacuously fail rather than skip. Printing the
// skip is deliberate: a silent skip and a pass look identical.
const CONFIGURED = !!process.env.LIVEKIT_URL

test.beforeAll(async () => {
  const sb = sandbox()
  adminId = await sb.adminUserId()
  memberId = await sb.memberUserId()

  for (const [name, type] of [[CHURCH, "church"], [MY, "my"]] as const) {
    const { data, error } = await sb.client
      .from("groups")
      .insert({ ministry_id: sb.ministryId, name, type, category: "general", created_by: adminId })
      .select()
      .single()
    if (error) throw error
    if (type === "church") churchId = data.id
    else myId = data.id
    const { error: gm } = await sb.client
      .from("group_members")
      .insert([{ group_id: data.id, user_id: adminId }, { group_id: data.id, user_id: memberId }])
    if (gm) throw gm
  }
})

test.afterAll(async () => {
  const sb = sandbox()
  await sb.client.from("calls").delete().in("group_id", [churchId, myId].filter(Boolean))
  await sb.client.from("groups").delete().in("id", [churchId, myId].filter(Boolean))
})

async function openChat(page: Page, scope: "church" | "my", name: string) {
  await page.goto(`/home?tab=chats&chats=${scope}`)
  await page.waitForLoadState("networkidle")
  const row = page.locator(`[data-pocket-row="${name}"]`)
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.click()
  await expect(page.getByRole("heading", { name, exact: true }).first()).toBeVisible({ timeout: 15_000 })
}

const callButton = (page: Page) => page.getByRole("button", { name: /Start a call|Join the call/ })

/** Put a live ringing call into a chat, as somebody else. Mirrors exactly what
 *  the server action writes, so the client cannot tell the difference. */
async function ring(groupId: string, startedBy: string, status: "ringing" | "active" = "ringing") {
  const sb = sandbox()
  const id = crypto.randomUUID()
  const { error } = await sb.client.from("calls").insert({
    id,
    ministry_id: sb.ministryId,
    group_id: groupId,
    started_by: startedBy,
    room_name: `call-${id}`,
    kind: "audio",
    status,
    // calls_active_shape: an active call has been answered by definition.
    answered_at: status === "active" ? new Date().toISOString() : null,
  })
  if (error) throw error
  return id
}

async function endCall(callId: string) {
  const sb = sandbox()
  const { error } = await sb.client
    .from("calls")
    .update({ status: "ended", ended_at: new Date().toISOString(), end_reason: "cancelled" })
    .eq("id", callId)
  if (error) throw error
}

// ── (a) the start gate ───────────────────────────────────────────────────────

test.describe("start gate — member", () => {
  test.use({ storageState: memberState })

  test("a member can start a call in a my-chat", async ({ page }) => {
    test.skip(!CONFIGURED, "LIVEKIT_URL unset — calling is hidden by design")
    await openChat(page, "my", MY)
    await expect(callButton(page)).toBeVisible()
  })

  test("a member cannot start a call in a church chat", async ({ page }) => {
    test.skip(!CONFIGURED, "LIVEKIT_URL unset — calling is hidden by design")
    await openChat(page, "church", CHURCH)
    // The chat itself has to have loaded, or "no button" is trivially true.
    await expect(page.getByRole("button", { name: /message|Message/ }).or(page.locator("textarea")).first()).toBeVisible()
    await expect(callButton(page)).toHaveCount(0)
  })
})

test.describe("start gate — leader", () => {
  test.use({ storageState: adminState })

  test("a leader can start a call in a church chat", async ({ page }) => {
    test.skip(!CONFIGURED, "LIVEKIT_URL unset — calling is hidden by design")
    await openChat(page, "church", CHURCH)
    await expect(callButton(page)).toBeVisible()
  })
})

// ── (b) + (c) the ring ───────────────────────────────────────────────────────

test.describe("ringing", () => {
  test.use({ storageState: memberState })

  test("a call already ringing is picked up when the app opens", async ({ page }) => {
    test.skip(!CONFIGURED, "LIVEKIT_URL unset — calling is hidden by design")
    // The deterministic half: the call is live BEFORE this client exists, so the
    // only thing that can surface it is the catch-up query the provider runs when
    // it subscribes. A broadcast is never replayed, and without that query someone
    // who opens Central mid-ring sits in silence through a call meant for them.
    const callId = await ring(myId, adminId)
    await page.goto("/home?tab=home")

    const dialog = page.getByRole("dialog", { name: /started a call/ })
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await expect(dialog.getByRole("button", { name: "Join" })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Not now" })).toBeVisible()

    await endCall(callId)
    await expect(dialog).toHaveCount(0, { timeout: 20_000 })
  })

  test("a call started while you are looking elsewhere rings live", async ({ page }) => {
    test.skip(!CONFIGURED, "LIVEKIT_URL unset — calling is hidden by design")
    // The live half: this one rides the realtime broadcast, and a ring has to
    // reach you wherever you are in the app — which is why the provider lives at
    // the shell root and not inside ChatScreen.
    //
    // The settle is unavoidable and deliberate. Joining the per-room topics is a
    // websocket handshake that completes AFTER the list has painted, and it
    // publishes no signal a page can wait on; ringing before it lands tests
    // nothing, because an unreplayed broadcast is simply gone. The catch-up query
    // above is what covers this window in production — here it is suppressed on
    // purpose by ringing after load, so the broadcast path is what gets proven.
    await page.goto("/home?tab=chats&chats=my")
    await expect(page.locator(`[data-pocket-row="${MY}"]`)).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(3_000)

    const callId = await ring(myId, adminId)
    const dialog = page.getByRole("dialog", { name: /started a call/ })
    await expect(dialog).toBeVisible({ timeout: 20_000 })

    await endCall(callId)
    await expect(dialog).toHaveCount(0, { timeout: 20_000 })
  })

  test("a call already in progress offers Join in the chat, and no ring", async ({ page }) => {
    test.skip(!CONFIGURED, "LIVEKIT_URL unset — calling is hidden by design")
    // Already ANSWERED, not ringing: walking into a conversation where people are
    // mid-call. Nothing should ring — the decision to hold the call has already
    // been made and you simply missed the start — but the chat has to say a call
    // is up, or a group call is invisible to everyone who wasn't there for the ring.
    const callId = await ring(myId, adminId, "active")
    await openChat(page, "my", MY)

    await expect(page.getByText("Call in progress")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("button", { name: "Join the call" })).toBeVisible()
    await expect(page.getByRole("dialog", { name: /started a call/ })).toHaveCount(0)

    await endCall(callId)
    await expect(page.getByText("Call in progress")).toHaveCount(0, { timeout: 20_000 })
  })

  test("declining a two-person call ends it and leaves a line in the chat", async ({ page }) => {
    test.skip(!CONFIGURED, "LIVEKIT_URL unset — calling is hidden by design")
    // A two-person chat has nobody else the call could still be for, so declining
    // hangs it up rather than just silencing this phone. Asserted against Postgres
    // because the client dismissing its own dialog looks identical either way.
    const callId = await ring(myId, adminId)
    await page.goto("/home?tab=chats&chats=my")

    const dialog = page.getByRole("dialog", { name: /started a call/ })
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await dialog.getByRole("button", { name: "Not now" }).click()
    await expect(dialog).toHaveCount(0)

    const sb = sandbox()
    await expect.poll(async () => {
      const { data } = await sb.client.from("calls").select("status, end_reason").eq("id", callId).single()
      return `${data?.status}/${data?.end_reason}`
    }, { timeout: 20_000 }).toBe("ended/declined")

    // …and the conversation carries the record of it.
    const { data: msgs } = await sb.client
      .from("messages").select("content").eq("group_id", myId).eq("message_type", "system")
    expect((msgs ?? []).some((m) => m.content === "Call declined")).toBe(true)
  })
})
