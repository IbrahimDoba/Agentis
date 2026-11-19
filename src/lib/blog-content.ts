import fs from "fs"
import path from "path"
import type { Faq } from "@/lib/seo"

// One Markdown file per article, under src/ so it ships with the app. The
// articles used to live in a single file at the repo root that the Docker
// image never copied, so every blog post returned a 500 in production.
// next.config.ts traces this folder into the standalone server bundle.
const CONTENT_DIR = path.join(process.cwd(), "src", "content", "blog")

export function getArticleContent(articleId: number): string {
  try {
    return fs.readFileSync(path.join(CONTENT_DIR, `${articleId}.md`), "utf-8").trim()
  } catch {
    // A missing file is a 404 for the caller to raise, never a crashed page.
    return ""
  }
}

const FAQ_HEADING = /^### frequently asked questions\s*$/im

/**
 * The questions under an article's "Frequently asked questions" heading, as
 * plain text, for FAQ structured data. Each question is a "#### " heading and
 * its answer is the text up to the next heading.
 */
export function getArticleFaqs(content: string): Faq[] {
  const start = content.search(FAQ_HEADING)
  if (start === -1) return []
  const rest = content.slice(start).split("\n").slice(1)
  const faqs: Faq[] = []
  let q: string | null = null
  let a: string[] = []
  const flush = () => {
    if (q && a.length) faqs.push({ q, a: plain(a.join(" ")) })
    q = null
    a = []
  }
  for (const line of rest) {
    if (line.startsWith("#### ")) {
      flush()
      q = plain(line.slice(5))
    } else if (line.startsWith("### ")) {
      break
    } else if (q && line.trim()) {
      a.push(line.replace(/^(- |\d+\. |> )/, "").trim())
    }
  }
  flush()
  return faqs
}

// Strip the Markdown the renderer supports, leaving readable text.
function plain(text: string): string {
  return text
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}
