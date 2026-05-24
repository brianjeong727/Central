import type { ChatPreview } from "@/components/ui/chats-section"

export type Tab = "home" | "announcements" | "chats" | "plan" | "directory" | "giving" | "profile" | "settings" | "forms"

export interface Profile {
  id: string
  name: string
  email: string
  graduation_year: number | null
  grade?: string | null
  needs_grad_check?: boolean
  role: string
  about_me: string | null
  bible_verse: string | null
  prayer_request: string | null
  pray_for_me: string | null
  ministry_id?: string | null
  avatar_url?: string | null
  school_id?: string | null
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
  show_attendees: boolean
  status?: string
}

export interface RsvpAttendee {
  user_id: string
  name: string
}

export interface EnrichedAnnouncement extends Announcement {
  view_count: number
  rsvp_count: number
  user_has_rsvped: boolean
  rsvp_attendees: RsvpAttendee[]
  has_form: boolean
  form_id: string | null
  user_has_responded: boolean
}

export type FieldType = 'text' | 'multiple_choice' | 'checkbox' | 'dropdown'

export interface FormField {
  id: string
  form_id: string
  label: string
  type: FieldType
  options: string[]
  required: boolean
  order_index: number
}

export interface FormResponse {
  id: string
  form_id: string
  announcement_id: string
  ministry_id: string
  user_id: string
  submitted_at: string
}

export interface FormAnswer {
  id: string
  response_id: string
  field_id: string
  value: string | null
  values: string[]
}

export interface FormsTabProps {
  userId: string
  userName: string
  userRole: string
  ministryId: string
  ministryName: string
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
  sender_id: string | null
  content: string
  created_at: string
  sender_name: string
  sender_avatar_url?: string | null
  reply_to_id: string | null
  reply_to_content: string | null
  reply_to_sender: string | null
  deleted?: boolean
  message_type?: string
}

export interface Reaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
}

export interface HomeTabProps {
  profile: Profile
  userRole: string
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
  userName: string
  userRole: string
  userGradYear: number | null
  ministryId: string
  ministryName: string
}

export interface AnnouncementDetailProps {
  announcement: EnrichedAnnouncement
  userId: string
  userRole: string
  onClose: () => void
  onRsvpToggle: (id: string) => void
}

export interface AnnouncementCardProps {
  announcement: EnrichedAnnouncement
  isPinned: boolean
  featured?: boolean
  userId: string
  ministryId: string
  userRole: string
  onRsvpToggle: (id: string) => void
  onEdit: (ann: EnrichedAnnouncement) => void
  onDelete: (id: string) => void
  onOpenForm: (formId: string, announcementId: string, title: string) => void
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
  groupArchived?: boolean
  userId: string
  userName: string
  ministryId: string
  userRole: string
  onBack: () => void
  onNameChange: (name: string) => void
  onClose: () => void
  onGroupDeleted?: () => void
}

export interface ChatScreenProps {
  groupId: string
  groupName: string
  userId: string
  userName: string
  ministryId: string
  userRole: string
  onClose: () => void
  onRead?: () => void
  onNameChange?: (name: string) => void
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
  canCreateChurchChat: boolean
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

export type EventType = 'welcome_week' | 'coffeehouse' | 'turkey_bowl' | 'retreat' | 'appreciation_night' | 'social' | 'ministry'
export type EventStatus = 'planning' | 'active' | 'complete'
export type EventExtraTab = 'sub_events' | 'new_folks' | 'acts' | 'teams' | 'transport' | 'program'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  start_date: string
  end_date: string
  all_day: boolean
  category: string
  event_type: EventType
  parent_event_id: string | null
  linked_announcement_id: string | null
  status: EventStatus
  created_by: string
}

export interface EventPlan {
  id: string
  calendar_event_id: string
  overview_notes: string | null
  expected_turnout: number | null
  budget_allocated: number | null
  type_data: Record<string, unknown>
}

export interface EventTask {
  id: string
  event_plan_id: string
  title: string
  assigned_to: string | null
  assigned_name?: string
  due_date: string | null
  completed: boolean
  phase: 'pre_event' | 'day_of' | 'post_event' | 'followup'
  sort_order: number
}

export interface EventNewFolk {
  id: string
  event_plan_id: string
  ministry_id: string
  name: string
  contact: string | null
  notes: string | null
  assigned_dgl_id: string | null
  assigned_dgl_name?: string
  created_at: string
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
  userName: string
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
  auto_archive_date: string | null
  chat_group_id: string | null
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
  role_name: string
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
  financeSection: "give" | "reimbursements" | "budget"
  onFinanceSectionChange: (s: "give" | "reimbursements" | "budget") => void
  isTreasurer: boolean
  isDGL: boolean
}

export interface HomeAppProps {
  userId: string
  initialProfile: Profile
  ministryId: string
  ministryName: string
}

export type { ChatPreview }
