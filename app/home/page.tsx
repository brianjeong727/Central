import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase-server"
import { HomeApp } from "./home-app"
import { rowsToChatPreviews, type ChatPreviewRow } from "./utils"
import { mapChatListRows, toDeletedDmSet, DELETED_DM_RPC, type ChatListRow } from "./chat-list"
import { resolveChatsSection } from "./tabs/chat-shared"
import type { UserTeam, CongregationQuestion, GovernanceSettings, BootStream } from "./types"

const ADMIN_EMAIL = "brianjeong13@gmail.com"

// Same skew proxy.ts uses: a token this close to expiry is treated as expired so
// the refresh path runs instead of a claim that dies mid-request.
const EXP_SKEW_SECONDS = 60

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type RawTeamRef = { id: string; name: string; icon: string | null; description: string | null; team_type: string; allow_co_presidency: boolean | null; allow_admin_members: boolean | null }
type RawRoleRef = { id: string; name: string; permissions: string[]; is_president: boolean | null }
type RawMembership = {
  team_id: string
  role_id: string
  teams: RawTeamRef | RawTeamRef[] | null
  team_roles: RawRoleRef | RawRoleRef[] | null
}

// Verify the JWT LOCALLY first (ES256 against the cached JWKS, no round trip) and
// only fall back to getUser() — a real network call to GoTrue — when the token is
// missing / invalid / expired / within the expiry skew. Mirrors proxy.ts:114-135
// exactly; this page reads only `sub` and `email`, both of which are verified
// claims on the access token.
//
// This does NOT weaken session refresh: a Server Component cannot set cookies
// (see lib/supabase-server.ts — setAll is a swallowed no-op here), so getUser()'s
// refresh could never have been PERSISTED from this file. proxy.ts runs the same
// claims-then-refresh pair on every request and CAN write the rotated cookies, so
// server-side refresh keeps happening exactly where it always did.
async function resolveUser(supabase: SupabaseServerClient): Promise<{ id: string; email?: string | null } | null> {
  try {
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims as { sub?: string; email?: string; exp?: number } | undefined
    const nowSec = Math.floor(Date.now() / 1000)
    if (claims?.sub && typeof claims.exp === "number" && claims.exp - nowSec > EXP_SKEW_SECONDS) {
      return { id: claims.sub, email: claims.email ?? null }
    }
  } catch {
    // Any verification error → fall through to the getUser refresh path below.
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? { id: user.id, email: user.email } : null
}

// Everything that gates NOTHING. Started after the blocking batch (these need
// ministry_id / the team ids) and handed to the client UNAWAITED, so the shell
// flushes while they are in flight.
//
// It must never reject: a rejected promise reaching `use()` on the client throws
// to the nearest error boundary, and an unawaited rejection on the server is an
// unhandled rejection. Every failure degrades to the empty shape (the same
// outcome the old code produced when a query errored — `?? []`), loudly logged.
function loadBootStream(
  supabase: SupabaseServerClient,
  userId: string,
  ministryId: string,
  teamIds: string[],
): Promise<BootStream> {
  return (async (): Promise<BootStream> => {
    const [chatResult, chatListResult, questionResult, deletedDmResult, teamCountResult] = await Promise.all([
      // Home tab's recent-chats strip. NOT interchangeable with get_chat_list
      // below — that one carries unread counts, muted/pinned prefs and the
      // section category the chats tab groups by.
      supabase.rpc("get_chat_previews", { p_user_id: userId, p_ministry_id: ministryId }),
      // The CHATS TAB's list, still fetched on the SERVER so it ships inside the
      // HTML — it is simply in a later chunk of the same response now. It used to
      // be a client fetch that could not START until the bundle had downloaded,
      // parsed and hydrated (+2.76s on a throttled mid-range phone for a query
      // that takes single-digit ms).
      supabase.rpc("get_chat_list", { p_user_id: userId, p_ministry_id: ministryId }),
      supabase
        .from("congregation_questions")
        .select("*")
        .eq("ministry_id", ministryId)
        .eq("is_active", true)
        .maybeSingle(),
      // Which of this user's DMs are dead threads (the counterpart deleted their
      // account). The client fetcher runs the SAME call in ITS Promise.all, so the
      // SSR seed and the first revalidation agree on the order. The rejection
      // handler is load-bearing: a cosmetic sort must never take the page down.
      supabase.rpc(DELETED_DM_RPC).then((r) => r, () => null),
      // Team member counts, so the workspace picker shows "N members" on first
      // paint. Only needs the team IDS, which the blocking batch already has —
      // so this rides the same round trip instead of chaining behind it.
      teamIds.length > 0
        ? supabase.from("team_members").select("team_id").in("team_id", teamIds)
        : Promise.resolve({ data: [] as { team_id: string }[] }),
    ])

    const activeQuestion = (questionResult.data ?? null) as CongregationQuestion | null

    // The one genuinely dependent query (it needs the question id). It is the
    // TAIL of the stream, not of the response — nothing waits on it.
    let hasResponded = false
    if (activeQuestion) {
      const { data } = await supabase
        .from("congregation_responses")
        .select("id")
        .eq("question_id", activeQuestion.id)
        .eq("user_id", userId)
        .maybeSingle()
      hasResponded = !!data
    }

    const teamMemberCounts: Record<string, number> = {}
    for (const row of (teamCountResult.data ?? []) as { team_id: string }[]) {
      teamMemberCounts[row.team_id] = (teamMemberCounts[row.team_id] ?? 0) + 1
    }

    return {
      // Shared with the client refetcher (home-app `loadRecentChats`).
      recentChats: rowsToChatPreviews((chatResult.data ?? []) as ChatPreviewRow[]),
      // Same mapper the client fetcher uses (app/home/chat-list.ts), so the server
      // seed and any later client revalidation produce identical shapes —
      // otherwise the list would visibly rearrange a beat after first paint.
      chatList: mapChatListRows(
        (chatListResult.data ?? []) as ChatListRow[],
        toDeletedDmSet(deletedDmResult),
      ),
      activeQuestion,
      hasResponded,
      teamMemberCounts,
    }
  })().catch((err) => {
    console.error("[home] boot stream failed", err)
    // Spelled out rather than imported: the client-side twin of this constant
    // lives in a "use client" module, which a Server Component cannot read.
    return { recentChats: [], chatList: [], activeQuestion: null, hasResponded: false, teamMemberCounts: {} }
  })
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

  const user = await resolveUser(supabase)

  if (!user) redirect("/login")
  if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) redirect("/admin")

  // ── The BLOCKING batch: exactly what a redirect decision or a synchronous
  // useState initializer needs, in ONE round trip. ────────────────────────────
  //
  //   profile          → the /ministries redirect + read everywhere in the shell
  //   ministries       → name/timezone/governance; embedded on the profile row
  //                      (FK profiles_ministry_id_fkey, disambiguated because
  //                      ministries.archive_requested_by points back at profiles)
  //                      so it costs no second trip even though it is keyed by a
  //                      column of the profile we are fetching
  //   team_members     → home-app decides workspace auto-enter SYNCHRONOUSLY in
  //                      the activeTeamId useState initializer, so this cannot be
  //                      streamed without moving that decision into an effect and
  //                      risking a visible flash. It is keyed by user_id only, so
  //                      it parallelizes with the profile.
  //
  // Boot-slim profile select: only columns the shell + tabs actually consume off
  // initialProfile. Dropped about_me/bible_verse/pray_for_me (null-backfilled
  // below to satisfy the Profile type) — the directory reads its OWN fetched
  // member detail. prayer_request stays: ProfileTab seeds its edit form from it.
  const [profileResult, teamResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, email, graduation_year, grade, needs_grad_check, role, prayer_request, ministry_id, avatar_url, school_id, seen_workspace_nav_hint, grad_prompt_dismissed, compact_sidebar, notification_settings, ministries!profiles_ministry_id_fkey(name, governance_settings, timezone)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("team_members")
      .select("team_id, role_id, teams(id, name, icon, description, team_type, allow_co_presidency, allow_admin_members), team_roles(id, name, permissions, is_president)")
      .eq("user_id", user.id),
  ])

  const profileRow = profileResult.data as
    | (Record<string, unknown> & {
        ministry_id: string | null
        ministries?: { name: string | null; governance_settings: unknown; timezone: string | null } | { name: string | null; governance_settings: unknown; timezone: string | null }[] | null
      })
    | null

  if (!profileRow?.ministry_id) redirect("/ministries")

  const ministryId = profileRow.ministry_id
  // PostgREST types a to-one embed as possibly-array; normalize before reading.
  const ministryRow = Array.isArray(profileRow.ministries) ? profileRow.ministries[0] : profileRow.ministries

  // The embed is a nested object on the profile row — strip it back off so
  // initialProfile keeps the exact flat Profile shape every consumer expects.
  const { ministries: _ministries, ...profile } = profileRow

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
  // (Pure computation off the blocking batch — no round trip.)
  const rawGov = ministryRow?.governance_settings as Partial<GovernanceSettings> | null | undefined
  const initialGovernanceSettings: GovernanceSettings = {
    all_admins: rawGov?.all_admins ?? true,
    roster_ids: Array.isArray(rawGov?.roster_ids) ? rawGov!.roster_ids : [],
  }

  // NOT awaited — this is the whole point. See ./boot-stream.tsx.
  const bootStream = loadBootStream(
    supabase,
    user.id,
    ministryId,
    initialUserTeams.map((t) => t.teamId),
  )

  // Null-backfill the boot-dropped fat columns (about_me/bible_verse/pray_for_me) so the
  // Profile shape stays complete for consumers/typing even though the shell never reads them.
  const safeProfile = { ...profile, about_me: null, bible_verse: null, pray_for_me: null } as Parameters<typeof HomeApp>[0]["initialProfile"]

  return (
    <HomeApp
      userId={user.id}
      initialProfile={safeProfile}
      ministryId={ministryId}
      ministryName={ministryRow?.name ?? ""}
      ministryTimezone={ministryRow?.timezone ?? null}
      initialChatsSection={initialChatsSection}
      initialUserTeams={initialUserTeams}
      initialGovernanceSettings={initialGovernanceSettings}
      bootStream={bootStream}
    />
  )
}
