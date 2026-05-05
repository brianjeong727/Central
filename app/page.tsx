import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase-server"

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Unauthenticated → landing page for new visitors
  // Authenticated → home (proxy handles /join redirect if no ministry_id)
  if (!user) redirect("/landing")
  redirect("/home")
}
