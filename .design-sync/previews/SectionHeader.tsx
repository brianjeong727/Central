import { SectionHeader, CentralButton } from "central"

export function AnnouncementsHeader() {
  return (
    <div style={{ padding: "28px 24px", background: "#FDFCF8", maxWidth: 390 }}>
      <SectionHeader
        eyebrow="Community"
        title="Announcements"
      />
    </div>
  )
}

export function WithAction() {
  return (
    <div style={{ padding: "28px 24px", background: "#FDFCF8", maxWidth: 390 }}>
      <SectionHeader
        eyebrow="Giving"
        title="Budget Overview"
        action={<CentralButton variant="secondary">View all</CentralButton>}
      />
    </div>
  )
}

export function SmallTitle() {
  return (
    <div style={{ padding: "28px 24px", background: "#FDFCF8", maxWidth: 390 }}>
      <SectionHeader
        eyebrow="Members"
        title="Directory"
        titleSize={22}
      />
    </div>
  )
}
