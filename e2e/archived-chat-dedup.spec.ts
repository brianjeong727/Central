import { test, expect } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

// Regression guard for the archived-chat dedup fix (PR #252, `fix/auto-chats-archived-dedup`).
//
// THE BUG: turning off an auto-chat sets `groups.archived = true` — archived is a STASH,
// not a delete. But every dedup lookup in app/actions/auto-chats.ts matched on
// `linked_team_id` (or name) ALONE, with no archived filter. So the next creation path
// converged on the stashed row and RESURRECTED it: a read-only archived room came back as
// the live team chat, carrying its old membership and history. The fix adds
// `NOT_ARCHIVED = "archived.is.null,archived.eq.false"` to 13 dedup reads.
//
// WHAT THIS DRIVES: `createTeamChatAction` (auto-chats.ts) via the team-settings overlay's
// "Group chat" button. That action's FIRST dedup read is the `linked_team_id` lookup — the
// exact query the bug lived in — so this is the shortest honest path to the defect.
//
// WHY THE ASSERTIONS ARE DB-SIDE: the UI reports success either way. Reusing the archived
// row still returns a groupId and still flips the button to "Open chat", so a UI-only
// assertion passes on broken code. The proof is in `groups`: post-fix there must be a NEW
// active row and the archived one must be bit-for-bit untouched.
//
// PRE-FIX FAILURE (verified by reverting `.or(NOT_ARCHIVED)` on the linked_team_id lookup):
// zero active linked groups instead of one, and the archived row silently gains members.
//
// Everything is self-seeded under the E2E:: namespace — the team chat inherits the team's
// name, so `deleteGroupsByPrefix()` reaches it. No dependency on lane-specific fixtures,
// which is why this runs on either lane. Deliberately does NOT touch
// runAnnualClassMaintenance: that graduates the shared tenant's class chats and would
// corrupt other suites.

const TEAM_NAME = `${E2E_PREFIX}Dedup Team`

type GroupRow = { id: string; name: string; archived: boolean | null; category: string | null; linked_team_id: string | null }

test.describe("archived chats are stash — team-chat dedup must not resurrect them", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  let teamId = ""
  let roleId = ""
  let adminId = ""
  let archivedGroupId = ""

  async function linkedGroups(): Promise<GroupRow[]> {
    const sb = sandbox()
    const { data } = await sb.client
      .from("groups")
      .select("id, name, archived, category, linked_team_id")
      .eq("ministry_id", sb.ministryId)
      .eq("linked_team_id", teamId)
    return (data ?? []) as GroupRow[]
  }

  async function memberIds(groupId: string): Promise<string[]> {
    const sb = sandbox()
    const { data } = await sb.client.from("group_members").select("user_id").eq("group_id", groupId)
    return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id).sort()
  }

  async function cleanup() {
    const sb = sandbox()
    // Groups first — they carry the linked_team_id FK back to the team.
    await sb.deleteGroupsByPrefix()
    const { data: teams } = await sb.client
      .from("teams").select("id").eq("ministry_id", sb.ministryId).eq("name", TEAM_NAME)
    for (const t of ((teams ?? []) as { id: string }[])) {
      await sb.client.from("team_members").delete().eq("team_id", t.id)
      await sb.client.from("team_roles").delete().eq("team_id", t.id)
      await sb.client.from("teams").delete().eq("id", t.id)
    }
  }

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    await cleanup()

    const { data: team, error: teamErr } = await sb.client
      .from("teams")
      .insert({
        ministry_id: sb.ministryId,
        name: TEAM_NAME,
        team_type: "standard",
        admin_access: "write",
        created_by: adminId,
      })
      .select("id").single()
    if (teamErr) throw teamErr
    teamId = (team as { id: string }).id

    // President role + membership: `canOpenTeamSettings` needs president-or-governance,
    // and createTeamChatAction hard-fails on a team with zero members.
    const { data: role, error: roleErr } = await sb.client
      .from("team_roles")
      .insert({ team_id: teamId, name: "President", is_president: true, permissions: ["can_manage_team", "can_plan_events"] })
      .select("id").single()
    if (roleErr) throw roleErr
    roleId = (role as { id: string }).id

    const { error: memErr } = await sb.client
      .from("team_members")
      .insert({ team_id: teamId, user_id: adminId, role_id: roleId, added_by: adminId })
    if (memErr) throw memErr

    // The stash: an ARCHIVED team chat already linked to this team. This is the row the
    // buggy dedup used to find and revive.
    const { data: archived, error: archErr } = await sb.client
      .from("groups")
      .insert({
        ministry_id: sb.ministryId,
        name: TEAM_NAME,
        type: "church",
        category: "team",
        linked_team_id: teamId,
        archived: true,
        created_by: adminId,
      })
      .select("id").single()
    if (archErr) throw archErr
    archivedGroupId = (archived as { id: string }).id
  })

  test.afterAll(async () => {
    await cleanup()
  })

  test("creating a team chat over an archived one makes a NEW group and leaves the stash alone", async ({ page }) => {
    // Preconditions — the stash is the only linked group, and it is archived and empty.
    const before = await linkedGroups()
    expect(before, "fixture: exactly one linked group before the click").toHaveLength(1)
    expect(before[0].id).toBe(archivedGroupId)
    expect(before[0].archived).toBe(true)
    expect(await memberIds(archivedGroupId)).toEqual([])

    await page.goto(`/home?tab=plan&team=${teamId}`)

    const gear = page.getByTitle("Team settings").filter({ visible: true }).first()
    await expect(gear).toBeVisible({ timeout: 20_000 })
    await gear.click()

    const createChat = page.getByRole("button", { name: "Group chat" }).filter({ visible: true }).first()
    await expect(createChat).toBeVisible({ timeout: 20_000 })
    await createChat.click()

    // The button flips to "Open chat" once the action resolves — this only tells us the
    // action succeeded, NOT which row it used. The real assertions are below.
    await expect(page.getByRole("button", { name: "Open chat" }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 20_000 })

    const after = await linkedGroups()

    // ── The assertion that fails pre-fix ──────────────────────────────────────────
    // Buggy code returns the archived row, so there is NO active linked group at all.
    const active = after.filter((g) => g.archived !== true)
    expect(active, "a NEW, non-archived team chat must exist").toHaveLength(1)
    expect(active[0].id, "must not be the archived row resurrected").not.toBe(archivedGroupId)
    expect(active[0].name).toBe(TEAM_NAME)
    expect(active[0].category).toBe("team")

    // ── The stash must be untouched ───────────────────────────────────────────────
    const stash = after.find((g) => g.id === archivedGroupId)
    expect(stash, "the archived group must still exist").toBeTruthy()
    expect(stash!.archived, "the archived group must STAY archived").toBe(true)
    // Buggy code upserts the team roster into the archived room — the loudest symptom of
    // a resurrected chat, since old members silently regain access.
    expect(await memberIds(archivedGroupId), "archived group must gain no members").toEqual([])

    // The new chat carries the roster.
    expect(await memberIds(active[0].id)).toContain(adminId)
  })
})
