// Single source of truth for tab → nav-section membership (R7).
//
// The desktop context-panel SECTION label, the desktop icon-rail active highlight,
// and the mobile bottom-nav highlight ALL derive from this one map — never a
// parallel hand-coded switch (that drift is what produced the old
// `id === "profile" && activeTab === "congregation"` couplings).
//
// Pure data + lookup; imports nothing (leaf, no cycles) so both `app/home` and
// `components/ui` can consume it.

export interface NavSection {
  /** Matches the rail item id this section lights up. */
  id: string
  /** Default SECTION label (context-panel header). Some tabs override the label
   *  (settings → "Church Settings") or make it dynamic (plan → team name); those
   *  overrides live in the consumer, not here. */
  label: string
  /** Tabs that belong to this section. A tab belongs to exactly one section. */
  memberTabs: string[]
}

// The Home section owns its ancillary tabs (announcements, give, forms, settings,
// congregation) so they all light the Home rail item and render the Home item list.
// Congregation lives here (moved out of the You section, R7) — pastor-gated at the
// item level, not here.
export const NAV_SECTIONS: NavSection[] = [
  { id: "home",      label: "Home",      memberTabs: ["home", "announcements", "give", "forms", "settings", "congregation"] },
  { id: "chats",     label: "Messages",  memberTabs: ["chats"] },
  { id: "plan",      label: "Workspace", memberTabs: ["plan"] },
  { id: "directory", label: "People",    memberTabs: ["directory"] },
  { id: "network",   label: "Network",   memberTabs: ["network"] },
  { id: "profile",   label: "You",       memberTabs: ["profile"] },
]

/** The section that owns `tab`, or undefined if unmapped. */
export function sectionForTab(tab: string): NavSection | undefined {
  return NAV_SECTIONS.find((s) => s.memberTabs.includes(tab))
}
