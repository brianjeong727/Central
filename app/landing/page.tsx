import { redirect } from "next/navigation"

// /landing now lives at the root URL — redirect cleanly
export default function LandingRedirect() {
  redirect("/")
}
