import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button } from "central"

export function AnnouncementCard() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 360 }}>
      <Card>
        <CardHeader>
          <CardTitle>Friday Night Worship</CardTitle>
          <CardDescription>This Friday at 7 PM — Founders Hall</CardDescription>
        </CardHeader>
        <CardContent>
          <p style={{ fontSize: 14, color: "#5A5466", lineHeight: 1.6 }}>
            Join us for an evening of worship and community. Doors open at 6:30 PM.
          </p>
        </CardContent>
        <CardFooter>
          <Button size="sm">RSVP</Button>
          <Button variant="ghost" size="sm" style={{ marginLeft: 8 }}>Share</Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export function ProfileCard() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 340 }}>
      <Card>
        <CardHeader>
          <CardTitle>Sarah Kim</CardTitle>
          <CardDescription>Junior · Biochemistry · Class of 2026</CardDescription>
        </CardHeader>
        <CardContent>
          <p style={{ fontSize: 13, color: "#5A5466", lineHeight: 1.6 }}>
            "I can do all things through Christ who strengthens me." — Phil 4:13
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
