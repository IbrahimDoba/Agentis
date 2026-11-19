import { PLAN_PRICES, formatNaira } from "@/lib/plans"
import { pageMetadata, pricingJsonLd } from "@/lib/seo"
import { JsonLd } from "@/components/JsonLd"
import { PRICING_FAQS } from "./faqs"

// The page itself is a client component, which cannot export metadata.
export const metadata = pageMetadata({
  title: `Pricing in Naira: plans from ${formatNaira(PLAN_PRICES.basic)} a month`,
  description:
    `Dailzero pricing in Naira. Basic ${formatNaira(PLAN_PRICES.basic)}, Starter ${formatNaira(PLAN_PRICES.starter)} and Pro ${formatNaira(PLAN_PRICES.pro)} a month, or pay as you go with no subscription. 7-day free trial and no overage fees.`,
  path: "/pricing",
})

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={pricingJsonLd(PRICING_FAQS)} />
      {children}
    </>
  )
}
