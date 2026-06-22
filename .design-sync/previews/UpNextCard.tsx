import { UpNextCard } from "central"

export function EventCard() {
  return (
    <div style={{ padding: 16, background: "#F1ECDE", maxWidth: 420 }}>
      <UpNextCard
        label="Up Next"
        labelAccent={true}
        title="Friday Night Worship"
        body="Join us this Friday at 7 PM in Founders Hall. Live worship, community, and a short message from Pastor Tim."
        isEvent={true}
        userHasRsvped={false}
        rsvping={false}
        rsvpCount={14}
        showAttendees={true}
        attendees={[
          { user_id: "1", name: "Sarah Kim" },
          { user_id: "2", name: "David Park" },
          { user_id: "3", name: "Lily Chen" },
          { user_id: "4", name: "Marcus Johnson" },
        ]}
        onRsvp={() => {}}
        onDetails={() => {}}
        mobile={true}
      />
    </div>
  )
}

export function AnnouncementCard() {
  return (
    <div style={{ padding: 16, background: "#F1ECDE", maxWidth: 420 }}>
      <UpNextCard
        label="Pinned"
        labelAccent={false}
        title="Spring Retreat Registration"
        body="Spots are filling up — register before Friday to secure your spot at Camp Harmony."
        isEvent={false}
        onDetails={() => {}}
        mobile={true}
      />
    </div>
  )
}

export function GoingState() {
  return (
    <div style={{ padding: 16, background: "#F1ECDE", maxWidth: 420 }}>
      <UpNextCard
        label="Up Next"
        labelAccent={true}
        title="DG Praise Night"
        isEvent={true}
        userHasRsvped={true}
        rsvpCount={8}
        onRsvp={() => {}}
        onDetails={() => {}}
        mobile={true}
      />
    </div>
  )
}
