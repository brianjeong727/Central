import { Input } from "central"

export function TextInput() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 24, background: "#FBF8F2", maxWidth: 320 }}>
      <Input placeholder="Search members..." />
      <Input placeholder="Your name" defaultValue="Brian Jeong" />
      <Input type="email" placeholder="email@university.edu" />
    </div>
  )
}

export function DisabledInput() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 320 }}>
      <Input placeholder="Invite code" disabled defaultValue="CENTRAL-2024" />
    </div>
  )
}

export function PasswordInput() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 320 }}>
      <Input type="password" placeholder="Password" />
    </div>
  )
}
