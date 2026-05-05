import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/landing", "/login", "/signup", "/join"],
      disallow: ["/home", "/api/"],
    },
    sitemap: "https://joincentral.app/sitemap.xml",
  }
}
