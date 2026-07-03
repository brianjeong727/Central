import type { ReactNode } from "react"
import type { ChatPreview } from "@/components/ui/chats-section"

export type Tab = "home" | "announcements" | "chats" | "plan" | "directory" | "give" | "profile" | "settings" | "forms" | "congregation"

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
  phone?: string | null
  bio?: string | null
  testimony?: string | null
  favorite_worship_song?: string | null
  favorite_verse?: string | null
  favorite_book_of_bible?: string | null
  ministry_id?: string | null
  avatar_url?: string | null
  school_id?: string | null
  show_journal_entries?: boolean
  show_journal_streak?: boolean
  seen_workspace_nav_hint?: boolean
  grad_prompt_dismissed?: boolean
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
  is_sub_pinned: boolean
  is_event: boolean
  event_date: string | null
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
  onViewChange?: (view: "list" | "detail", title?: string) => void
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
  is_edited?: boolean
  edited_at?: string | null
  attachment_url?: string | null
  attachment_type?: string | null
  attachment_name?: string | null
  attachment_size?: number | null
  poll_id?: string | null
}


export interface Poll {
  id: string
  group_id: string
  question: string
  options: string[]
  created_by: string
  created_at: string
}

export interface Reaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
}

// ── MessageRow (memoized chat message row — app/home/tabs/message-row.tsx) ──

export interface LinkPreviewData {
  title: string | null
  description: string | null
  image: string | null
  hostname: string
  url: string
}

export interface ReadReceiptEntry {
  name: string
  avatarUrl: string | null
}

/** Message enriched by ChatScreen's processedMessages memo (grouped vote receipts). */
export type ProcessedMessage = Message & { _voteGroup?: string[] }

export interface MessageRowProps {
  msg: ProcessedMessage
  isOwn: boolean
  /** True only for the very first message in the list — popovers open downward instead of upward. */
  isFirstMessage: boolean
  isFirstInGroup: boolean
  isLastInGroup: boolean
  showDateSep: boolean
  showGroupGap: boolean
  senderDeparted: boolean
  userId: string
  canPin: boolean
  isAdminOrLeader: boolean
  // Per-row booleans (never the shared open-id — keeps React.memo effective)
  isEmojiPickerOpen: boolean
  isFullPickerOpen: boolean
  isContextMenuOpen: boolean
  isDeleting: boolean
  isEditing: boolean
  isPollMenuOpen: boolean
  isPinned: boolean
  /** Present only on the row currently being edited. */
  editText?: string
  /** Present only when this row is a search match while search is active. */
  highlightQuery?: string
  isActiveSearchMatch: boolean
  // Per-row data slices (stable references for unchanged rows)
  reactions?: Reaction[]
  linkPreview?: LinkPreviewData
  readReceipts?: ReadReceiptEntry[]
  poll?: { question: string; options: string[] }
  pollUserVote?: number
  pollCounts?: number[]
  isChangingVote: boolean
  // Large-room "Seen by N" — gated by the parent to the latest own message only
  isLargeRoom: boolean
  isLatestOwn: boolean
  seenByCount: number | null
  seenByOpen: boolean
  seenByList: ReadReceiptEntry[] | null
  onToggleSeenBy?: () => void
  // Stable callbacks (useCallback in ChatScreen, or bare setState setters)
  registerMessageRef: (id: string, el: HTMLDivElement | null) => void
  onPointerDown: (msg: Message) => void
  onPointerUp: (msg: Message) => void
  onPointerCancel: () => void
  onReact: (messageId: string, emoji: string) => void
  onDeleteMessage: (msgId: string) => void
  onDeletePoll: (msgId: string, pollId: string) => void
  onSaveEdit: () => void
  onStartEdit: (msg: Message) => void
  onForward: (msg: Message) => void
  onPin: (msgId: string) => void
  onUnpin: () => void
  onScrollToMessage: (id: string) => void
  onOpenVoteSheet: (pollId: string, hasVoted: boolean) => void
  setEmojiPickerFor: (id: string | null) => void
  setFullReactionPickerFor: (id: string | null) => void
  setContextMenuFor: (id: string | null) => void
  setDeletingId: (id: string | null) => void
  setEditingId: (id: string | null) => void
  setEditText: (text: string) => void
  setReplyingTo: (msg: Message | null) => void
  setPollMenuFor: (id: string | null) => void
}

export interface CongregationQuestion {
  id: string
  ministry_id: string
  created_by: string
  question_text: string
  question_type: "poll" | "scale" | "open" | "prayer"
  options: string[] | null
  is_active: boolean
  created_at: string
  closed_at: string | null
}

export interface CongregationTabProps {
  userId: string
  ministryId: string
  userRole: string
  onViewChange?: (view: "list" | "create" | "detail") => void
}

