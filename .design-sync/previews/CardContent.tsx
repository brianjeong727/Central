import { Card, CardContent } from "central"

export function AnnouncementBody() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 360 }}>
      <Card>
        <CardContent>
          <p style={{ fontSize: 14, color: "#5A5466", lineHeight: 1.6 }}>
            Join us for Friday Night Worship at 7 PM in Founders Hall. Doors open at 6:30. Live worship, community, and a short message from Pastor Tim.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export function MemberBio() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 340 }}>
      <Card>
        <CardContent>
          <p style={{ fontSize: 13, color: "#5A5466", lineHeight: 1.7 }}>
            "I can do all things through Christ who strengthens me." — Phil 4:13
          </p>
          <p style={{ fontSize: 13, color: "#8A8497", marginTop: 8 }}>Biochemistry · Class of 2026 · Praise Team</p>
        </CardContent>
      </Card>
    </div>
  )
}
