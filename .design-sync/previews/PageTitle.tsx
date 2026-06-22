import { PageTitle, CentralButton } from "central"

export function DirectoryTitle() {
  return (
    <div style={{ padding: 24, background: "#FDFCF8", maxWidth: 390 }}>
      <PageTitle
        eyebrow="Ministry"
        title="Directory"
      />
    </div>
  )
}

export function WithSubcontent() {
  return (
    <div style={{ padding: 24, background: "#FDFCF8", maxWidth: 390 }}>
      <PageTitle
        eyebrow="Finance"
        title="Giving"
      >
        <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--body)", marginTop: 12, lineHeight: 1.55 }}>
          Support your campus ministry — every gift makes an impact.
        </p>
        <div style={{ marginTop: 16 }}>
          <CentralButton variant="primary">Give now</CentralButton>
        </div>
      </PageTitle>
    </div>
  )
}

export function LargeTitle() {
  return (
    <div style={{ padding: 24, background: "#FDFCF8", maxWidth: 390 }}>
      <PageTitle
        eyebrow="Planning"
        title="Spring Retreat"
        titleSize={44}
      />
    </div>
  )
}
