import { Button } from "central"

export function PrimaryButton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 24, background: "#FBF8F2" }}>
      <Button>Join Ministry</Button>
      <Button size="sm">Confirm RSVP</Button>
      <Button size="lg">Get Started</Button>
    </div>
  )
}

export function ButtonVariants() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 24, background: "#FBF8F2" }}>
      <Button variant="default">Default</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Remove Member</Button>
      <Button variant="link">See all announcements</Button>
    </div>
  )
}

export function DisabledButton() {
  return (
    <div style={{ display: "flex", gap: 12, padding: 24, background: "#FBF8F2" }}>
      <Button disabled>Disabled</Button>
      <Button variant="outline" disabled>Outline Disabled</Button>
    </div>
  )
}
