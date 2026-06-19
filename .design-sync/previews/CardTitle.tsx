import { Card, CardHeader, CardTitle } from "central"

export function EventTitle() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 360 }}>
      <Card>
        <CardHeader>
          <CardTitle>Friday Night Worship</CardTitle>
        </CardHeader>
      </Card>
    </div>
  )
}

export function LongTitle() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 360 }}>
      <Card>
        <CardHeader>
          <CardTitle>Student Org Board End-of-Year Celebration</CardTitle>
        </CardHeader>
      </Card>
    </div>
  )
}
