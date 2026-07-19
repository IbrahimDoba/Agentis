import { describe, it, expect } from "vitest"
import { buildRichContent } from "./rich-content.js"

// Wrap products the way the webhook executor does: an outer envelope whose
// `body` is the stringified upstream JSON.
function toolResult(upstream: unknown, mapping?: unknown) {
  return {
    toolName: "search_products",
    rawResult: JSON.stringify({ ok: true, status: 200, tool: "search_products", body: JSON.stringify(upstream) }),
    mapping: mapping as never,
  }
}

// AVMall's real product shape: price/salePrice are FORMATTED STRINGS.
const avmallProduct = {
  id: "61e00879-0483-49c5-8cb3-e17de4e94702",
  slug: "120w-shplus-charger-head",
  productUrl: "https://avmall-nine.vercel.app/product/120w-shplus-charger-head",
  name: "120W Shplus charger head",
  price: "₦4,500",
  salePrice: "₦2,900",
  inStock: true,
  stock: 1,
  imageUrl: "https://cdn.example/a.webp",
}

describe("buildRichContent — string prices (AVMall)", () => {
  const mapping = { type: "products", currency: "NGN", itemsPath: "data.products" }

  it("builds cards from formatted price strings (the bug: used to produce none)", () => {
    const rc = buildRichContent([toolResult({ data: { products: [avmallProduct] } }, mapping)])
    expect(rc).not.toBeNull()
    expect(rc!.products).toHaveLength(1)
    const card = rc!.products[0]
    expect(card.name).toBe("120W Shplus charger head")
    expect(card.imageUrl).toBe("https://cdn.example/a.webp")
    // sale (₦2,900) is the headline, list (₦4,500) the strikethrough — in kobo
    expect(card.priceCents).toBe(290000)
    expect(card.originalPriceCents).toBe(450000)
    expect(card.inStock).toBe(true)
  })

  it("handles a plain string price with no sale", () => {
    const p = { name: "Tecno 33W charger head", price: "₦8,600", imageUrl: "https://cdn/x.webp" }
    const rc = buildRichContent([toolResult({ products: [p] })])
    expect(rc).not.toBeNull()
    expect(rc!.products[0].priceCents).toBe(860000)
    expect(rc!.products[0].originalPriceCents).toBeNull()
  })

  it("still rejects non-products (no price at all)", () => {
    const notProduct = { name: "Some heading", imageUrl: "https://cdn/y.webp" }
    const rc = buildRichContent([toolResult({ products: [notProduct] })])
    expect(rc).toBeNull()
  })

  it("still works for numeric minor-unit prices (priceKobo/saleKobo)", () => {
    const p = { name: "Numeric item", priceKobo: 450000, saleKobo: 290000, imageUrl: "https://cdn/z.webp" }
    const rc = buildRichContent([toolResult({ products: [p] })])
    expect(rc!.products[0].priceCents).toBe(290000)
    expect(rc!.products[0].originalPriceCents).toBe(450000)
  })
})
