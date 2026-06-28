"use client"

import { useState, useEffect, useCallback } from "react"
import { MessageCircle } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { BottomNav } from "@/components/ui/bottom-nav"
import type { ChatPreview } from "@/components/ui/chats-section"

// Types
import type { Tab, Profile, UserTeam, Team, HomeAppProps, CongregationQuestion, GovernanceSettings } from "./types"
import { formatRelativeTime, getInitials } from "./utils"
import { isGovernanceAdmin as computeIsGovernanceAdmin, teamAccessLevel } from "./governance"

// Components
import { CommandPalette } from "./components/command-palette"
import { DesktopSidebar, DesktopTopbar, ReceiptsSidebarNav } from "./components/desktop-nav"

// Tabs
import { HomeTab } from "./tabs/home-tab"
import { AnnouncementsTab, AnnouncementDetailView } from "./tabs/announcements-tab"
import { ChatsTab, ChatScreen, ChatListPanel } from "./tabs/chats-tab"
import { PlanTab, QuickCreateTeamModal, StudentOrgSectionNav, SmallGroupSectionNav, FinanceSectionNav } from "./tabs/plan-tab"
import type { CalendarEvent } from "./types"
import { DirectoryTab } from "./tabs/directory-tab"
import type { DirectoryMember } from "./types"
import { GiveView } from "./components/give-view"
import { ProfileTab } from "./tabs/profile-tab"
import { SettingsTab } from "./tabs/settings-tab"
import { FormsTab } from "./tabs/forms-tab"
import { CongregationTab } from "./tabs/congregation-tab"
import { selfLeaveMinistry } from "@/app/actions/ministry"

