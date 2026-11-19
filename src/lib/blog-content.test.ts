import { describe, it, expect } from "vitest"
import { blogPosts } from "@/data/blog-posts"
import { getArticleContent, getArticleFaqs } from "./blog-content"

describe("blog content", () => {
  // A post listed without a body is a dead page in the sitemap. That is the
  // failure that took every article down in production.
  it("has an article file for every listed post", () => {
    const missing = blogPosts.filter((p) => !getArticleContent(p.id)).map((p) => p.id)
    expect(missing).toEqual([])
  })

  it("has no body that opens with a heading, since the page prints the title", () => {
    const bad = blogPosts.filter((p) => getArticleContent(p.id).startsWith("#")).map((p) => p.id)
    expect(bad).toEqual([])
  })

  it("reads each article's questions for FAQ structured data", () => {
    const thin = blogPosts.filter((p) => getArticleFaqs(getArticleContent(p.id)).length < 3).map((p) => p.id)
    expect(thin).toEqual([])
  })

  it("strips Markdown from extracted questions and answers", () => {
    const faqs = getArticleFaqs("Intro\n\n### Frequently asked questions\n\n#### Is it **free**?\n\nYes, see [pricing](/pricing).\n\n### Next\n\n#### Not a question")
    expect(faqs).toEqual([{ q: "Is it free?", a: "Yes, see pricing." }])
  })
})
