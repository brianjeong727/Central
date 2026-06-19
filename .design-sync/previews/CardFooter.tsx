import { Card, CardHeader, CardTitle, CardFooter, Button } from "central"

export function ActionFooter() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 360 }}>
      <Card>
        <CardHeader>
          <CardTitle>Friday Night Worship</CardTitle>
        </CardHeader>
        <CardFooter>
          <Button size="sm">RSVP</Button>
          <Button variant="ghost" size="sm" style={{ marginLeft: 8 }}>Share</Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export function ConfirmFooter() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 360 }}>
      <Card>
        <CardHeader>
          <CardTitle>Leave Ministry</CardTitle>
        </CardHeader>
        <CardFooter>
          <Button variant="destructive" size="sm">Leave</Button>
          <Button variant="outline" size="sm" style={{ marginLeft: 8 }}>Cancel</Button>
        </CardFooter>
      </Card>
    </div>
  )
}
