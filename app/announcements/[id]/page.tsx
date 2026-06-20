import { redirect } from "next/navigation"

export default function AnnouncementDetailPage() {
  redirect("/home?tab=announcements")
}
