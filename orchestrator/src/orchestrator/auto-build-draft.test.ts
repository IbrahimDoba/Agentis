import { describe, it, expect } from "vitest"
import {
  buildAutoBuildUserPrompt,
  composeDraftGuidelines,
  composeProfileOnlyGuidelines,
  parseAutoBuildDraft,
  removeUnseenPrices,
  type AutoBuildChat,
  type AutoBuildDraft,
  type AutoBuildProfile,
} from "./auto-build-draft.js"

const profile: AutoBuildProfile = {
  businessName: "Ada Fabrics",
  description: "Lace and ankara",
  category: "Clothing",
  address: null,
  contactEmail: null,
  websiteLinks: "https://a.example\nhttps://b.example",
}

const chats: AutoBuildChat[] = [
  {
    messages: [
      { fromBusiness: false, text: "How much is the lace?" },
      { fromBusiness: true, text: "₦15,000 per yard, ankara is 8k" },
    ],
  },
]

const draft = (over: Partial<AutoBuildDraft> = {}): AutoBuildDraft => ({
  description: "Sells fabric",
  instructions: "You are the assistant.",
  products: [],
  faqs: [],
  ...over,
})

describe("buildAutoBuildUserPrompt", () => {
  it("labels who said what and carries the profile", () => {
    const prompt = buildAutoBuildUserPrompt(profile, chats)
    expect(prompt).toContain("Business name: Ada Fabrics")
    expect(prompt).toContain("Website: https://a.example, https://b.example")
    expect(prompt).toContain("CUSTOMER: How much is the lace?")
    expect(prompt).toContain("BUSINESS: ₦15,000 per yard")
  })
})

describe("parseAutoBuildDraft", () => {
  it("parses JSON wrapped in a code fence", () => {
    const parsed = parseAutoBuildDraft('```json\n{"instructions":"Hi","products":[{"name":"Lace","price":"5"}],"faqs":[]}\n```')
    expect(parsed?.instructions).toBe("Hi")
    expect(parsed?.products[0]).toEqual({ name: "Lace", price: "5", notes: "" })
  })
  it("rejects invalid JSON, truncated output and missing instructions", () => {
    expect(parseAutoBuildDraft(null)).toBeNull()
    expect(parseAutoBuildDraft("sorry")).toBeNull()
    expect(parseAutoBuildDraft('{"instructions":"Hi","products":[')).toBeNull()
    expect(parseAutoBuildDraft('{"products":[]}')).toBeNull()
  })
  it("drops malformed list entries", () => {
    const parsed = parseAutoBuildDraft('{"instructions":"Hi","products":["x",{"price":"1"}],"faqs":[{"question":"q"}]}')
    expect(parsed?.products).toEqual([])
    expect(parsed?.faqs).toEqual([])
  })
})

describe("removeUnseenPrices", () => {
  it("keeps a price the owner stated, in any spelling", () => {
    const out = removeUnseenPrices(
      draft({ products: [
        { name: "Lace", price: "₦15,000", notes: "" },
        { name: "Ankara", price: "₦8,000", notes: "" },
      ] }),
      chats
    )
    expect(out.products.map((p) => p.price)).toEqual(["₦15,000", "₦8,000"])
  })
  it("blanks a made-up price but keeps the product", () => {
    const out = removeUnseenPrices(draft({ products: [{ name: "Silk", price: "₦40,000", notes: "" }] }), chats)
    expect(out.products[0]).toEqual({ name: "Silk", price: "", notes: "" })
  })
  it("blanks a made-up price written as a bare number", () => {
    const out = removeUnseenPrices(draft({ products: [{ name: "Silk", price: "40000", notes: "" }] }), chats)
    expect(out.products[0].price).toBe("")
  })
  it("doesn't let a customer's offer vouch for a price", () => {
    const offer: AutoBuildChat[] = [{ messages: [{ fromBusiness: false, text: "I go pay 5k" }] }]
    const out = removeUnseenPrices(draft({ products: [{ name: "Lace", price: "₦5,000", notes: "" }] }), offer)
    expect(out.products[0].price).toBe("")
  })
  it("drops FAQs and instruction lines with made-up prices", () => {
    const out = removeUnseenPrices(
      draft({
        instructions: "Line one.\nDelivery is ₦3,000.\nLine three.",
        faqs: [
          { question: "Lace price?", answer: "₦15,000 per yard" },
          { question: "Delivery?", answer: "It costs N3000" },
        ],
      }),
      chats
    )
    expect(out.instructions).toBe("Line one.\nLine three.")
    expect(out.faqs.map((f) => f.question)).toEqual(["Lace price?"])
  })
})

describe("guidelines", () => {
  it("includes products, FAQs and the no-guessing rule", () => {
    const text = composeDraftGuidelines(
      profile,
      draft({
        products: [{ name: "Lace", price: "₦15,000", notes: "per yard" }, { name: "Silk", price: "", notes: "" }],
        faqs: [{ question: "Open Sunday?", answer: "No" }],
      })
    )
    expect(text).toContain("- Lace: ₦15,000 (per yard)")
    expect(text).toContain("- Silk\n")
    expect(text).toContain("Q: Open Sunday?\nA: No")
    expect(text).toContain("Never guess a price")
  })
  it("still produces a usable agent from the profile alone", () => {
    const text = composeProfileOnlyGuidelines({ ...profile, description: null })
    expect(text).toContain("Ada Fabrics")
    expect(text).toContain("Category: Clothing")
    expect(text).toContain("Never guess a price")
  })
})
