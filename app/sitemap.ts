import type { MetadataRoute } from "next"

const BASE_URL = "https://joincentral.app"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/landing`, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${BASE_URL}/login`,   lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/signup`,  lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/join`,    lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  ]
}
