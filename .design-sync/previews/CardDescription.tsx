import { Card, CardHeader, CardTitle, CardDescription } from "central"

export function EventDescription() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 360 }}>
      <Card>
        <CardHeader>
          <CardTitle>Spring Retreat 2025</CardTitle>
          <CardDescription>April 18–20 · Camp Harmony · $80/person</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export function MemberDescription() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 360 }}>
      <Card>
        <CardHeader>
          <CardTitle>Sarah Kim</CardTitle>
          <CardDescription>Junior · Biochemistry · Class of 2026</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
