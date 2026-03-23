import fs from "fs"
import path from "path"

export function getArticleContent(articleId: number): string {
  const filePath = path.join(process.cwd(), "dailzero_100_articles.md")
  const content = fs.readFileSync(filePath, "utf-8")

  // Match the block for this article (up to the next article or EOF)
  const start = content.indexOf(`\n## Article ${articleId}:`)
  if (start === -1) return ""

  const nextArticle = content.indexOf(`\n## Article ${articleId + 1}:`, start + 1)
  const block = nextArticle !== -1 ? content.slice(start, nextArticle) : content.slice(start)

  // Find the body: starts at "---\n\n### " (after the SEO info divider)
  const bodyStart = block.search(/\n---\n\n### /)
  if (bodyStart === -1) return ""

  let body = block.slice(bodyStart + 6) // skip "\n---\n\n"

  // Remove trailing image suggestion and separators
  body = body.replace(/\n\n---\n\n\*Ideal image:[\s\S]*$/, "")
  body = body.replace(/\n---\n---\s*$/, "")
  body = body.replace(/\n---\s*$/, "")

  // Remove {#anchor-id} from headings (not valid markdown)
  body = body.replace(/\s*\{#[^}]+\}/g, "")

  return body.trim()
}
