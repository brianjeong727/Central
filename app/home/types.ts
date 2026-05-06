import type { ChatPreview } from "@/components/ui/chats-section"

export type Tab = "home" | "announcements" | "chats" | "plan" | "directory" | "profile"

export interface Profile {
  id: string
  name: string
  email: string
  graduation_year: number | null
  role: string
  about_me: string | null
  bible_verse: string | null
  prayer_request: string | null
  pray_for_me: string | null
  ministry_id?: string | null
  avatar_url?: string | null
}

export interface Devotional {
  id: string
  user_id: string
  ministry_id: string
  title: string
  passage: string
  content: string
  image_url: string | null
  created_at: string
}

export type PrayerStatus = 'praying' | 'answered' | 'ongoing'

export interface Prayer {
  id: string
  user_id: string
  ministry_id: string
  title: string
  content: string
  status: PrayerStatus
  created_at: string
}

export interface Verse {
  id: string
  user_id: string
  ministry_id: string
  reference: string
  verse_text: string
  note: string
  created_at: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  created_at: string
  is_pinned: boolean
  is_event: boolean
  image_url: string | null
  audience: string | null
  created_by: string | null
}

export interface EnrichedAnnouncement extends Announcement {
  view_count: number
  rsvp_count: number
  user_has_rsvped: boolean
}

export interface ChatGroup {
  id: string
  name: string
  type: string
  last_message: string | null
  last_sender: string | null
  last_message_time: string | null
  unread_count: number
  archived?: boolean
}

export interface GroupMember {
  user_id: string
  name: string
  role: string
  graduation_year: number | null
  avatar_url?: string | null
}

export interface Message {
  id: string
  group_id: string
  sender_id: string
  content: string
  created_at: string
  sender_name: string
  sender_avatar_url?: string | null
  reply_to_id: string | null
  reply_to_content: string | null
  reply_to_sender: string | null
  deleted?: boolean
}

export interface Reaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
}

export interface HomeTabProps {
  profile: Profile
  ministryId: string
  ministryName: string
  recentChats: ChatPreview[]
  onSeeChats: () => void
  onSeeAnnouncements: () => void
  onOpenChat: (id: string, name: string) => void
  onGoToProfile: () => void
  avatarUrl?: string | null
}

export interface CreateAnnouncementModalProps {
  userId: string
  ministryId: string
  existing?: Announcement
  onClose: () => void
  onSuccess: (ann: Announcement) => void
}

export interface AnnouncementsTabProps {
  userId: string
  userRole: string
  userGradYear: number | null
  ministryId: string
  ministryName: string
}

export interface AnnouncementDetailProps {
  announcement: EnrichedAnnouncement
  userId: string
  onClose: () => void
  onRsvpToggle: (id: string) => void
}

export interface AnnouncementCardProps {
  announcement: EnrichedAnnouncement
  isPinned: boolean
  userId: string
  userRole: string
  onRsvpToggle: (id: string) => void
  onEdit: (ann: EnrichedAnnouncement) => void
  onDelete: (id: string) => void
}

export interface CreateChatScreenProps {
  userId: string
  userName: string
  ministryId: string
  groupType: "my" | "church"
  onClose: () => void
  onCreated: (group: { id: string; name: string }) => void
}

export interface ChatSettingsProps {
  groupId: string
  groupName: string
  groupType: string
  userId: string
  userRole: string
  onBack: () => void
  onNameChange: (name: string) => void
  onClose: () => void
}

export interface ChatScreenProps {
  groupId: string
  groupName: string
  userId: string
  userName: string
  userRole: string
  onClose: () => void
  onRead?: () => void
  inline?: boolean
}

export interface ChatsTabProps {
  userId: string
  userProfile: Profile
  userRole: string
  ministryId: string
  ministryName: string
  onOpenChat: (id: string, name: string) => void
  onTotalUnreadChange: (count: number) => void
  refreshKey: number
  onOpenDirectory: () => void
  activeGroupId?: string | null
}

export interface DirectoryMember {
  id: string
  name: string
  graduation_year: number | null
  role: string
  email: string
  about_me: string | null
  bible_verse: string | null
  prayer_request: string | null
  pray_for_me: string | null
  avatar_url: string | null
}

export interface UserTeam {
  teamId: string
  teamName: string
  teamIcon: string | null
  teamDescription: string | null
  roleId: string
  roleName: string
  permissions: string[]
}