export function HomeApp({ userId, initialProfile, ministryId, ministryName, initialRecentChats, initialUserTeams, initialActiveQuestion, initialHasResponded, initialGovernanceSettings }: HomeAppProps) {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const validTabs: Tab[] = ["home", "announcements", "chats", "plan", "directory", "give", "profile", "settings", "forms", "congregation"]
  const TAB_ALIASES: Record<string, Tab> = { you: "profile" }
  const rawTab = searchParams.get("tab")
  const resolvedTab = rawTab ? (TAB_ALIASES[rawTab] ?? rawTab) as Tab : null
  const initialTab = resolvedTab && validTabs.includes(resolvedTab) ? resolvedTab : "home"
  const [activeTab, setActiveTabState] = useState<Tab>(initialTab)

  // Persist a single URL param without clobbering others
  function replaceParam(key: string, value: string | null) {
    const params = new URLSearchParams(window.location.search)
    if (value === null) params.delete(key)
    else params.set(key, value)
    router.replace(`/home?${params.toString()}`, { scroll: false })
  }

  function setActiveTab(tab: Tab) {
    setActiveTabState(tab)
    replaceParam("tab", tab)
  }
  const [globalOpenChat, setGlobalOpenChat] = useState<{ id: string; name: string } | null>(null)
  const [openAnnouncementId, setOpenAnnouncementId] = useState<string | null>(null)
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
  const [showQuickCreateTeam, setShowQuickCreateTeam] = useState(false)
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

  function handleTeamChange(teamId: string) {
    setActiveTeamId(teamId)
    replaceParam("team", teamId)
  }

  // Team selected WITHIN the Receipts workspace (sentinel activeTeamId === "receipts").
  const [activeReceiptsTeamId, setActiveReceiptsTeamId] = useState<string | null>(
    () => searchParams.get("rteam")
  )

  function handleReceiptsTeamChange(teamId: string) {
    setActiveReceiptsTeamId(teamId)
    // One atomic replace (convention #5) — build the full param set, replace once.
    const params = new URLSearchParams(window.location.search)
    params.set("rteam", teamId)
    router.replace(`/home?${params.toString()}`, { scroll: false })
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
  const isPraiseTeamMember = userTeams.some(t => t.teamType === 'standard' && (/\b(praise|worship)\b/.test(t.teamName.toLowerCase()) || t.permissions.some(p => ["can_manage_worship_set","can_view_worship_set","can_manage_schedule"].includes(p))))
  const canCreateTeam = isAdmin || isDGL || isPraiseTeamMember

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
  const [congregationView, setCongregationView] = useState<"ask" | "responses" | "archive">("ask")

  // Compute whether the student org board is the active team on desktop (drives sidebar + breadcrumb).
  // Resolve from membership first, then from allTeams — a governance admin may be viewing a team
  // they don't belong to (gov-view). Without the allTeams fallback the shell would mirror the user's
  // member-team list instead of the team actually being viewed.
  const activeUserTeamForPlan = userTeams.find(t => t.teamId === activeTeamId)
  const activeAllTeamForPlan = allTeams.find(t => t.id === activeTeamId)
  const activeTeamNameForPlan = activeUserTeamForPlan?.teamName ?? activeAllTeamForPlan?.name ?? ""
  const activeTeamLabelForPlan = activeTeamNameForPlan.toLowerCase()
  const activeTeamPermsForPlan = activeUserTeamForPlan?.permissions ?? []
  // Finance is an exact team_type — checked first so a finance team (which carries
  // can_view_finances) can never be misdetected as the Student Org Board. Resolve from
  // allTeams since UserTeam may not carry team_type for gov-entered teams.
  const isFinanceActive = activeTab === "plan" && isDesktop && activeAllTeamForPlan?.team_type === "finance"
  const isStudentOrgActive = activeTab === "plan" && isDesktop && !isFinanceActive && (
    /\b(student org|board|leadership|officer)\b/.test(activeTeamLabelForPlan) ||
    activeTeamPermsForPlan.some(p => ["can_plan_events", "can_manage_members"].includes(p))
  )
  const isDGLActive = activeTab === "plan" && isDesktop && !isFinanceActive && !isStudentOrgActive && (
    /\b(dgl|small group|discipleship|sg)\b/.test(activeTeamLabelForPlan) ||
    activeTeamPermsForPlan.some(p => ["can_create_dgs", "can_view_dgs"].includes(p))
  )

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
    const congregationLabels: Record<string, string> = { ask: "Ask", responses: "Responses", archive: "Archive" }
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
      case "congregation":  return ["Central", "Congregation", congregationLabels[congregationView]]
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
    if (teamIds.length > 0) {
      const { data: counts } = await supabase.from("team_members").select("team_id").in("team_id", teamIds)
      for (const m of counts ?? []) countMap[m.team_id] = (countMap[m.team_id] ?? 0) + 1
    }
    type RawTeam = { id: string; name: string; icon: string | null; description: string | null; created_by: string; team_type: string; allow_co_presidency: boolean | null; admin_access: string | null; allow_admin_members: boolean | null }
    setAllTeams((data as RawTeam[]).map((t) => {
      const rawType = t.team_type ?? 'standard'
      const team_type: 'standard' | 'dg_praise' | 'one_time' | 'finance' = ['standard','dg_praise','one_time','finance'].includes(rawType) ? rawType as 'standard' | 'dg_praise' | 'one_time' | 'finance' : 'standard'
      const rawAccess = t.admin_access ?? 'view'
      const admin_access: 'none' | 'view' | 'write' = ['none','view','write'].includes(rawAccess) ? rawAccess as 'none' | 'view' | 'write' : 'view'
      return { ...t, team_type, allow_co_presidency: !!t.allow_co_presidency, admin_access, allow_admin_members: !!t.allow_admin_members, member_count: countMap[t.id] ?? 0 }
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

  // Initial load + reload after closing a chat
  useEffect(() => {
    loadRecentChats()
  }, [loadRecentChats, chatRefreshKey])

  useEffect(() => {
    loadUserTeams()
    loadAllTeams()
  }, [loadUserTeams, loadAllTeams])

  useEffect(() => {
    loadActiveQuestion()
  }, [loadActiveQuestion])

  useEffect(() => {
    if (!isAdmin) return
    supabase.from("ministries").select("is_public").eq("id", ministryId).maybeSingle()
      .then(({ data }) => { if (data) setMinistryIsPublic(data.is_public ?? false) })
  }, [isAdmin, ministryId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: keep recentChats preview fresh as messages arrive
  useEffect(() => {
    const channel = supabase
      .channel("home-app-recent-chats")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as { group_id: string; content: string; created_at: string; sender_id: string }
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

  // On desktop, auto-select the most recent chat when arriving at the chats tab
  useEffect(() => {
    if (isDesktop && activeTab === "chats" && !globalOpenChat && recentChats.length > 0) {
      const top = recentChats[0]
      setGlobalOpenChat({ id: top.id, name: top.groupName })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, activeTab, recentChats])

  function handleOpenChat(id: string, name: string) {
    setGlobalOpenChat({ id, name })
  }

  function handleChatClose() {
    setGlobalOpenChat(null)
    setChatRefreshKey((k) => k + 1)
  }

  function handleChatNameChange(name: string) {
    setGlobalOpenChat((prev) => prev ? { ...prev, name } : prev)
    setChatRefreshKey((k) => k + 1)
  }

  function handleSidebarTabChange(tab: Tab) {
    setGlobalOpenChat(null)
    setActiveTabState(tab)
    // Atomic URL update: set new tab and clear sub-page overlay params so they
    // don't auto-reopen when the user returns to the plan tab later.
    const params = new URLSearchParams(window.location.search)
    params.set("tab", tab)
    params.delete("view")
    router.replace(`/home?${params.toString()}`, { scroll: false })
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
    <div className="relative min-h-screen bg-[var(--cream)] max-w-[390px] mx-auto md:max-w-none md:flex md:h-screen md:overflow-hidden md:min-h-0 md:bg-[var(--cream)]">

      {/* Desktop sidebar — hidden on mobile */}
      <DesktopSidebar
        activeTab={activeTab}
        onTabChange={handleSidebarTabChange}
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
        onCreateTeam={() => setShowQuickCreateTeam(true)}
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
            right={activeTeamId === "receipts" ? (
              <button
                onClick={() => { setActiveTeamId(null); replaceParam("team", null) }}
                style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                ← Planning
              </button>
            ) : activeTeamId && (userTeams.length > 1 || govTeamCount > 0) ? (
              /* Team-agnostic: ANY team workspace (the receipts sentinel is handled
                 above) gets the back-to-picker button — don't gate on a per-type flag
                 or new team types (finance, etc.) silently lose their way back. */
              <button
                onClick={() => { setActiveTeamId(null); replaceParam("team", null) }}
                style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                ← All teams
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
              wrapper, which resolves md:h-full against this element. */}
          <div key={activeTab} className="content-enter md:h-full md:overflow-hidden">

          {activeTab === "home" && (
            <div className="md:h-full md:overflow-y-auto">
              <HomeTab
                profile={initialProfile}
                userRole={initialProfile.role}
                ministryId={ministryId}
                ministryName={ministryName}
                recentChats={recentChats}
                onSeeChats={() => setActiveTab("chats")}
                onSeeAnnouncements={() => setActiveTab("announcements")}
                onOpenChat={handleOpenChat}
                onGoToProfile={() => setActiveTab("profile")}
                onOpenAnnouncement={(id) => setOpenAnnouncementId(id)}
                avatarUrl={avatarUrl}
                activeQuestion={activeQuestion}
                hasResponded={hasResponded}
                onResponded={() => setHasResponded(true)}
              />
            </div>
          )}

          {activeTab === "announcements" && (
            <div className="md:h-full md:overflow-y-auto">
              <AnnouncementsTab userId={userId} userName={initialProfile.name} userRole={initialProfile.role} userGradYear={initialProfile.graduation_year} ministryId={ministryId} ministryName={ministryName} onOpenAnnouncement={(id) => setOpenAnnouncementId(id)} />
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
                  onOpenDirectory={() => setActiveTab("directory")}
                  activeGroupId={globalOpenChat?.id}
                  canCreateChurchChat={canCreateChurchChat}
                />
              </div>
              {/* Desktop only: thread content area (list lives in DesktopSidebar panel) */}
              <div className="hidden md:flex md:flex-col md:flex-1 md:overflow-hidden" style={{ background: "var(--cream)" }}>
                {globalOpenChat ? (
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
                onTeamCreated={(teamId) => { loadUserTeams(); loadAllTeams(); handleTeamChange(teamId) }}
                onOpenChat={(id, name) => { setActiveTab("chats"); handleOpenChat(id, name) }}
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
                onBack={() => setActiveTab("chats")}
                onOpenChat={(id, name) => {
                  setActiveTab("chats")
                  handleOpenChat(id, name)
                }}
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
          onTabChange={setActiveTab}
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
          onClose={() => setOpenAnnouncementId(null)}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        ministryId={ministryId}
        onTabChange={(tab) => { setPaletteOpen(false); handleSidebarTabChange(tab) }}
        onOpenChat={(id, name) => { setPaletteOpen(false); handleOpenChat(id, name) }}
      />

      {showQuickCreateTeam && (
        <QuickCreateTeamModal
          userId={userId}
          ministryId={ministryId}
          isAdmin={isAdmin}
          isDGL={isDGL}
          isPraiseTeamMember={isPraiseTeamMember}
          onClose={() => setShowQuickCreateTeam(false)}
          onCreated={(teamId) => {
            setShowQuickCreateTeam(false)
            loadUserTeams()
            loadAllTeams()
            setActiveTab("plan")
            handleTeamChange(teamId)
          }}
        />
      )}

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
  )
}
