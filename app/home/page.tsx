import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase-server"
import { HomeApp } from "./home-app"
import { formatRelativeTime, getInitials } from "./utils"
import type { UserTeam, CongregationQuestion, GovernanceSettings } from "./types"
import type { ChatPreview } from "@/components/ui/chats-section"

const ADMIN_EMAIL = "brianjeong13@gmail.com"

type PreviewRow = {
  group_id: string; group_name: string; group_type: string
  last_read_at: string | null; last_msg_content: string | null
  last_msg_sender_name: string | null; last_msg_at: string | null
  last_msg_type: string | null; unread_count: number
}

type RawTeamRef = { id: string; name: string; icon: string | null; description: string | null; team_type: string; allow_co_presidency: boolean | null; allow_admin_members: boolean | null }
type RawRoleRef = { id: string; name: string; permissions: string[]; is_president: boolean | null }
type RawMembership = {
  team_id: string
  role_id: string
  teams: RawTeamRef | RawTeamRef[] | null
  team_roles: RawRoleRef | RawRoleRef[] | null
}

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")
  if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) redirect("/admin")

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, graduation_year, grade, needs_grad_check, role, about_me, bible_verse, prayer_request, pray_for_me, ministry_id, avatar_url, school_id, seen_workspace_nav_hint")
    .eq("id", user.id)
    .single()

  if (!profile?.ministry_id) redirect("/join")

  // Parallel fetch: ministry name + chat previews + user teams + active question
  const [ministryResult, chatResult, teamResult, questionResult] = await Promise.all([
    supabase.from("ministries").select("name, governance_settings").eq("id", profile.ministry_id).single(),
    supabase.rpc("get_chat_previews", { p_user_id: user.id, p_ministry_id: profile.ministry_id }),
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

  // Build sorted ChatPreview[]
  const rawPreviews = ((chatResult.data ?? []) as PreviewRow[]).map((row) => ({
    id: row.group_id,
    groupName: row.group_name,
    lastMessage: row.last_msg_content ?? "",
    lastMessageSender: row.last_msg_sender_name ?? "",
    unreadCount: Number(row.unread_count),
    initials: getInitials(row.group_name),
    time: row.last_msg_at ? formatRelativeTime(row.last_msg_at) : "",
    _ts: row.last_msg_at ?? "",
  }))
  rawPreviews.sort((a, b) => {
    if (!a._ts && !b._ts) return 0
    if (!a._ts) return 1
    if (!b._ts) return -1
    return b._ts.localeCompare(a._ts)
  })
  const initialRecentChats: ChatPreview[] = rawPreviews.map(({ _ts: _, ...rest }) => rest)

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

  // Member counts for the user's teams, so the workspace picker shows "N members"
  // on first paint (the client loadUserTeams refetch is skip-guarded on mount).
  const userTeamIds = initialUserTeams.map((t) => t.teamId)
  if (userTeamIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("team_members")
      .select("team_id")
      .in("team_id", userTeamIds)
    const counts: Record<string, number> = {}
    for (const row of (memberRows ?? []) as { team_id: string }[]) {
      counts[row.team_id] = (counts[row.team_id] ?? 0) + 1
    }
    for (const ut of initialUserTeams) ut.memberCount = counts[ut.teamId] ?? 0
  }

  // Active question + whether this user already responded (sequential — depends on question)
  // Global governance roster — defaults to "all admins govern" when unset.
  const rawGov = (ministryResult.data as { governance_settings?: unknown } | null)?.governance_settings as
    | Partial<GovernanceSettings>
    | null
    | undefined
  const initialGovernanceSettings: GovernanceSettings = {
    all_admins: rawGov?.all_admins ?? true,
    roster_ids: Array.isArray(rawGov?.roster_ids) ? rawGov!.roster_ids : [],
  }

  const initialActiveQuestion = (questionResult.data ?? null) as CongregationQuestion | null
  let initialHasResponded = false
  if (initialActiveQuestion) {
    const { data: resp } = await supabase
      .from("congregation_responses")
      .select("id")
      .eq("question_id", initialActiveQuestion.id)
      .eq("user_id", user.id)
      .maybeSingle()
    initialHasResponded = !!resp
  }

  const safeProfile = profile ?? {
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
  }

  return (
    <HomeApp
      userId={user.id}
      initialProfile={safeProfile}
      ministryId={profile.ministry_id}
      ministryName={ministryResult.data?.name ?? ""}
      initialRecentChats={initialRecentChats}
      initialUserTeams={initialUserTeams}
      initialActiveQuestion={initialActiveQuestion}
      initialHasResponded={initialHasResponded}
      initialGovernanceSettings={initialGovernanceSettings}
    />
  )
}
