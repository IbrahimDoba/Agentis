import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/seo"

const PRIVATE = ["/admin/", "/api/", "/dashboard/"]

// The crawlers behind ChatGPT, Claude, Gemini, Perplexity and the rest. They
// are named one by one because several only crawl when a rule addresses them,
// and so that allowing them is a recorded decision, not a default.
const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai",
  "Google-Extended", "PerplexityBot", "Perplexity-User",
  "Applebot-Extended", "Amazonbot", "CCBot", "meta-externalagent",
  "Bytespider", "DuckAssistBot", "MistralAI-User", "cohere-ai",
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
