"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { SWRConfig, useSWRConfig } from "swr"
import dynamic from "next/dynamic"
import { MessageCircle, ArrowLeft } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { BottomNav } from "@/components/ui/bottom-nav"
import type { ChatPreview } from "@/components/ui/chats-section"

// Types
import type { Tab, Profile, UserTeam, Team, HomeAppProps, CongregationQuestion, GovernanceSettings } from "./types"
import { formatRelativeTime, getInitials } from "./utils"
import { isGovernanceAdmin as computeIsGovernanceAdmin, teamAccessLevel } from "./governance"
import { classifyTeam } from "./team-type"
import { useNavState } from "./nav-state"
import { fetchChatList } from "./chat-list"

// Components
import { CommandPalette } from "./components/command-palette"
import { DesktopSidebar, DesktopTopbar, ReceiptsSidebarNav } from "./components/desktop-nav"

// Tabs
// HomeTab stays eager — it's the default landing tab. Every other tab (and the
// extra overlay/sidebar symbols home-app references from those tab files) is
// code-split via next/dynamic so its JS only ships when that tab/overlay opens.
// ssr:false is safe: tabs render conditionally on the client. Each dynamic gets
// the matching Item-2 skeleton where one exists, otherwise the shared Spinner.
import { HomeTab } from "./tabs/home-tab"
import { Spinner } from "./components/shared"
import { AnnouncementsTabSkeleton, DirectoryTabSkeleton, ChatListSkeleton, ProfileTabSkeleton } from "@/components/central"
import type { CalendarEvent } from "./types"
import type { DirectoryMember } from "./types"
import { selfLeaveMinistry } from "@/app/actions/ministry"

const AnnouncementsTab = dynamic(() => import("./tabs/announcements-tab").then(m => m.AnnouncementsTab), { loading: () => <AnnouncementsTabSkeleton />, ssr: false })
const AnnouncementDetailView = dynamic(() => import("./tabs/announcements-tab").then(m => m.AnnouncementDetailView), { loading: () => <Spinner />, ssr: false })

const ChatsTab = dynamic(() => import("./tabs/chats-tab").then(m => m.ChatsTab), { loading: () => <Spinner />, ssr: false })
const ChatScreen = dynamic(() => import("./tabs/chats-tab").then(m => m.ChatScreen), { loading: () => <Spinner />, ssr: false })
const ChatListPanel = dynamic(() => import("./tabs/chats-tab").then(m => m.ChatListPanel), { loading: () => <ChatListSkeleton />, ssr: false })

const PlanTab = dynamic(() => import("./tabs/plan-tab").then(m => m.PlanTab), { loading: () => <Spinner />, ssr: false })
const StudentOrgSectionNav = dynamic(() => import("./tabs/plan-tab").then(m => m.StudentOrgSectionNav), { loading: () => <Spinner />, ssr: false })
const SmallGroupSectionNav = dynamic(() => import("./tabs/plan-tab").then(m => m.SmallGroupSectionNav), { loading: () => <Spinner />, ssr: false })
const FinanceSectionNav = dynamic(() => import("./tabs/plan-tab").then(m => m.FinanceSectionNav), { loading: () => <Spinner />, ssr: false })

const DirectoryTab = dynamic(() => import("./tabs/directory-tab").then(m => m.DirectoryTab), { loading: () => <DirectoryTabSkeleton />, ssr: false })
const GiveView = dynamic(() => import("./components/give-view").then(m => m.GiveView), { loading: () => <Spinner />, ssr: false })
const ProfileTab = dynamic(() => import("./tabs/profile-tab").then(m => m.ProfileTab), { loading: () => <ProfileTabSkeleton />, ssr: false })
const SettingsTab = dynamic(() => import("./tabs/settings-tab").then(m => m.SettingsTab), { loading: () => <Spinner />, ssr: false })
const FormsTab = dynamic(() => import("./tabs/forms-tab").then(m => m.FormsTab), { loading: () => <Spinner />, ssr: false })
const CongregationTab = dynamic(() => import("./tabs/congregation-tab").then(m => m.CongregationTab), { loading: () => <Spinner />, ssr: false })

