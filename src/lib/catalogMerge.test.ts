import { describe, it, expect } from "vitest"
import { mergeCatalog } from "./catalogMerge"
import type { Product } from "@/types"

const wa = (over: Partial<Product>): Product => ({
  id: over.id ?? `wa-${over.retailerId ?? over.waProductId ?? over.name}`,
  name: "Product",
  source: "whatsapp",
  ...over,
})
const manual = (over: Partial<Product>): Product => ({ id: over.id ?? `m-${over.name}`, name: "Product", ...over })

describe("mergeCatalog", () => {
  it("adds all products into an empty catalogue", () => {
    const incoming = [wa({ retailerId: "A", name: "Cap A", price: "₦35,000" }), wa({ retailerId: "B", name: "Cap B" })]
    const { products, stats } = mergeCatalog([], incoming)
    expect(products).toHaveLength(2)
    expect(stats).toMatchObject({ added: 2, updated: 0, unchanged: 0, manualKept: 0, staleFromWhatsApp: 0 })
    expect(products.every((p) => p.source === "whatsapp")).toBe(true)
  })

  it("updates a matched product in place, preserving its id and mediaId", () => {
    const existing = [wa({ id: "keep-1", retailerId: "A", name: "Old Name", price: "₦30,000", mediaId: "media-123" })]
    const incoming = [wa({ retailerId: "A", name: "New Name", price: "₦35,000" })]
    const { products, stats } = mergeCatalog(existing, incoming)
    expect(stats).toMatchObject({ added: 0, updated: 1, unchanged: 0 })
    expect(products).toHaveLength(1)
    expect(products[0].id).toBe("keep-1") // stable id kept
    expect(products[0].mediaId).toBe("media-123") // Dailzero-only field preserved
    expect(products[0].name).toBe("New Name")
    expect(products[0].price).toBe("₦35,000")
  })

  it("reports unchanged when a synced product is identical", () => {
    const existing = [wa({ retailerId: "A", name: "Cap A", price: "₦35,000", images: ["u1"] })]
    const incoming = [wa({ retailerId: "A", name: "Cap A", price: "₦35,000", images: ["u1"] })]
    const { stats } = mergeCatalog(existing, incoming)
    expect(stats).toMatchObject({ updated: 0, unchanged: 1, added: 0 })
  })

  it("never touches manually-added products", () => {
    const existing = [manual({ id: "hand-1", name: "Hand-made item", price: "₦9,999" })]
    const incoming = [wa({ retailerId: "A", name: "Cap A" })]
    const { products, stats } = mergeCatalog(existing, incoming)
    expect(stats).toMatchObject({ added: 1, manualKept: 1 })
    const kept = products.find((p) => p.id === "hand-1")!
    expect(kept.name).toBe("Hand-made item")
    expect(kept.source).toBeUndefined()
  })

  it("keeps (does not delete) synced products that vanished from WhatsApp, and flags them stale", () => {
    const existing = [wa({ id: "gone", retailerId: "OLD", name: "Discontinued" }), wa({ retailerId: "A", name: "Cap A" })]
    const incoming = [wa({ retailerId: "A", name: "Cap A" })]
    const { products, stats } = mergeCatalog(existing, incoming)
    expect(stats.staleFromWhatsApp).toBe(1)
    expect(products.find((p) => p.id === "gone")).toBeDefined()
  })

  it("falls back to WhatsApp product id when there is no retailerId (SKU)", () => {
    const existing = [wa({ id: "keep", waProductId: "wapid-1", name: "Old" })]
    const incoming = [wa({ waProductId: "wapid-1", name: "Renamed" })]
    const { products, stats } = mergeCatalog(existing, incoming)
    expect(stats.updated).toBe(1)
    expect(products[0].id).toBe("keep")
    expect(products[0].name).toBe("Renamed")
  })

  it("does not collide a manual product with a WhatsApp product of the same name", () => {
    const existing = [manual({ id: "m1", name: "Cap A", price: "₦40,000" })]
    const incoming = [wa({ retailerId: "A", name: "Cap A", price: "₦35,000" })]
    const { products, stats } = mergeCatalog(existing, incoming)
    // both survive — manual kept, WA added separately
    expect(products).toHaveLength(2)
    expect(stats).toMatchObject({ added: 1, manualKept: 1, updated: 0 })
    expect(products.find((p) => p.id === "m1")!.price).toBe("₦40,000")
  })

  it("preserves existing order and appends new products at the end", () => {
    const existing = [
      manual({ id: "m1", name: "Manual" }),
      wa({ id: "w1", retailerId: "A", name: "A" }),
    ]
    const incoming = [wa({ retailerId: "A", name: "A" }), wa({ retailerId: "B", name: "B new" })]
    const { products } = mergeCatalog(existing, incoming)
    expect(products.map((p) => p.id)).toEqual(["m1", "w1", products[2].id])
    expect(products[2].name).toBe("B new")
  })
})
