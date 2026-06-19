import { Card, CardHeader, CardTitle, CardDescription } from "central"

export function EventHeader() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 360 }}>
      <Card>
        <CardHeader>
          <CardTitle>Friday Night Worship</CardTitle>
          <CardDescription>This Friday at 7 PM — Founders Hall</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export function SectionHeader() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 360 }}>
      <Card>
        <CardHeader>
          <CardTitle>Giving</CardTitle>
          <CardDescription>Support Central's mission on campus</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
