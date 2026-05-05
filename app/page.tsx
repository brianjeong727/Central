import type { Metadata } from "next"
import LandingPage from "@/components/landing-page"

export const metadata: Metadata = {
  title: "Central — College Ministry Communication Platform",
  description:
    "The all-in-one communication and planning app built for college ministries. Chat, announcements, member directory, and team planning tools.",
  keywords: [
    "college ministry",
    "campus ministry",
    "church communication app",
    "student ministry platform",
    "ministry planning",
    "church chat",
    "ministry directory",
  ],
}

export default function RootPage() {
  return <LandingPage />
}
