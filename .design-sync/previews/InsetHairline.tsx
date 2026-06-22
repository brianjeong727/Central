import { InsetHairline, SectionHeader } from "central"

export function BetweenSections() {
  return (
    <div style={{ background: "#FDFCF8", maxWidth: 390, paddingTop: 24 }}>
      <div style={{ paddingLeft: 24, paddingRight: 24, paddingBottom: 20 }}>
        <SectionHeader eyebrow="Community" title="Announcements" />
      </div>
      <InsetHairline />
      <div style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 20 }}>
        <SectionHeader eyebrow="Ministry" title="Directory" />
      </div>
      <InsetHairline />
    </div>
  )
}

export function Standalone() {
  return (
    <div style={{ background: "#FDFCF8", maxWidth: 390, padding: 24 }}>
      <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--body)", marginBottom: 20 }}>
        First section content.
      </p>
      <InsetHairline />
      <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--body)", marginTop: 20 }}>
        Second section content.
      </p>
    </div>
  )
}
