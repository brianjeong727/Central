// Shared DGL types and constants — client-safe (no "use server")

export type DGLSlot = "wednesday_pm" | "friday_sg" | "sunday_service"

export const SLOTS: DGLSlot[] = ["wednesday_pm", "friday_sg", "sunday_service"]

// One person handles all responsibilities for their assigned slot.
export type ProposedAssignment = {
  week_date: string
  slot: DGLSlot
  user_id: string
  user_name: string
  needs_review: boolean
}