export function HomeApp({ userId, initialProfile, ministryId, ministryName, initialRecentChats, initialUserTeams, initialActiveQuestion, initialHasResponded, initialGovernanceSettings }: HomeAppProps) {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const { mutate: globalMutate } = useSWRConfig()

  const validTabs: Tab[] = ["home", "announcements", "chats", "plan", "directory", "give", "profile", "settings", "forms", "congregation"]
  const TAB_ALIASES: Record<string, Tab> = { you: "profile" }
  const rawTab = searchParams.get("tab")
  const resolvedTab = rawTab ? (TAB_ALIASES[rawTab] ?? rawTab) as Tab : null
  const initialTab = resolvedTab && validTabs.includes(resolvedTab) ? resolvedTab : "home"
  const [activeTab, setActiveTabState] = useState<Tab>(initialTab)
  // Bumped only on an active-tab RESET (re-click) to force-remount the active tab
  // so it re-lazy-inits its internal view-state from the now-cleared URL params.
  // Never bumped on a normal tab switch (resume-where-left-off stays intact).
  const [navResetKey, setNavResetKey] = useState(0)

  // Canonical URL-param helpers (shared module, one atomic replace each).
  const { setParam, setParams, clearTabParams } = useNavState()
  // Thin alias preserves every existing `replaceParam(key, value)` call site.
  const replaceParam = setParam
  // Restore the open conversation from ?chat — but only when the chats tab is the
  // active tab, so the fullscreen overlay never leaks over another restored tab on
  // reload. Name is unknown at mount → init "" and backfill from recentChats below.
  // Init from `searchParams` (useSearchParams), NOT window.location.search — the latter
  // is undefined on the server, so SSR rendered the "no chat" branch while the client
  // restored the chat → hydration mismatch. searchParams is SSR-consistent (same source
  // as initialTab), so server and client agree on the first render.
  const [globalOpenChat, setGlobalOpenChat] = useState<{ id: string; name: string } | null>(() => {
    const chatId = searchParams.get("chat")
    return chatId && initialTab === "chats" ? { id: chatId, name: "" } : null
  })
  // Announcement detail is a read view → restore from ?ann on reload (overlay can sit over any tab).
  const [openAnnouncementId, setOpenAnnouncementId] = useState<string | null>(() =>
    searchParams.get("ann")
  )
  const [totalChatsUnread, setTotalChatsUnread] = useState(() =>
    (initialRecentChats ?? []).reduce((sum, c) => sum + c.unreadCount, 0)
  )
  const [chatRefreshKey, setChatRefreshKey] = useState(0)
  const [recentChats, setRecentChats] = useState<ChatPreview[]>(initialRecentChats ?? [])
  const [userTeams, setUserTeams] = useState<UserTeam[]>(initialUserTeams ?? [])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatar_url ?? null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [activeQuestion, setActiveQuestion] = useState<CongregationQuestion | null>(initialActiveQuestion ?? null)
  const [hasResponded, setHasResponded] = useState(initialHasResponded ?? false)
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [activeTeamId, setActiveTeamId] = useState<string | null>(() => {
    const urlTeam = searchParams.get("team")
    if (urlTeam) return urlTeam
    // 0 teams → null (empty state); 1 team → auto-enter; 2+ teams → null (picker)
    return (initialUserTeams?.length ?? 0) === 1 ? initialUserTeams![0].teamId : null
  })
  const [activeMemberId, setActiveMemberId] = useState<string | null>(searchParams.get("member"))
  const [selectedDirectoryMember, setSelectedDirectoryMember] = useState<DirectoryMember | null>(null)
  const validSections = ["spiritual-profile", "journal"] as const
  const initialSection = searchParams.get("section") as "spiritual-profile" | "journal" | null
  const [profileSection, setProfileSection] = useState<"spiritual-profile" | "journal">(
    initialSection && (validSections as readonly string[]).includes(initialSection) ? initialSection : "spiritual-profile"
  )

  // Sub-page params that belong to a team workspace — cleared on every team switch
  // so the new team never inherits the previous team's deep-link state.
  const TEAM_SUBPARAMS = { sotab: null, ptab: null, sgltab: null, fsec: null, evtab: null, rteam: null } as const

  function handleTeamChange(teamId: string) {
    setActiveTeamId(teamId)
    // One atomic replace (Convention #5): set the new team AND clear all of the
    // previous team's sub-params in a single URL update. PlanTab no longer owns
    // this clear (its teamSwitchRef effect only does non-URL bookkeeping now).
    setParams({ team: teamId, ...TEAM_SUBPARAMS })
  }

  // Team selected WITHIN the Receipts workspace (sentinel activeTeamId === "receipts").
  const [activeReceiptsTeamId, setActiveReceiptsTeamId] = useState<string | null>(
    () => searchParams.get("rteam")
  )

  function handleReceiptsTeamChange(teamId: string) {
    setActiveReceiptsTeamId(teamId)
    // One atomic replace (Convention #5) via the shared nav-state module.
    setParam("rteam", teamId)
  }

  function handleProfileSectionChange(section: "spiritual-profile" | "journal") {
    setProfileSection(section)
    replaceParam("section", section === "spiritual-profile" ? null : section)
  }

  function handleMemberSelect(memberId: string | null) {
    setActiveMemberId(memberId)
    replaceParam("member", memberId)
  }

  function handleDirectoryMemberSelect(member: DirectoryMember) {
    setSelectedDirectoryMember(member)
    handleMemberSelect(member.id)
  }
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [ministryIsPublic, setMinistryIsPublic] = useState(false)

  // Graduation prompt — show once per session if user's graduation year has passed
  const [showGradPrompt, setShowGradPrompt] = useState(false)
  const [gradPromptLoading, setGradPromptLoading] = useState(false)

  const isAdmin = ["admin", "deacon", "elder", "pastor"].includes(initialProfile.role.toLowerCase())
  // WHO governs teams: by default every admin-tier user; if the roster narrows it,
  // only listed admins. Behavior-preserving while governance is all_admins.
  const governanceSettings: GovernanceSettings = initialGovernanceSettings ?? { all_admins: true, roster_ids: [] }
  const isGovernanceAdmin = computeIsGovernanceAdmin(userId, isAdmin, governanceSettings)
  // Governance-accessible non-member teams: teams the user is NOT on but can enter
  // via the matrix (gov-view/gov-write). Mirrors plan-tab's `govTeams` derivation.
  const memberTeamIds = new Set(userTeams.map(t => t.teamId))
  const govTeams = allTeams.filter(t => {
    if (memberTeamIds.has(t.id)) return false
    const access = teamAccessLevel({ isMember: false, isGovernanceAdmin, adminAccess: t.admin_access })
    return access === "gov-view" || access === "gov-write"
  })
  const govTeamCount = govTeams.length
  // Teams shown in the Receipts workspace sidebar: member teams OR governed teams.
  const receiptsTeams = [
    ...userTeams.map(t => ({ id: t.teamId, name: t.teamName })),
    ...govTeams.map(t => ({ id: t.id, name: t.name })),
  ]

  // Single-team auto-enter: if the user lands on Plan with 1 team and no selection
  // (e.g. after clicking "← ALL TEAMS"), re-enter immediately via the same handleTeamChange path.
  // Skip auto-enter when the user also has governance-accessible teams, so the picker
  // (and its "Admin access" group) stays reachable.
  useEffect(() => {
    if (activeTab === "plan" && userTeams.length === 1 && govTeamCount === 0 && !activeTeamId) {
      handleTeamChange(userTeams[0].teamId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userTeams.length, govTeamCount, activeTeamId])

  useEffect(() => {
    const gradYear = initialProfile.graduation_year
    if (!gradYear) return
    const now = new Date()
    const month = now.getMonth() + 1 // 1-indexed
    const year = now.getFullYear()
    // Show from May (5) of graduation year onward
    if (gradYear <= year && month >= 5) {
      const key = `grad_prompt_dismissed_${gradYear}`
      if (!sessionStorage.getItem(key)) setShowGradPrompt(true)
    }
  }, [initialProfile.graduation_year])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setPaletteOpen(true) }
    }
    function handleOpenEvent() { setPaletteOpen(true) }
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("open-command-palette", handleOpenEvent)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("open-command-palette", handleOpenEvent)
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  const isPastor = initialProfile.role.toLowerCase() === "pastor"
  const isTreasurer = userTeams.some(t => t.permissions.includes("can_view_finances"))
  const isDGL = userTeams.some(t => t.permissions.some(p => ["can_create_dgs", "can_view_dgs"].includes(p)))
  const canCreateTeam = isAdmin

  // Student Org Board planning state — lifted here for breadcrumb + sidebar
  const validSOSections = ["General", "Meeting Notes", "Events", "Resources", "Groups", "Rotations"] as const
  const initialSOSection = searchParams.get("sotab")
  const [studentOrgSection, setStudentOrgSection] = useState<string>(
    initialSOSection && (validSOSections as readonly string[]).includes(initialSOSection) ? initialSOSection : "Events"
  )
  const [studentOrgPlanningEvent, setStudentOrgPlanningEvent] = useState<CalendarEvent | null>(null)
  const [studentOrgCalEvents, setStudentOrgCalEvents] = useState<CalendarEvent[]>([])

  function handleStudentOrgSectionChange(s: string) {
    setStudentOrgSection(s)
    replaceParam("sotab", s === "Events" ? null : s)
  }

  // Small Group Leaders section state — lifted here for sidebar
  const validSGLSections = ["bible_study", "schedule"] as const
  const initialSGLSection = searchParams.get("sgltab")
  const [sglSection, setSglSection] = useState<string>(
    initialSGLSection && (validSGLSections as readonly string[]).includes(initialSGLSection) ? initialSGLSection : "bible_study"
  )

  function handleSglSectionChange(s: string) {
    setSglSection(s)
    replaceParam("sgltab", s === "bible_study" ? null : s)
  }

  // Finance Team section state — lifted here so it drives the sidebar nav (not a content strip)
  const validFinanceSections = ["reimbursements", "budget", "allocation"] as const
  const initialFinanceSection = searchParams.get("fsec")
  const [financeTeamSection, setFinanceTeamSection] = useState<string>(
    initialFinanceSection && (validFinanceSections as readonly string[]).includes(initialFinanceSection) ? initialFinanceSection : "reimbursements"
  )

  function handleFinanceSectionChange(s: string) {
    setFinanceTeamSection(s)
    replaceParam("fsec", s === "reimbursements" ? null : s)
  }

  // Congregation sub-view — lifted so shell can build accurate crumbs
  const [congregationView, setCongregationView] = useState<"list" | "create" | "detail">("list")

  // Compute whether the student org board is the active team on desktop (drives sidebar + breadcrumb).
  // Resolve from membership first, then from allTeams — a governance admin may be viewing a team
  // they don't belong to (gov-view). Without the allTeams fallback the shell would mirror the user's
  // member-team list instead of the team actually being viewed.
  const activeUserTeamForPlan = userTeams.find(t => t.teamId === activeTeamId)
  const activeAllTeamForPlan = allTeams.find(t => t.id === activeTeamId)
  const activeTeamNameForPlan = activeUserTeamForPlan?.teamName ?? activeAllTeamForPlan?.name ?? ""
  // Single classifier — team_type + name only, no permission probes (see
  // app/home/team-type.ts). Resolve from allTeams (carries team_type even for
  // gov-entered teams), falling back to the UserTeam name when not in allTeams.
  const planTeamKind = classifyTeam(
    activeAllTeamForPlan ?? (activeTeamNameForPlan ? { name: activeTeamNameForPlan } : null)
  )
  const isPlanDesktopTeam = activeTab === "plan" && isDesktop
  const isFinanceActive = isPlanDesktopTeam && planTeamKind === "finance"
  const isStudentOrgActive = isPlanDesktopTeam && planTeamKind === "studentOrg"
  const isDGLActive = isPlanDesktopTeam && planTeamKind === "dgl"

  // Receipts sentinel active → its sidebar lists the user's member/governed teams.
  const isReceiptsActive = activeTab === "plan" && isDesktop && activeTeamId === "receipts"

  // Plan context sidebar — replaces the flat team list when student org or DGL is active.
  // The section-nav components only need activeSection/onSectionChange (not the member object),
  // so these render for gov-entered teams too — no `&& activeUserTeamForPlan` guard.
  const planContextContent = isReceiptsActive ? (
    <ReceiptsSidebarNav
      teams={receiptsTeams}
      active={activeReceiptsTeamId}
      onSelect={handleReceiptsTeamChange}
    />
  ) : isStudentOrgActive ? (
    <StudentOrgSectionNav
      activeSection={studentOrgSection}
      onSectionChange={handleStudentOrgSectionChange}
      calEvents={studentOrgCalEvents}
      planningEvent={studentOrgPlanningEvent}
      onPlanningEventChange={(ev) => {
        if (ev) handleStudentOrgSectionChange("Events")
        setStudentOrgPlanningEvent(ev)
      }}
    />
  ) : isDGLActive ? (
    <SmallGroupSectionNav
      activeSection={sglSection}
      onSectionChange={handleSglSectionChange}
    />
  ) : isFinanceActive ? (
    <FinanceSectionNav
      active={financeTeamSection}
      onChange={handleFinanceSectionChange}
    />
  ) : undefined

  // Shell breadcrumb computation — derived from shell-known state, no tab props needed
  function getShellCrumbs(): string[] {
    const congregationLabels: Record<string, string> = { list: "", create: "New question", detail: "Responses" }
    switch (activeTab) {
      case "home":          return ["Central", "Home"]
      case "announcements": return ["Central", "Announcements"]
      case "give":          return ["Central", "Give"]
      case "forms":         return ["Central", "Forms"]
      case "settings":      return ["Central", "Settings"]
      case "chats":         return ["Central", "Chats"]
      case "plan": {
        if (activeTeamId === "receipts") return ["Central", "Planning", "Receipts"]
        if (!activeTeamId || !activeTeamNameForPlan) return ["Central", "Planning"]
        if (isStudentOrgActive && studentOrgPlanningEvent) {
          return ["Central", "Planning", activeTeamNameForPlan, studentOrgPlanningEvent.title]
        }
        return ["Central", "Planning", activeTeamNameForPlan]
      }
      case "directory":     return ["Central", "Directory"]
      case "profile":       return profileSection === "journal" ? ["Central", "Journal"] : ["Central", "Profile"]
      case "congregation":  return congregationLabels[congregationView]
        ? ["Central", "Congregation", congregationLabels[congregationView]]
        : ["Central", "Congregation"]
      default:              return ["Central"]
    }
  }

  type ChatPreviewRow = {
    group_id: string; group_name: string; group_type: string
    last_read_at: string | null; last_msg_content: string | null
    last_msg_sender_name: string | null; last_msg_at: string | null
    last_msg_type: string | null; unread_count: number
  }

  // Single DB round-trip via get_chat_previews function (replaces unbounded messages fetch)
  const loadRecentChats = useCallback(async () => {
    const { data } = await supabase.rpc("get_chat_previews", {
      p_user_id: userId,
      p_ministry_id: ministryId,
    })
    if (!data) return

    const previews = ((data as ChatPreviewRow[])
      .map((row) => ({
        id: row.group_id,
        groupName: row.group_name,
        type: row.group_type,
        lastMessage: row.last_msg_content ?? "",
        lastMessageSender: row.last_msg_sender_name ?? "",
        unreadCount: Number(row.unread_count),
        initials: getInitials(row.group_name),
        time: row.last_msg_at ? formatRelativeTime(row.last_msg_at) : "",
        _ts: row.last_msg_at ?? "",
      }))
      .sort((a, b) => {
        if (!a._ts && !b._ts) return 0
        if (!a._ts) return 1
        if (!b._ts) return -1
        return b._ts.localeCompare(a._ts)
      })
      .map(({ _ts: _, ...rest }) => rest)) as ChatPreview[]

    setRecentChats(previews)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ministryId])

  const loadUserTeams = useCallback(async () => {
    type RawTeamRef = { id: string; name: string; icon: string | null; description: string | null; team_type: string; allow_co_presidency: boolean | null; allow_admin_members: boolean | null }
    type RawRoleRef = { id: string; name: string; permissions: string[]; is_president: boolean | null }
    type RawMembership = {
      team_id: string
      role_id: string
      teams: RawTeamRef | RawTeamRef[] | null
      team_roles: RawRoleRef | RawRoleRef[] | null
    }
    const { data } = await supabase
      .from("team_members")
      .select("team_id, role_id, teams(id, name, icon, description, team_type, allow_co_presidency, allow_admin_members), team_roles(id, name, permissions, is_president)")
      .eq("user_id", userId)
    if (!data) return
    const teams: UserTeam[] = (data as RawMembership[]).flatMap((m) => {
      const t = Array.isArray(m.teams) ? m.teams[0] : m.teams
      const r = Array.isArray(m.team_roles) ? m.team_roles[0] : m.team_roles
      if (!t || !r) return []
      const rawType = t.team_type ?? 'standard'
      const teamType: 'standard' | 'dg_praise' | 'one_time' | 'finance' = ['standard','dg_praise','one_time','finance'].includes(rawType) ? rawType as 'standard' | 'dg_praise' | 'one_time' | 'finance' : 'standard'
      return [{ teamId: t.id, teamName: t.name, teamIcon: t.icon, teamDescription: t.description, teamType, roleId: r.id, roleName: r.name, permissions: Array.isArray(r.permissions) ? r.permissions : [], isPresident: !!r.is_president, allowCoPresidency: !!t.allow_co_presidency, allowAdminMembers: !!t.allow_admin_members }]
    })
    // Which of these teams have a member assigned to their president role.
    const ids = teams.map((t) => t.teamId)
    let presidentSet = new Set<string>()
    if (ids.length > 0) {
      const { data: pres } = await supabase
        .from("team_members")
        .select("team_id, team_roles!inner(is_president)")
        .in("team_id", ids)
        .eq("team_roles.is_president", true)
      presidentSet = new Set((pres ?? []).map((r: { team_id: string }) => r.team_id))
    }
    for (const t of teams) t.hasPresident = presidentSet.has(t.teamId)
    setUserTeams(teams)
    setActiveTeamId((prev) => {
      // The Receipts sentinel is not a real team — never reconcile it away on refresh.
      if (prev === "receipts") return prev
      // Keep a valid existing selection; otherwise apply three-way routing
      if (prev && teams.some((t) => t.teamId === prev)) return prev
      return teams.length === 1 ? teams[0].teamId : null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const loadAllTeams = useCallback(async () => {
    // The all-teams governance list is for governing admins only. Non-roster admins
    // don't get it (settings-tab access stays gated on raw isAdmin — anti-lockout).
    if (!isGovernanceAdmin) return
    const { data } = await supabase
      .from("teams")
      .select("id, name, icon, description, created_by, team_type, allow_co_presidency, admin_access, allow_admin_members")
      .eq("ministry_id", ministryId)
      .order("created_at")
    if (!data) return
    const teamIds = (data as { id: string }[]).map((t) => t.id)
    const countMap: Record<string, number> = {}
    let presidentSet = new Set<string>()
    if (teamIds.length > 0) {
      const { data: counts } = await supabase.from("team_members").select("team_id").in("team_id", teamIds)
      for (const m of counts ?? []) countMap[m.team_id] = (countMap[m.team_id] ?? 0) + 1
      const { data: pres } = await supabase
        .from("team_members")
        .select("team_id, team_roles!inner(is_president)")
        .in("team_id", teamIds)
        .eq("team_roles.is_president", true)
      presidentSet = new Set((pres ?? []).map((r: { team_id: string }) => r.team_id))
    }
    type RawTeam = { id: string; name: string; icon: string | null; description: string | null; created_by: string; team_type: string; allow_co_presidency: boolean | null; admin_access: string | null; allow_admin_members: boolean | null }
    setAllTeams((data as RawTeam[]).map((t) => {
      const rawType = t.team_type ?? 'standard'
      const team_type: 'standard' | 'dg_praise' | 'one_time' | 'finance' = ['standard','dg_praise','one_time','finance'].includes(rawType) ? rawType as 'standard' | 'dg_praise' | 'one_time' | 'finance' : 'standard'
      const rawAccess = t.admin_access ?? 'view'
      const admin_access: 'none' | 'view' | 'write' = ['none','view','write'].includes(rawAccess) ? rawAccess as 'none' | 'view' | 'write' : 'view'
      return { ...t, team_type, allow_co_presidency: !!t.allow_co_presidency, admin_access, allow_admin_members: !!t.allow_admin_members, member_count: countMap[t.id] ?? 0, hasPresident: presidentSet.has(t.id) }
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGovernanceAdmin, ministryId])

  const loadActiveQuestion = useCallback(async () => {
    const { data: q } = await supabase
      .from("congregation_questions")
      .select("*")
      .eq("ministry_id", ministryId)
      .eq("is_active", true)
      .maybeSingle()
    setActiveQuestion(q ?? null)
    if (q) {
      const { data: r } = await supabase
        .from("congregation_responses")
        .select("id")
        .eq("question_id", q.id)
        .eq("user_id", userId)
        .maybeSingle()
      setHasResponded(!!r)
    } else {
      setHasResponded(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId, userId])

  // Initial load + reload after closing a chat.
  // recentChats is SSR-seeded from initialRecentChats, so skip the redundant
  // refetch on the very first mount (chatRefreshKey === 0). After a chat closes
  // chatRefreshKey increments (>0) and this effect still refetches — the ref is
  // already true by then, so subsequent runs proceed normally.
  const didInitRecentChats = useRef(false)
  useEffect(() => {
    if (!didInitRecentChats.current) { didInitRecentChats.current = true; return }
    loadRecentChats()
  }, [loadRecentChats, chatRefreshKey])

  // userTeams is SSR-seeded from initialUserTeams → skip the mount refetch.
  // loadAllTeams is admin-only and NOT SSR-seeded → it must still fire on mount,
  // so it lives in its own unguarded effect.
  const didInitUserTeams = useRef(false)
  useEffect(() => {
    if (!didInitUserTeams.current) { didInitUserTeams.current = true; return }
    loadUserTeams()
  }, [loadUserTeams])

  useEffect(() => {
    loadAllTeams()
  }, [loadAllTeams])

  // activeQuestion/hasResponded are SSR-seeded → skip the mount refetch.
  const didInitActiveQuestion = useRef(false)
  useEffect(() => {
    if (!didInitActiveQuestion.current) { didInitActiveQuestion.current = true; return }
    loadActiveQuestion()
  }, [loadActiveQuestion])

  useEffect(() => {
    if (!isAdmin) return
    supabase.from("ministries").select("is_public").eq("id", ministryId).maybeSingle()
      .then(({ data }) => { if (data) setMinistryIsPublic(data.is_public ?? false) })
  }, [isAdmin, ministryId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Latest open chat, read inside the realtime callback without re-subscribing.
  const globalOpenChatRef = useRef(globalOpenChat)
  useEffect(() => { globalOpenChatRef.current = globalOpenChat }, [globalOpenChat])

  // Throttled refetch of the shared chat-list SWR cache (the Messages sidebar).
  // Leading + trailing at 300ms: the first message in a burst refetches instantly,
  // the last one is always captured by the trailing call so the final order/preview/
  // unread land. We pass a FETCHER (not a bare key) to mutate so it never collides
  // with the global dedupingInterval:5000 — provided data updates the cache directly
  // instead of routing through the dedup-gated revalidation path. The fetcher also
  // re-forces the currently-open chat to unread 0, so an incoming-while-open message
  // can't resurrect a badge on the chat the user is actively reading (the open chat's
  // ChatScreen writes last_read_at async, which could otherwise race get_chat_list).
  const chatListThrottle = useRef<{ last: number; timer: ReturnType<typeof setTimeout> | null }>({ last: 0, timer: null })
  const refetchChatList = useCallback(() => {
    const run = () => {
      chatListThrottle.current.last = Date.now()
      globalMutate(
        ["chat-list", userId, ministryId],
        async () => {
          const groups = await fetchChatList(["chat-list", userId, ministryId])
          const openId = globalOpenChatRef.current?.id
          return openId ? groups.map((g) => (g.id === openId ? { ...g, unread_count: 0 } : g)) : groups
        },
        { revalidate: false },
      )
    }
    const elapsed = Date.now() - chatListThrottle.current.last
    if (elapsed >= 300) {
      run()
    } else if (!chatListThrottle.current.timer) {
      chatListThrottle.current.timer = setTimeout(() => {
        chatListThrottle.current.timer = null
        run()
      }, 300 - elapsed)
    }
  }, [globalMutate, userId, ministryId])

  // Realtime: keep recentChats preview fresh as messages arrive
  useEffect(() => {
    const channel = supabase
      .channel("home-app-recent-chats")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as { group_id: string; content: string; created_at: string; sender_id: string }
          // Drive the Messages sidebar live (order, preview, unread badges).
          refetchChatList()
          supabase
            .from("profiles")
            .select("name")
            .eq("id", msg.sender_id)
            .single()
            .then(({ data: prof }) => {
              const isOwnMessage = msg.sender_id === userId
              setRecentChats((prev) => {
                const existing = prev.find((c) => c.id === msg.group_id)
                if (!existing) return prev
                const updated = prev.map((c) =>
                  c.id === msg.group_id
                    ? {
                        ...c,
                        lastMessage: msg.content,
                        lastMessageSender: prof?.name ?? "",
                        time: formatRelativeTime(msg.created_at),
                        _ts: msg.created_at,
                        unreadCount: isOwnMessage ? c.unreadCount : c.unreadCount + 1,
                      } as ChatPreview & { _ts: string }
                    : c
                )
                // Re-sort so the updated chat bubbles to the top
                return [...updated].sort((a, b) => {
                  const ta = (a as ChatPreview & { _ts: string })._ts ?? ""
                  const tb = (b as ChatPreview & { _ts: string })._ts ?? ""
                  return tb.localeCompare(ta)
                })
              })
            })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Single RPC call replaces N parallel COUNT queries (one per group)
  const recountTotalUnread = useCallback(async () => {
    const { data } = await supabase.rpc("get_chat_previews", {
      p_user_id: userId,
      p_ministry_id: ministryId,
    })
    const total = (data ?? []).reduce(
      (sum: number, row: { unread_count: number }) => sum + Number(row.unread_count),
      0
    )
    setTotalChatsUnread(total)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ministryId])

  // On desktop, auto-select the most recent chat when arriving at the chats tab.
  // This is the master-detail DEFAULT for the empty state only — it writes NO URL
  // (Convention #5: avoid racing the nav's setParams). An explicitly-opened chat
  // owns ?chat via handleOpenChat; `!globalOpenChat` already prevents overriding a
  // URL-restored conversation (the lazy-init sets it before this effect runs).
  useEffect(() => {
    if (isDesktop && activeTab === "chats" && !globalOpenChat && recentChats.length > 0) {
      const top = recentChats[0]
      setGlobalOpenChat({ id: top.id, name: top.groupName })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, activeTab, recentChats])

  // Backfill the header name for a URL-restored chat once recentChats loads.
  useEffect(() => {
    if (!globalOpenChat || globalOpenChat.name !== "") return
    const match = recentChats.find((c) => c.id === globalOpenChat.id)
    if (match) setGlobalOpenChat((prev) => prev && prev.name === "" ? { ...prev, name: match.groupName } : prev)
  }, [globalOpenChat, recentChats])

  // Opening a chat is atomic: switch to the chats tab, mirror ?chat, and (when the
  // group category is known) set ?chats so the church/my subtab reflects the open
  // chat — all in one replace.
  function handleOpenChat(id: string, name: string, type?: string) {
    setActiveTabState("chats")
    setGlobalOpenChat({ id, name })
    const sub = type ? (type === "church" ? "church" : "my") : null
    setParams({ tab: "chats", chat: id, ...(sub ? { chats: sub } : {}) })
  }

  function handleChatClose() {
    setGlobalOpenChat(null)
    setChatRefreshKey((k) => k + 1)
    setParam("chat", null)
  }

  // Announcement detail open/close mirror ?ann (read view, persists on reload).
  function handleOpenAnnouncement(id: string) {
    setOpenAnnouncementId(id)
    setParam("ann", id)
  }

  function handleCloseAnnouncement() {
    setOpenAnnouncementId(null)
    setParam("ann", null)
  }

  function handleChatNameChange(name: string) {
    setGlobalOpenChat((prev) => prev ? { ...prev, name } : prev)
    setChatRefreshKey((k) => k + 1)
  }

  // Unified, symmetric nav handler — wired to BOTH the desktop sidebar and the
  // mobile bottom nav (and the command palette). Re-clicking the active tab RESETS
  // it to its landing view (clears that tab's owned params + shell-owned transients);
  // clicking a different tab SWITCHES while leaving other tabs' params intact
  // (resume-where-left-off). One atomic replace per logical navigation (Convention #5).
  function handleNavClick(tab: Tab) {
    // The announcement detail overlay is transient — it closes on every nav action.
    setOpenAnnouncementId(null)

    if (tab === activeTab) {
      // RESET: also clear the shell-owned, plain-state transients for this tab so
      // re-clicking truly lands on the tab's first view (URL params alone aren't
      // enough — these states lazy-init from the URL only on mount).
      setGlobalOpenChat(null)
      if (tab === "plan") {
        setActiveTeamId(null)
        setActiveReceiptsTeamId(null)
        setStudentOrgPlanningEvent(null)
      }
      if (tab === "directory") {
        setActiveMemberId(null)
        setSelectedDirectoryMember(null)
      }
      if (tab === "profile") setProfileSection("spiritual-profile")
      if (tab === "congregation") setCongregationView("list")
      setActiveTabState(tab)
      // Remount the active tab so tabs that hold their own internal view-state
      // (CongregationTab's view, chats list, journal subtab, …) re-init from the
      // cleared URL and land on their first view — no per-tab controlled props.
      setNavResetKey(k => k + 1)
      // clearTabParams drops this tab's owned params (?chat on chats, ?ann on
      // announcements, …); also clear ?ann unconditionally since the detail
      // overlay can sit over any tab.
      clearTabParams(tab, { tab, ann: null })
    } else {
      // SWITCH: leave other tabs' params untouched — only ?tab changes (+ clear the
      // transient ?ann overlay). ?chat is PRESERVED so the chats tab resumes its
      // open conversation; we re-derive the overlay only when entering chats and
      // null it otherwise (so the fullscreen overlay never leaks over another tab).
      setActiveTabState(tab)
      if (tab === "chats") {
        const chatId = new URLSearchParams(window.location.search).get("chat")
        setGlobalOpenChat(chatId ? { id: chatId, name: "" } : null)
      } else {
        setGlobalOpenChat(null)
      }
      setParams({ tab, ann: null })
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.assign("/login")
  }

  const showPlanTab = userTeams.length > 0 || isGovernanceAdmin
  // Church chat creation: admins/leaders + users with planning, member, or small-group permissions.
  const canCreateChurchChat = isAdmin ||
    userTeams.some(t => {
      const label = t.teamName.toLowerCase()
      return /\b(small group|discipleship|student org|board|leadership)\b/.test(label) ||
        t.permissions.some(p => ["can_create_dgs", "can_view_dgs", "can_manage_members", "can_plan_events"].includes(p))
    })

  return (
    <SWRConfig value={{ revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 5000 }}>
    <div className="relative min-h-screen bg-[var(--cream)] max-w-[390px] mx-auto md:max-w-none md:flex md:h-screen md:overflow-hidden md:min-h-0 md:bg-[var(--cream)]">

      {/* Desktop sidebar — hidden on mobile */}
      <DesktopSidebar
        activeTab={activeTab}
        onTabChange={handleNavClick}
        ministryName={ministryName}
        chatsUnread={totalChatsUnread}
        showPlan={showPlanTab}
        userInitials={getInitials(initialProfile.name)}
        userAvatarUrl={avatarUrl}
        recentChats={recentChats}
        userTeams={userTeams}
        onOpenChat={handleOpenChat}
        activeGroupId={globalOpenChat?.id}
        onLogout={handleLogout}
        isAdmin={isAdmin}
        isPastor={isPastor}
        canCreateTeam={canCreateTeam}
        onCreateTeam={() => { handleNavClick("plan"); setShowCreateTeam(true) }}
        activeTeamId={activeTeamId}
        activeTeamName={activeTeamNameForPlan || undefined}
        onActiveTeamChange={handleTeamChange}
        profileSection={profileSection}
        onProfileSectionChange={handleProfileSectionChange}
        isTreasurer={isTreasurer}
        isDGL={isDGL}
        userId={userId}
        directoryMinistryId={ministryId}
        directoryCurrentUserId={userId}
        directorySelectedMemberId={selectedDirectoryMember?.id ?? activeMemberId}
        directoryInitialMemberId={activeMemberId}
        onDirectoryMemberSelect={handleDirectoryMemberSelect}
        chatPanelContent={
          <ChatListPanel
            userId={userId}
            ministryId={ministryId}
            activeGroupId={globalOpenChat?.id}
            onOpenChat={handleOpenChat}
            refreshKey={chatRefreshKey}
            canCreateChurchChat={canCreateChurchChat}
            userProfile={initialProfile}
            userRole={initialProfile.role}
          />
        }
        planContextContent={planContextContent}
        hideSidePanel={activeTab === "plan" && !activeTeamId}
      />

      {/* Content + bottom nav wrapper */}
      <div className="md:flex-1 md:flex md:flex-col md:overflow-hidden md:min-h-0">

        {/* Shell topbar — suppressed on chats and on planning team picker (picker has its own full-width header) */}
        {activeTab !== "chats" && !(activeTab === "plan" && !activeTeamId) && (
          <DesktopTopbar
            crumbs={getShellCrumbs()}
            right={(activeTeamId === "receipts" || (activeTeamId && (userTeams.length > 1 || govTeamCount > 0))) ? (
              /* Team-agnostic back-to-picker button — shown for the receipts sentinel
                 AND any team workspace. Don't gate on a per-type flag or new team types
                 (finance, etc.) silently lose their way back. */
              <button
                onClick={() => { setActiveTeamId(null); setParams({ team: null, ...TEAM_SUBPARAMS }) }}
                className="hover:bg-[#F2EDE0] transition-colors"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--sans)", fontSize: 12, fontWeight: 500, color: "var(--body)", background: "var(--ivory)", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 13px", cursor: "pointer" }}
              >
                <ArrowLeft style={{ width: 13, height: 13 }} /> All workspaces
              </button>
            ) : undefined}
          />
        )}

        {/* Scrollable content area */}
        <div className="overflow-y-auto pb-28 min-h-screen md:flex-1 md:pb-0 md:min-h-0 md:overflow-hidden">

          {/* Shared on-load entrance — keyed by activeTab so this single element
              remounts and replays the fade+rise on every top-level tab switch
              (one mount point, not one per tab). md:h-full + md:overflow-hidden
              pass the shell's height/scroll context through to each tab's own
              wrapper, which resolves md:h-full against this element. The
              `navResetKey` segment ALSO remounts on an active-tab reset (re-click)
              so the active tab re-inits from the cleared URL — it never changes on
              a plain switch, so resume-where-left-off is preserved. */}
          <div key={`${activeTab}-${navResetKey}`} className="content-enter md:h-full md:overflow-hidden">

          {activeTab === "home" && (
            <div className="md:h-full md:overflow-y-auto">
              <HomeTab
                profile={initialProfile}
                userRole={initialProfile.role}
                ministryId={ministryId}
                ministryName={ministryName}
                recentChats={recentChats}
                onSeeChats={() => handleNavClick("chats")}
                onSeeAnnouncements={() => handleNavClick("announcements")}
                onOpenChat={handleOpenChat}
                onGoToProfile={() => handleNavClick("profile")}
                onOpenAnnouncement={handleOpenAnnouncement}
                avatarUrl={avatarUrl}
                activeQuestion={activeQuestion}
                hasResponded={hasResponded}
                onResponded={() => setHasResponded(true)}
              />
            </div>
          )}

          {activeTab === "announcements" && (
            <div className="md:h-full md:overflow-y-auto">
              <AnnouncementsTab userId={userId} userName={initialProfile.name} userRole={initialProfile.role} userGradYear={initialProfile.graduation_year} ministryId={ministryId} ministryName={ministryName} onOpenAnnouncement={handleOpenAnnouncement} />
            </div>
          )}

          {/* Chats tab — Convention #13: shell mount on root div */}
          {activeTab === "chats" && (
            <div className="pb-2 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">
              {/* Mobile only: full ChatsTab list view */}
              <div className="md:hidden">
                <ChatsTab
                  userId={userId}
                  userProfile={initialProfile}
                  userRole={initialProfile.role}
                  ministryId={ministryId}
                  ministryName={ministryName}
                  onOpenChat={handleOpenChat}
                  onTotalUnreadChange={setTotalChatsUnread}
                  refreshKey={chatRefreshKey}
                  onOpenDirectory={() => handleNavClick("directory")}
                  activeGroupId={globalOpenChat?.id}
                  canCreateChurchChat={canCreateChurchChat}
                />
              </div>
              {/* Desktop only: thread content area (list lives in DesktopSidebar panel) */}
              {/* Gate the ChatScreen MOUNT on isDesktop (not just the CSS `hidden md:flex`):
                  on a reload with ?chat=, globalOpenChat is set before isDesktop resolves,
                  so without this gate BOTH this (CSS-hidden) ChatScreen and the mobile
                  overlay below mount for the same group → duplicate realtime channel topic
                  ("cannot add postgres_changes callbacks after subscribe()"). */}
              <div className="hidden md:flex md:flex-col md:flex-1 md:overflow-hidden" style={{ background: "var(--cream)" }}>
                {isDesktop && globalOpenChat ? (
                  <ChatScreen
                    key={globalOpenChat.id}
                    groupId={globalOpenChat.id}
                    groupName={globalOpenChat.name}
                    userId={userId}
                    userName={initialProfile.name}
                    ministryId={ministryId}
                    userRole={initialProfile.role}
                    onClose={handleChatClose}
                    onRead={recountTotalUnread}
                    onNameChange={handleChatNameChange}
                    inline
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-[var(--cream)]">
                    <div className="text-center">
                      <MessageCircle className="w-10 h-10 text-[var(--line)] mx-auto mb-3" />
                      <p className="text-[14px] font-semibold text-[var(--muted-text)]">Select a chat</p>
                      <p className="text-[12px] text-[var(--faint)] mt-1">Choose a conversation from the panel</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "plan" && showPlanTab && (
            <div className="md:flex md:flex-col md:h-full md:overflow-hidden">
              <PlanTab
                userId={userId}
                userName={initialProfile.name}
                ministryId={ministryId}
                ministryName={ministryName}
                userTeams={userTeams}
                allTeams={allTeams}
                isAdmin={isAdmin}
                isGovernanceAdmin={isGovernanceAdmin}
                governanceSettings={governanceSettings}
                isDGL={isDGL}
                isPastor={isPastor}
                onTeamsChange={() => { loadUserTeams(); loadAllTeams() }}
                showCreateTeam={showCreateTeam}
                onShowCreateTeam={setShowCreateTeam}
                activeTeamId={activeTeamId}
                onOpenChat={handleOpenChat}
                onTeamSelect={handleTeamChange}
                studentOrgSection={studentOrgSection}
                onStudentOrgSectionChange={handleStudentOrgSectionChange}
                studentOrgPlanningEvent={studentOrgPlanningEvent}
                onStudentOrgPlanningEventChange={(ev) => {
                  if (ev) {
                    handleStudentOrgSectionChange("Events")
                  } else {
                    replaceParam("evtab", null)
                  }
                  setStudentOrgPlanningEvent(ev)
                }}
                onStudentOrgCalEventsChange={setStudentOrgCalEvents}
                sglSection={sglSection}
                onSglSectionChange={handleSglSectionChange}
                financeSection={financeTeamSection}
                onFinanceSectionChange={handleFinanceSectionChange}
                activeReceiptsTeamId={activeReceiptsTeamId}
                onReceiptsTeamChange={handleReceiptsTeamChange}
              />
            </div>
          )}

          {activeTab === "directory" && (
            <div className="md:flex md:flex-col md:h-full md:overflow-hidden">
              <DirectoryTab
                currentUserId={userId}
                currentUserName={initialProfile.name}
                ministryId={ministryId}
                ministryName={ministryName}
                initialMemberId={activeMemberId ?? undefined}
                selectedMember={selectedDirectoryMember}
                onMemberSelect={handleMemberSelect}
                onBack={() => handleNavClick("chats")}
                onOpenChat={handleOpenChat}
              />
            </div>
          )}

          {/* Member-facing Give surface — reachable by everyone */}
          {activeTab === "give" && (
            <div className="md:h-full md:overflow-y-auto">
              <GiveView
                ministryId={ministryId}
                userId={userId}
                userRole={initialProfile.role}
              />
            </div>
          )}

          {activeTab === "profile" && (
            <div className="md:h-full md:overflow-y-auto">
              <ProfileTab
                userId={userId}
                initialProfile={{ ...initialProfile, avatar_url: avatarUrl }}
                ministryName={ministryName}
                isAdmin={isAdmin}
                ministryIsPublic={ministryIsPublic}
                onLogout={handleLogout}
                onAvatarChange={(url) => setAvatarUrl(url)}
                activeSection={profileSection}
                onSectionChange={handleProfileSectionChange}
              />
            </div>
          )}

          {activeTab === "settings" && isAdmin && (
            <SettingsTab
              ministryId={ministryId}
              ministryName={ministryName}
              ministryIsPublic={ministryIsPublic}
              onPublicChange={setMinistryIsPublic}
              userRole={initialProfile.role}
              userId={userId}
              userName={initialProfile.name}
            />
          )}

          {activeTab === "forms" && (
            <FormsTab
              userId={userId}
              userName={initialProfile.name}
              userRole={initialProfile.role}
              ministryId={ministryId}
              ministryName={ministryName}
            />
          )}

          {activeTab === "congregation" && isPastor && (
            <div className="md:h-full md:overflow-y-auto">
              <CongregationTab
                userId={userId}
                ministryId={ministryId}
                userRole={initialProfile.role}
                onViewChange={setCongregationView}
              />
            </div>
          )}

          </div>

        </div>

        <BottomNav
          activeTab={activeTab}
          onTabChange={handleNavClick}
          chatsUnread={totalChatsUnread}
          showPlan={showPlanTab}
        />

      </div>

      {/* Global ChatScreen overlay — mobile always, desktop only when not on chats tab */}
      {globalOpenChat && !(isDesktop && activeTab === "chats") && (
        <ChatScreen
          groupId={globalOpenChat.id}
          groupName={globalOpenChat.name}
          userId={userId}
          userName={initialProfile.name}
          ministryId={ministryId}
          userRole={initialProfile.role}
          onClose={handleChatClose}
          onRead={recountTotalUnread}
          onNameChange={handleChatNameChange}
        />
      )}

      {openAnnouncementId && (
        <AnnouncementDetailView
          announcementId={openAnnouncementId}
          userId={userId}
          ministryId={ministryId}
          userRole={initialProfile.role}
          userName={initialProfile.name}
          onClose={handleCloseAnnouncement}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        ministryId={ministryId}
        onTabChange={(tab) => { setPaletteOpen(false); handleNavClick(tab) }}
        onOpenChat={(id, name, type) => { setPaletteOpen(false); handleOpenChat(id, name, type) }}
      />


      {showGradPrompt && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(19,16,26,0.55)", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "#FBF8F2", borderRadius: 20, padding: "36px 32px", maxWidth: 400, width: "100%", boxShadow: "0 24px 80px rgba(19,16,26,0.18)" }}>
            <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, letterSpacing: "0.13em", color: "var(--muted-text)", textTransform: "uppercase", marginBottom: 10 }}>Class of {initialProfile.graduation_year}</div>
            <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 32, lineHeight: 1.08, letterSpacing: "-0.02em", color: "var(--ink)", margin: "0 0 10px" }}>Congratulations, graduate.</h2>
            <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.6, margin: "0 0 28px" }}>
              You&apos;ve reached your graduation year. Would you like to stay in {ministryName} or remove yourself from the ministry?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => {
                  const key = `grad_prompt_dismissed_${initialProfile.graduation_year}`
                  sessionStorage.setItem(key, "1")
                  setShowGradPrompt(false)
                }}
                style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "var(--plum-2)", color: "#FBF8F2", fontSize: 15, fontWeight: 500, fontFamily: "var(--font-inter)", cursor: "pointer" }}
              >
                Stay in {ministryName}
              </button>
              <button
                disabled={gradPromptLoading}
                onClick={async () => {
                  setGradPromptLoading(true)
                  await selfLeaveMinistry()
                  window.location.replace("/join")
                }}
                style={{ width: "100%", padding: "14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "transparent", color: "#9F3030", fontSize: 15, fontWeight: 500, fontFamily: "var(--font-inter)", cursor: gradPromptLoading ? "not-allowed" : "pointer", opacity: gradPromptLoading ? 0.6 : 1 }}
              >
                {gradPromptLoading ? "Leaving…" : "Leave ministry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </SWRConfig>
  )
}
