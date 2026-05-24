"use client"

import { useState, useEffect, useCallback } from "react"
import { MessageCircle } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { BottomNav } from "@/components/ui/bottom-nav"
import type { ChatPreview } from "@/components/ui/chats-section"

// Types
import type { Tab, Profile, UserTeam, Team, HomeAppProps } from "./types"
import { formatRelativeTime, getInitials, getAvatarColor } from "./utils"

// Components
import { CommandPalette } from "./components/command-palette"
import { DesktopSidebar } from "./components/desktop-nav"

// Tabs
import { HomeTab } from "./tabs/home-tab"
import { AnnouncementsTab } from "./tabs/announcements-tab"
import { ChatsTab, ChatScreen } from "./tabs/chats-tab"
import { PlanTab, QuickCreateTeamModal } from "./tabs/plan-tab"
import { DirectoryTab } from "./tabs/directory-tab"
import { GivingTab } from "./tabs/giving-tab"
import { ProfileTab } from "./tabs/profile-tab"
import { SettingsTab } from "./tabs/settings-tab"
import { FormsTab } from "./tabs/forms-tab"

export function HomeApp({ userId, initialProfile, ministryId, ministryName }: HomeAppProps) {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const validTabs: Tab[] = ["home", "announcements", "chats", "plan", "directory", "giving", "profile", "settings", "forms"]
  const initialTab = (searchParams.get("tab") as Tab | null)
  const [activeTab, setActiveTabState] = useState<Tab>(
    initialTab && validTabs.includes(initialTab) ? initialTab : "home"
  )

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
  const [totalChatsUnread, setTotalChatsUnread] = useState(0)
  const [chatRefreshKey, setChatRefreshKey] = useState(0)
  const [recentChats, setRecentChats] = useState<ChatPreview[]>([])
  const [userTeams, setUserTeams] = useState<UserTeam[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatar_url ?? null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [showQuickCreateTeam, setShowQuickCreateTeam] = useState(false)
  const [activeTeamId, setActiveTeamId] = useState<string | null>(searchParams.get("team"))
  const [activeMemberId, setActiveMemberId] = useState<string | null>(searchParams.get("member"))
  const validSections = ["spiritual-profile", "journal"] as const
  const initialSection = searchParams.get("section") as "spiritual-profile" | "journal" | null
  const [profileSection, setProfileSection] = useState<"spiritual-profile" | "journal">(
    initialSection && (validSections as readonly string[]).includes(initialSection) ? initialSection : "spiritual-profile"
  )

  function handleTeamChange(teamId: string) {
    setActiveTeamId(teamId)
    replaceParam("team", teamId)
  }

  function handleProfileSectionChange(section: "spiritual-profile" | "journal") {
    setProfileSection(section)
    replaceParam("section", section === "spiritual-profile" ? null : section)
  }

  function handleMemberSelect(memberId: string | null) {
    setActiveMemberId(memberId)
    replaceParam("member", memberId)
  }
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [ministryIsPublic, setMinistryIsPublic] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setPaletteOpen(true) }
    }
    function handleOpenEvent() { setPaletteOpen(true) }
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("open-command-palette", handleOpenEvent)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
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

  const isAdmin = ["admin", "leader"].includes(initialProfile.role.toLowerCase())

  // Fetch all user groups with their latest message + real unread counts, sorted by recency
  const loadRecentChats = useCallback(async () => {
    const { data: groups } = await supabase
      .from("group_members")
      .select("groups(id, name, type, ministry_id), last_read_at")
      .eq("user_id", userId)

    if (!groups) return

    type RawGroup = { groups: { id: string; name: string; type: string; ministry_id: string | null } | { id: string; name: string; type: string; ministry_id: string | null }[] | null; last_read_at: string | null }
    const groupList = (groups as RawGroup[])
      .map((m) => {
        if (!m.groups) return null
        const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
        if (!g || g.ministry_id !== ministryId) return null
        return { ...g, lastReadAt: m.last_read_at }
      })
      .filter(Boolean) as { id: string; name: string; type: string; lastReadAt: string | null }[]

    if (groupList.length === 0) {
      setRecentChats([])
      return
    }

    const groupIds = groupList.map((g) => g.id)
    const lastReadMap: Record<string, string | null> = {}
    for (const g of groupList) lastReadMap[g.id] = g.lastReadAt

    const { data: msgs } = await supabase
      .from("messages")
      .select("group_id, content, created_at, sender_id, message_type, profiles!sender_id(name)")
      .in("group_id", groupIds)
      .order("created_at", { ascending: false })

    type RawMsg = { group_id: string; content: string; created_at: string; sender_id: string | null; message_type: string; profiles: { name: string } | { name: string }[] | null }
    const lastMsgMap: Record<string, { content: string; senderName: string; time: string; ts: string }> = {}
    const unreadCountMap: Record<string, number> = {}
    for (const msg of ((msgs ?? []) as RawMsg[])) {
      if (!lastMsgMap[msg.group_id]) {
        const p = Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles
        lastMsgMap[msg.group_id] = {
          content: msg.content,
          senderName: p?.name ?? "",
          time: formatRelativeTime(msg.created_at),
          ts: msg.created_at,
        }
      }
      // System messages don't count as unread
      if (msg.message_type === "system") continue
      const lra = lastReadMap[msg.group_id]
      if (msg.sender_id !== userId && (!lra || msg.created_at > lra)) {
        unreadCountMap[msg.group_id] = (unreadCountMap[msg.group_id] ?? 0) + 1
      }
    }

    const previews: ChatPreview[] = groupList.map((g) => {
      const last = lastMsgMap[g.id]
      return {
        id: g.id,
        groupName: g.name,
        lastMessage: last?.content ?? "",
        lastMessageSender: last?.senderName ?? "",
        unreadCount: unreadCountMap[g.id] ?? 0,
        avatarColor: getAvatarColor(g.name),
        initials: getInitials(g.name),
        time: last?.time ?? "",
        _ts: last?.ts ?? "",
      } as ChatPreview & { _ts: string }
    })

    // Sort by most recent message descending
    previews.sort((a, b) => {
      const ta = (a as ChatPreview & { _ts: string })._ts
      const tb = (b as ChatPreview & { _ts: string })._ts
      if (!ta && !tb) return 0
      if (!ta) return 1
      if (!tb) return -1
      return tb.localeCompare(ta)
    })

    setRecentChats(previews)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const loadUserTeams = useCallback(async () => {
    type RawMembership = {
      team_id: string
      role_id: string
      teams: { id: string; name: string; icon: string | null; description: string | null } | { id: string; name: string; icon: string | null; description: string | null }[] | null
      team_roles: { id: string; name: string; permissions: string[] } | { id: string; name: string; permissions: string[] }[] | null
    }
    const { data } = await supabase
      .from("team_members")
      .select("team_id, role_id, teams(id, name, icon, description), team_roles(id, name, permissions)")
      .eq("user_id", userId)
    if (!data) return
    const teams: UserTeam[] = (data as RawMembership[]).flatMap((m) => {
      const t = Array.isArray(m.teams) ? m.teams[0] : m.teams
      const r = Array.isArray(m.team_roles) ? m.team_roles[0] : m.team_roles
      if (!t || !r) return []
      return [{ teamId: t.id, teamName: t.name, teamIcon: t.icon, teamDescription: t.description, roleId: r.id, roleName: r.name, permissions: Array.isArray(r.permissions) ? r.permissions : [] }]
    })
    setUserTeams(teams)
    setActiveTeamId((prev) => {
      // Keep URL-initialized or user-selected team if still valid; otherwise fall back to first
      if (prev && teams.some((t) => t.teamId === prev)) return prev
      return teams[0]?.teamId ?? null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const loadAllTeams = useCallback(async () => {
    if (!isAdmin) return
    const { data } = await supabase
      .from("teams")
      .select("id, name, icon, description, created_by")
      .eq("ministry_id", ministryId)
      .order("created_at")
    if (!data) return
    const teamIds = (data as { id: string }[]).map((t) => t.id)
    const countMap: Record<string, number> = {}
    if (teamIds.length > 0) {
      const { data: counts } = await supabase.from("team_members").select("team_id").in("team_id", teamIds)
      for (const m of counts ?? []) countMap[m.team_id] = (countMap[m.team_id] ?? 0) + 1
    }
    setAllTeams((data as { id: string; name: string; icon: string | null; description: string | null; created_by: string }[]).map((t) => ({ ...t, member_count: countMap[t.id] ?? 0 })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, ministryId])

  // Initial load + reload after closing a chat
  useEffect(() => {
    loadRecentChats()
  }, [loadRecentChats, chatRefreshKey])

  useEffect(() => {
    loadUserTeams()
    loadAllTeams()
  }, [loadUserTeams, loadAllTeams])

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

  const recountTotalUnread = useCallback(async () => {
    const { data } = await supabase
      .from("group_members")
      .select("group_id, last_read_at, groups(ministry_id)")
      .eq("user_id", userId)

    if (!data || data.length === 0) { setTotalChatsUnread(0); return }

    type GmRow = { group_id: string; last_read_at: string | null; groups: { ministry_id: string } | { ministry_id: string }[] | null }
    const filtered = (data as GmRow[]).filter(m => {
      const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
      return g?.ministry_id === ministryId
    })

    let total = 0
    await Promise.all(
      filtered.map(async ({ group_id, last_read_at }) => {
        let q = supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("group_id", group_id)
          .neq("sender_id", userId)
        if (last_read_at) q = q.gt("created_at", last_read_at)
        const { count } = await q
        total += count ?? 0
      })
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

  const showPlanTab = isAdmin || userTeams.length > 0
  // Church chat creation: admins/leaders + users with planning, member, or small-group permissions.
  const canCreateChurchChat = isAdmin ||
    userTeams.some(t => {
      const label = t.teamName.toLowerCase()
      return /\b(small group|discipleship|student org|board|leadership)\b/.test(label) ||
        t.permissions.some(p => ["can_create_dgs", "can_view_dgs", "can_manage_members", "can_plan_events"].includes(p))
    })

  return (
    <div className="relative min-h-screen bg-[#FBF8F2] max-w-[390px] mx-auto md:max-w-none md:flex md:h-screen md:overflow-hidden md:min-h-0 md:bg-[#F4F1E8]">

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
        onCreateTeam={() => setShowQuickCreateTeam(true)}
        activeTeamId={activeTeamId}
        onActiveTeamChange={handleTeamChange}
        profileSection={profileSection}
        onProfileSectionChange={handleProfileSectionChange}
      />

      {/* Content + bottom nav wrapper */}
      <div className="md:flex-1 md:flex md:flex-col md:overflow-hidden md:min-h-0">

        {/* Scrollable content area */}
        <div className="overflow-y-auto pb-28 min-h-screen md:flex-1 md:pb-0 md:min-h-0 md:overflow-hidden">

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
                avatarUrl={avatarUrl}
              />
            </div>
          )}

          {activeTab === "announcements" && (
            <div className="md:h-full md:overflow-y-auto">
              <AnnouncementsTab userId={userId} userName={initialProfile.name} userRole={initialProfile.role} userGradYear={initialProfile.graduation_year} ministryId={ministryId} ministryName={ministryName} />
            </div>
          )}

          {/* Chats tab: mobile = normal stack, desktop = two-column split */}
          {activeTab === "chats" && (
            <div className="md:flex md:h-full md:overflow-hidden">
              {/* Left: chat list */}
              <div className="md:w-[232px] md:flex-shrink-0 md:border-r md:border-[#E5E0D2] md:overflow-y-auto md:h-full md:bg-[#FBF8F2]">
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
              {/* Right: chat content — desktop only */}
              {globalOpenChat ? (
                <div className="hidden md:flex md:flex-1 md:overflow-hidden">
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
                </div>
              ) : (
                <div className="hidden md:flex md:flex-1 md:items-center md:justify-center bg-[#FBF8F2]">
                  <div className="text-center">
                    <MessageCircle className="w-10 h-10 text-[#C4C4C4] mx-auto mb-3" />
                    <p className="text-[14px] font-semibold text-[#8A8497]">Select a chat</p>
                    <p className="text-[12px] text-[#C4C4C4] mt-1">Choose a conversation on the left</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "plan" && (
            <div className="md:h-full md:overflow-y-auto">
              <PlanTab
                userId={userId}
                userName={initialProfile.name}
                ministryId={ministryId}
                ministryName={ministryName}
                userTeams={userTeams}
                allTeams={allTeams}
                isAdmin={isAdmin}
                onTeamsChange={() => { loadUserTeams(); loadAllTeams() }}
                showCreateTeam={showCreateTeam}
                onShowCreateTeam={setShowCreateTeam}
                activeTeamId={activeTeamId}
                onTeamCreated={(teamId) => { loadUserTeams(); loadAllTeams(); handleTeamChange(teamId) }}
              />
            </div>
          )}

          {activeTab === "directory" && (
            <div className="md:h-full md:overflow-y-auto">
              <DirectoryTab
                currentUserId={userId}
                currentUserName={initialProfile.name}
                ministryId={ministryId}
                ministryName={ministryName}
                initialMemberId={activeMemberId ?? undefined}
                onMemberSelect={handleMemberSelect}
                onBack={() => setActiveTab("chats")}
                onOpenChat={(id, name) => {
                  setActiveTab("chats")
                  handleOpenChat(id, name)
                }}
              />
            </div>
          )}

          {activeTab === "giving" && (
            <div className="md:h-full md:overflow-y-auto">
              <GivingTab
                ministryId={ministryId}
                userId={userId}
                userRole={initialProfile.role}
                isAdmin={isAdmin}
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
    </div>
  )
}
