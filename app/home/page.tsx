import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase-server"
import { HomeApp } from "./home-app"

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, graduation_year, role, about_me, bible_verse, prayer_request, pray_for_me, ministry_id, avatar_url")
    .eq("id", user.id)
    .single()

  if (!profile?.ministry_id) redirect("/join")

  const { data: ministry } = await supabase
    .from("ministries")
    .select("name")
    .eq("id", profile.ministry_id)
    .single()

  const safeProfile = profile ?? {
    id: user.id,
    name: user.email?.split("@")[0] ?? "Member",
    email: user.email ?? "",
    graduation_year: null,
    role: "member",
    about_me: null,
    bible_verse: null,
    prayer_request: null,
    pray_for_me: null,
    ministry_id: null,
    avatar_url: null,
  }

  return (
    <HomeApp
      userId={user.id}
      initialProfile={safeProfile}
      ministryId={profile.ministry_id}
      ministryName={ministry?.name ?? ""}
    />
  )
}
