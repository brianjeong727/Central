import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase-server"
import { HomeApp } from "./home-app"
import { rowsToChatPreviews, type ChatPreviewRow } from "./utils"
import { mapChatListRows, type ChatListRow } from "./chat-list"
import { resolveChatsSection } from "./tabs/chat-shared"
import type { UserTeam, CongregationQuestion, GovernanceSettings, ChatGroup } from "./types"
import type { ChatPreview } from "@/components/central/chat-strip"

const ADMIN_EMAIL = "brianjeong13@gmail.com"

type RawTeamRef = { id: string; name: string; icon: string | null; description: string | null; team_type: string; allow_co_presidency: boolean | null; allow_admin_members: boolean | null }
type RawRoleRef = { id: string; name: string; permissions: string[]; is_president: boolean | null }
type RawMembership = {
  team_id: string
  role_id: string
  teams: RawTeamRef | RawTeamRef[] | null
  team_roles: RawRoleRef | RawRoleRef[] | null
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  // The chat list is SERVER-RENDERED, so the scope it opens on has to be decided
  // here. It used to be read off `window.location.search` inside a useState
  // initializer in BOTH list components — which the server cannot do, so the
  // server would always have rendered "church" while a client arriving at
  // ?chats=my rendered "my": a hydration mismatch that repaints the wrong
  // segment first. `?chats` is still ordinary URL state written through
  // nav-state's one atomic replace (Convention #12) — only the FIRST read moved.
  const initialChatsSection = resolveChatsSection((await searchParams).chats)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")
  if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) redirect("/admin")

  // Boot-slim: fetch only columns the shell + tabs actually consume off initialProfile.
  // Dropped about_me/bible_verse/pray_for_me — the directory reads its OWN fetched member
  // detail, and nothing reads these off the boot profile (null-backfilled below to satisfy
  // the Profile type). prayer_request stays: ProfileTab seeds its edit form from it and
  // never refetches. Other fat fields (testimony/bio/favorite_*) were never in this select.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, graduation_year, grade, needs_grad_check, role, prayer_request, ministry_id, avatar_url, school_id, seen_workspace_nav_hint, grad_prompt_dismissed, compact_sidebar, notification_settings")
    .eq("id", user.id)
    .single()

  if (!profile?.ministry_id) redirect("/ministries")

  // Parallel fetch: ministry name + chat previews + chat LIST + user teams + active question
  const [ministryResult, chatResult, chatListResult, teamResult, questionResult] = await Promise.all([
    // `timezone` rides this existing fetch (no extra round trip) — the shell
    // provides it to every event surface via MinistryTimezoneProvider.
    supabase.from("ministries").select("name, governance_settings, timezone").eq("id", profile.ministry_id).single(),
    supabase.rpc("get_chat_previews", { p_user_id: user.id, p_ministry_id: profile.ministry_id }),
    // The CHATS TAB's list, fetched on the SERVER so it ships inside the HTML.
    //
    // This used to be a client fetch that could not start until the bundle had
    // downloaded, parsed and hydrated — measured at +2.76s on a throttled mid-range
    // phone BEFORE the first byte of any request left the device. The query itself
    // is single-digit milliseconds, so essentially all of that wait was the client
    // waiting to be able to ask. Riding this existing Promise.all costs no extra
    // round trip (server→DB is same-region) and removes a whole client round trip
    // from the critical path.
    //
    // The twin RPC above (get_chat_previews) feeds the HOME tab's recent-chats strip
    // and is NOT interchangeable with this one — get_chat_list carries unread counts,
    // muted/pinned prefs and the section category the chats tab groups by.
    supabase.rpc("get_chat_list", { p_user_id: user.id, p_ministry_id: profile.ministry_id }),
    supabase
      .from("team_members")
      .select("team_id, role_id, teams(id, name, icon, description, team_type, allow_co_presidency, allow_admin_members), team_roles(id, name, permissions, is_president)")
      .eq("user_id", user.id),
    supabase
      .from("congregation_questions")
      .select("*")
      .eq("ministry_id", profile.ministry_id)
      .eq("is_active", true)
      .maybeSingle(),
  ])

  // Shared with the client refetcher (home-app `loadRecentChats`) — see
  // rowsToChatPreviews. The two used to be hand-kept copies and had drifted.
  const initialRecentChats: ChatPreview[] = rowsToChatPreviews((chatResult.data ?? []) as ChatPreviewRow[])

  // Same mapper the client fetcher uses (app/home/chat-list.ts), so the server seed
  // and any later client revalidation produce identical shapes — otherwise the list
  // would visibly rearrange a beat after first paint.
  const initialChatList: ChatGroup[] = mapChatListRows((chatListResult.data ?? []) as ChatListRow[])

  // Build UserTeam[]
  const initialUserTeams: UserTeam[] = ((teamResult.data ?? []) as RawMembership[]).flatMap((m) => {
    const t = Array.isArray(m.teams) ? m.teams[0] : m.teams
    const r = Array.isArray(m.team_roles) ? m.team_roles[0] : m.team_roles
    if (!t || !r) return []
    const rawType = t.team_type ?? "standard"
    const teamType: "standard" | "dg_praise" | "one_time" = ["standard", "dg_praise", "one_time"].includes(rawType)
      ? (rawType as "standard" | "dg_praise" | "one_time")
      : "standard"
    return [{
      teamId: t.id, teamName: t.name, teamIcon: t.icon, teamDescription: t.description,
      teamType, roleId: r.id, roleName: r.name,
      permissions: Array.isArray(r.permissions) ? r.permissions : [],
      isPresident: !!r.is_president, allowCoPresidency: !!t.allow_co_presidency,
      allowAdminMembers: !!t.allow_admin_members,
    }]
  })

  // Global governance roster — defaults to "all admins govern" when unset.
  // (Pure computation off the Promise.all result — no round trip.)
  const rawGov = (ministryResult.data as { governance_settings?: unknown } | null)?.governance_settings as
    | Partial<GovernanceSettings>
    | null
    | undefined
  const initialGovernanceSettings: GovernanceSettings = {
    all_admins: rawGov?.all_admins ?? true,
    roster_ids: Array.isArray(rawGov?.roster_ids) ? rawGov!.roster_ids : [],
  }

  const userTeamIds = initialUserTeams.map((t) => t.teamId)
  const initialActiveQuestion = (questionResult.data ?? null) as CongregationQuestion | null

  // Two independent follow-ups: team member counts (so the workspace picker shows
  // "N members" on first paint) and whether this user already answered the active
  // congregation question. Each depends only on the Promise.all results above, not
  // on the other — so run them together to save a sequential server round trip.
  const [teamCountResult, respondedResult] = await Promise.all([
    userTeamIds.length > 0
      ? supabase.from("team_members").select("team_id").in("team_id", userTeamIds)
      : Promise.resolve({ data: [] as { team_id: string }[] }),
    initialActiveQuestion
      ? supabase
          .from("congregation_responses")
          .select("id")
          .eq("question_id", initialActiveQuestion.id)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (userTeamIds.length > 0) {
    const counts: Record<string, number> = {}
    for (const row of (teamCountResult.data ?? []) as { team_id: string }[]) {
      counts[row.team_id] = (counts[row.team_id] ?? 0) + 1
    }
    for (const ut of initialUserTeams) ut.memberCount = counts[ut.teamId] ?? 0
  }

  const initialHasResponded = !!respondedResult.data

  // Null-backfill the boot-dropped fat columns (about_me/bible_verse/pray_for_me) so the
  // Profile shape stays complete for consumers/typing even though the shell never reads them.
  const safeProfile = profile
    ? { ...profile, about_me: null, bible_verse: null, pray_for_me: null }
    : {
        id: user.id,
        name: user.email?.split("@")[0] ?? "Member",
        email: user.email ?? "",
        graduation_year: null,
        grade: null,
        needs_grad_check: false,
        role: "member",
        about_me: null,
        bible_verse: null,
        prayer_request: null,
        pray_for_me: null,
        ministry_id: null,
        avatar_url: null,
        school_id: null,
        grad_prompt_dismissed: false,
        compact_sidebar: false,
      }

  return (
    <HomeApp
      userId={user.id}
      initialProfile={safeProfile}
      ministryId={profile.ministry_id}
      ministryName={ministryResult.data?.name ?? ""}
      ministryTimezone={(ministryResult.data as { timezone?: string | null } | null)?.timezone ?? null}
      initialRecentChats={initialRecentChats}
      initialChatList={initialChatList}
      initialChatsSection={initialChatsSection}
      initialUserTeams={initialUserTeams}
      initialActiveQuestion={initialActiveQuestion}
      initialHasResponded={initialHasResponded}
      initialGovernanceSettings={initialGovernanceSettings}
    />
  )
}
