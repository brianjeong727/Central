import { Label, Input } from "central"

export function StandaloneLabel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 24, background: "#FBF8F2" }}>
      <Label>Email address</Label>
      <Label>Graduation year</Label>
      <Label>Invite code</Label>
    </div>
  )
}

export function LabelWithInput() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 24, background: "#FBF8F2", maxWidth: 320 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Label htmlFor="email">Email address</Label>
        <Input id="email" type="email" placeholder="you@university.edu" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Label htmlFor="code">Invite code</Label>
        <Input id="code" placeholder="e.g. CENTRAL-2024" />
      </div>
    </div>
  )
}