export interface HomeTabProps {
  profile: Profile
  userRole: string
  ministryId: string
  ministryName: string
  recentChats: ChatPreview[]
  onSeeChats: () => void
  onSeeAnnouncements: () => void
  onOpenChat: (id: string, name: string, type?: string) => void
  onGoToProfile: () => void
  onOpenAnnouncement: (id: string) => void
  avatarUrl?: string | null
  activeQuestion?: CongregationQuestion | null
  hasResponded?: boolean
  onResponded?: () => void
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
  onOpenAnnouncement: (id: string) => void
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
  onPinToggle?: (id: string, isPinned: boolean) => void
  onSubPinToggle?: (id: string, isSubPinned: boolean) => void
  onOpenForm: (formId: string, announcementId: string, title: string) => void
  onOpenDetail: (id: string) => void
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
  ministryName: string
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
  ministryName: string
  userRole: string
  onClose: () => void
  onRead?: () => void
  onNameChange?: (name: string) => void
  inline?: boolean
}

// Message composer (bottom input area) — extracted from ChatScreen so per-keystroke
// churn (inputText, @mention autocomplete, GIF search) re-renders only the composer.
// ChatScreen keeps messages + optimistic send behind the callbacks below.
export interface ComposerProps {
  groupArchived: boolean
  displayName: string
  // Roster (self already excluded) for @mention autocomplete. Structural type — the
  // richer roster objects pass fine.
  mentionMembers: { id: string; name: string }[]
  replyingTo: Message | null
  sending: boolean
  uploading: boolean
  pollActive: boolean
  // Send stays in ChatScreen (owns messages + optimistic reconciliation). Composer
  // clears its own inputText/attachment locally, then hands the payload up.
  onSend: (payload: { content: string; attachment: File | null; replyTo: Message | null }) => void
  onSendGif: (fullUrl: string) => void
  // Throttled typing broadcast — the realtime channel lives in ChatScreen.
  onTyping: (value: string) => void
  onClearReply: () => void
  onSetPollOpen: (open: boolean) => void
}

export interface ChatsTabProps {
  userId: string
  userProfile: Profile
  userRole: string
  ministryId: string
  ministryName: string
  onOpenChat: (id: string, name: string, type?: string) => void
  onTotalUnreadChange: (count: number) => void
  refreshKey: number
  onOpenDirectory: () => void
  activeGroupId?: string | null
  canCreateChurchChat: boolean
  fallbackChats?: ChatGroup[]
}

// Slim list-row + detail-header shape — fetched for EVERY member on directory
// load, so it must stay light (no free-text profile fields).
export interface DirectoryMember {
  id: string
  name: string
  graduation_year: number | null
  role: string
  avatar_url: string | null
}

// Full profile shape — fetched on demand (per member) when a detail view opens.
export interface DirectoryMemberDetail extends DirectoryMember {
  email: string
  phone: string | null
  about_me: string | null
  bio: string | null
  bible_verse: string | null
  favorite_verse: string | null
  prayer_request: string | null
  pray_for_me: string | null
  testimony: string | null
  favorite_worship_song: string | null
  favorite_book_of_bible: string | null
}

export interface UserTeam {
  teamId: string
  teamName: string
  teamIcon: string | null
  teamDescription: string | null
  teamType: 'standard' | 'dg_praise' | 'one_time' | 'finance'
  roleId: string
  roleName: string
  permissions: string[]
  isPresident: boolean
  allowCoPresidency: boolean
  // Per-team override: when false (default), admin-tier users can't be team members.
  allowAdminMembers: boolean
  // Whether this team has a member assigned to its president role.
  hasPresident?: boolean
  // Number of members on this team (for the workspace picker subtitle).
  memberCount?: number
}

export interface Team {
  id: string
  name: string
  icon: string | null
  description: string | null
  created_by: string
  member_count: number
  team_type: 'standard' | 'dg_praise' | 'one_time' | 'finance'
  allow_co_presidency: boolean
  // Per-team admin governance matrix: what governing admins get on this team.
  admin_access: 'none' | 'view' | 'write'
  // Per-team override: when false (default), admin-tier users (admin/deacon/elder/pastor)
  // can't be added as members. Admins govern from outside unless this is enabled.
  allow_admin_members: boolean
  // Whether this team has a member assigned to its president role.
  hasPresident?: boolean
}

