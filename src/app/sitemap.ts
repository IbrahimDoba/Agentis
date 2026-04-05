import { MetadataRoute } from "next"
import { blogPosts } from "@/data/blog-posts"

const BASE_URL = process.env.NEXTAUTH_URL?.startsWith("http://localhost")
  ? "https://www.dailzero.com"
  : (process.env.NEXTAUTH_URL ?? "https://www.dailzero.com")

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return [
    {
      url: `${BASE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/how-it-works`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/features`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/careers`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/security`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/signup`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/forgot-password`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/changelog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/data-deletion`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    ...blogPosts.map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ]
}
