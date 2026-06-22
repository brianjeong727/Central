import { CentralButton } from "central"

export function PrimaryVariants() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "24px", background: "#FDFCF8" }}>
      <CentralButton variant="primary">RSVP for event</CentralButton>
      <CentralButton variant="secondary">Cancel</CentralButton>
      <CentralButton variant="plum-outline">View details</CentralButton>
    </div>
  )
}

export function AllVariants() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "24px", background: "#FDFCF8" }}>
      <CentralButton variant="primary">Join Ministry</CentralButton>
      <CentralButton variant="secondary">Leave group</CentralButton>
      <CentralButton variant="plum-outline">See announcement</CentralButton>
      <CentralButton variant="destructive">Remove member</CentralButton>
      <CentralButton variant="ghost">Dismiss</CentralButton>
      <CentralButton variant="soft-pill">Going ✓</CentralButton>
    </div>
  )
}

export function DisabledState() {
  return (
    <div style={{ display: "flex", gap: 12, padding: "24px", background: "#FDFCF8" }}>
      <CentralButton variant="primary" disabled>Submitting...</CentralButton>
      <CentralButton variant="secondary" disabled>Cancel</CentralButton>
    </div>
  )
}