// Global governance roster (ministries.governance_settings). When all_admins is
// true every admin-tier user governs; otherwise only roster_ids govern.
export interface GovernanceSettings {
  all_admins: boolean
  roster_ids: string[]
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
  planning_group_id: string | null
  plan_start_date: string | null
  crunch_date: string | null
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

// Cross-year institutional memory of event pain points. Keyed on team_id +
// event_type so a recurring event's notes accumulate across class years.
// Append-only (RLS: ministry members SELECT + INSERT; no update/delete).
export interface TransitionNote {
  id: string
  ministry_id: string
  team_id: string | null
  event_type: string
  class_year: string
  title: string
  category: string | null
  watch_text: string | null
  solved_text: string | null
  created_by: string
  created_by_name: string | null
  created_at: string
}

export interface TeamRole {
  id: string
  team_id: string
  name: string
  permissions: string[]
  is_president: boolean
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
  is_president?: boolean
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
  updated_at: string
  updated_by: string | null
}

export interface PlanTabProps {
  userId: string
  userName: string
  ministryId: string
  ministryName: string
  userTeams: UserTeam[]
  allTeams: Team[]
  isAdmin: boolean
  // Whether this user is on the governance roster (narrows raw isAdmin). Used for
  // structural team-admin gates; equals isAdmin when governance is all_admins.
  isGovernanceAdmin: boolean
  governanceSettings: GovernanceSettings
  isDGL: boolean
  isPastor: boolean
  onTeamsChange: () => void
  showCreateTeam: boolean
  onShowCreateTeam: (v: boolean) => void
  activeTeamId: string | null
  onOpenChat?: (id: string, name: string, type?: string) => void
  // Called when user clicks a team card in the picker (no-team-selected state)
  onTeamSelect?: (teamId: string) => void
  // Lifted student-org planning state (for breadcrumb + sidebar)
  studentOrgSection?: string
  onStudentOrgSectionChange?: (s: string) => void
  studentOrgPlanningEvent?: CalendarEvent | null
  onStudentOrgPlanningEventChange?: (ev: CalendarEvent | null) => void
  onStudentOrgCalEventsChange?: (events: CalendarEvent[]) => void
  // Lifted small group leaders state (for sidebar)
  sglSection?: string
  onSglSectionChange?: (s: string) => void
  // Lifted finance team section state (for sidebar)
  financeSection?: string
  onFinanceSectionChange?: (s: string) => void
  // Receipts workspace: team selected WITHIN receipts (synced to ?rteam)
  activeReceiptsTeamId?: string | null
  onReceiptsTeamChange?: (id: string) => void
}

export interface WorshipWeek {
  id: string
  week_date: string
  leader_id: string | null
  leader_name: string | null
  status: "draft" | "filled" | "confirmed"
  auto_archive_date: string | null
  chat_group_id: string | null
  event_name: string | null
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
  // For chat items: the group category (church/my/dm) → drives the Messages subtab.
  chatType?: string
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  ministryId: string
  onTabChange: (tab: Tab) => void
  onOpenChat: (id: string, name: string, type?: string) => void
}

export type Crumb = { label: string; onClick?: () => void }

export interface DesktopTopbarProps {
  crumbs: Crumb[]
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
  onOpenChat: (id: string, name: string, type?: string) => void
  activeGroupId?: string | null
  onLogout: () => void
  isAdmin?: boolean
  isPastor?: boolean
  // Leader-tier (Convention #2, incl. pastor) — gates the Forms insights nav item.
  isLeaderOrAdmin?: boolean
  onCreateTeam?: () => void
  activeTeamId: string | null
  // Resolved active-team name (membership OR allTeams fallback for gov-view) — drives the panel header
  activeTeamName?: string
  onActiveTeamChange: (id: string) => void
  profileSection: "spiritual-profile" | "journal"
  onProfileSectionChange: (s: "spiritual-profile" | "journal") => void
  isTreasurer: boolean
  isDGL: boolean
  canCreateTeam?: boolean
  userId: string
  // Directory panel
  directoryMinistryId?: string
  directoryCurrentUserId?: string
  directorySelectedMemberId?: string | null
  directoryInitialMemberId?: string | null
  onDirectoryMemberSelect?: (member: DirectoryMember) => void
  // Chat panel
  chatPanelContent?: ReactNode
  // Plan panel override — renders in place of team list when student org is active
  planContextContent?: ReactNode
  // When true, hides the cream context panel entirely (icon rail stays); used for full-width picker
  hideSidePanel?: boolean
  // Rail brand mark — contextual "back to Plan workspaces" control (picker on Plan
  // for 2+-workspace users; /landing otherwise).
  onLogoClick: () => void
  // One-time teaching hint shown on the rail mark the first time a 2+-workspace user
  // reaches the plan picker.
  showWorkspaceNavHint?: boolean
  onDismissNavHint?: () => void
}

export interface HomeAppProps {
  userId: string
  initialProfile: Profile
  ministryId: string
  ministryName: string
  initialRecentChats?: ChatPreview[]
  initialUserTeams?: UserTeam[]
  initialActiveQuestion?: CongregationQuestion | null
  initialHasResponded?: boolean
  initialGovernanceSettings?: GovernanceSettings
}

export type { ChatPreview }