export interface Team {
  id: string
  name: string
  icon: string | null
  description: string | null
  created_by: string
  member_count: number
}

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  start_date: string
  end_date: string
  all_day: boolean
  category: 'welcoming' | 'retreat' | 'social' | 'service' | 'regular'
  created_by: string
}

export interface EventPlan {
  id: string
  calendar_event_id: string
  overview_notes: string | null
  expected_turnout: number | null
  budget_allocated: number | null
}

export interface EventTask {
  id: string
  event_plan_id: string
  title: string
  assigned_to: string | null
  assigned_name?: string
  due_date: string | null
  completed: boolean
}

export interface EventRole {
  id: string
  event_plan_id: string
  role_name: string
  assigned_to: string | null
  assigned_name?: string
  notes: string | null
}

export interface EventNote {
  id: string
  event_plan_id: string
  content: string
  created_by: string
  created_by_name?: string
  created_at: string
}

export interface TeamRole {
  id: string
  team_id: string
  name: string
  permissions: string[]
}

export interface TeamMemberDisplay {
  user_id: string
  name: string
  role_id: string
  role_name: string
  joined_at: string
}

export interface DraftRole {
  name: string
  permissions: string[]
}

export interface RoleDescription {
  id: string
  team_id: string
  role_name: string
  description: string
  updated_by: string | null
  updated_at: string
}

export interface RoleLink {
  id: string
  team_id: string
  role_name: string
  title: string
  description: string
  url: string
  created_at: string
}

export interface MeetingNote {
  id: string
  team_id: string
  note_number: number
  date: string
  title: string
  body: string
  created_by: string
  created_at: string
}

export interface PlanTabProps {
  userId: string
  ministryId: string
  ministryName: string
  userTeams: UserTeam[]
  allTeams: Team[]
  isAdmin: boolean
  onTeamsChange: () => void
  showCreateTeam: boolean
  onShowCreateTeam: (v: boolean) => void
  activeTeamId: string | null
  onTeamCreated: (teamId: string) => void
}

export interface WorshipWeek {
  id: string
  week_date: string
  leader_id: string | null
  leader_name: string | null
  status: "draft" | "filled" | "confirmed"
  roles: WorshipRoleRow[]
}

export interface WorshipRoleRow {
  id: string
  user_id: string
  user_name: string
  role_name: string
}

export interface PraiseTeamMember {
  user_id: string
  name: string
}

export interface WorshipSong {
  id: string
  week_id: string
  title: string
  key: string
  song_leader_id: string | null
  song_leader_name: string | null
  order_index: number
  chart_url?: string | null
}

export interface WorshipInvite {
  id: string
  week_id: string
  user_id: string
  user_name: string
  status: "pending" | "accepted" | "declined"
  sent_at: string
  responded_at: string | null
}

export interface WorshipChart {
  id: string
  song_id: string
  chart_url: string
  uploaded_by: string | null
  created_at: string
}

export interface AnnotationObj {
  id: string
  x: number
  y: number
  color: string
  text: string
}

export type Category = "welcoming" | "retreat" | "social" | "service" | "regular"

export type CreateStep = "preset" | "customize" | "members"

export type PaletteItemType = "nav" | "person" | "chat" | "announcement"

export interface PaletteItem {
  type: PaletteItemType
  id: string
  label: string
  sublabel?: string
  tab?: Tab
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  ministryId: string
  onTabChange: (tab: Tab) => void
  onOpenChat: (id: string, name: string) => void
}

export interface DesktopTopbarProps {
  crumbs: string[]
  right?: React.ReactNode
}

export interface DesktopSidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  ministryName: string
  chatsUnread: number
  showPlan: boolean
  userInitials: string
  userAvatarUrl?: string | null
  recentChats: ChatPreview[]
  userTeams: UserTeam[]
  onOpenChat: (id: string, name: string) => void
  activeGroupId?: string | null
  onLogout: () => void
  isAdmin?: boolean
  onCreateTeam?: () => void
  activeTeamId: string | null
  onActiveTeamChange: (id: string) => void
  profileSection: "spiritual-profile" | "journal"
  onProfileSectionChange: (s: "spiritual-profile" | "journal") => void
}

export interface HomeAppProps {
  userId: string
  initialProfile: Profile
  ministryId: string
  ministryName: string
}

export type { ChatPreview }
