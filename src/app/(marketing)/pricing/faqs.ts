import { PLAN_CREDIT_LIMITS } from "@/lib/plans"
import { PAYG_DEFAULT_NGN_PER_CREDIT, PAYG_TIERS, CREDIT_EXPIRY_MONTHS } from "@/lib/credits"
import type { Faq } from "@/lib/seo"

const PAYG_RATE_FMT = `₦${PAYG_DEFAULT_NGN_PER_CREDIT.toFixed(2)}`
const PAYG_MIN_FMT = `₦${PAYG_TIERS[0].amountNaira.toLocaleString("en-NG")}`
const FREE_CREDITS_FMT = PLAN_CREDIT_LIMITS.free.toLocaleString("en-NG")

// Shared by the page (visible answers) and its layout (FAQ structured data),
// so what an assistant quotes is word for word what a visitor reads.
export const PRICING_FAQS: Faq[] = [
  {
    q: "Is there a free trial?",
    a: `Yes. Every new account starts with a 7-day free trial that includes ${FREE_CREDITS_FMT} credits, so you can link your number and test your agent with real customers before you pay.`,
  },
  {
    q: "Can I switch plans?",
    a: "Yes. You can move between Basic, Starter and Pro at any time. Upgrades take effect immediately, and downgrades apply at the start of your next billing cycle.",
  },
  {
    q: "What happens if I exceed my credit limit?",
    a: "Your plan's monthly credits are used first. After that, sends draw from your pay-as-you-go balance, which you can top up anytime. When both run out, your agent pauses until your next renewal or top-up. There are no overage charges.",
  },
  {
    q: "Do I have to subscribe to a monthly plan?",
    a: `No, you can pay as you go. Buy a credit pack from ${PAYG_MIN_FMT} (about ${PAYG_RATE_FMT} a credit, cheaper in bulk) and spend it whenever you like. Credits stay valid for ${CREDIT_EXPIRY_MONTHS} months and work across all your agents. Monthly plans give you more credits at a lower rate if your volume is steady.`,
  },
  {
    q: "Do you offer custom plans?",
    a: "Yes. If your business needs higher message volume, more agents or custom integrations, we offer enterprise plans. Book a call with our team to discuss what you need.",
  },
  {
    q: "What payment methods do you accept?",
    a: "Payments are in Naira through Paystack, by card or bank transfer. Monthly plans renew automatically on the payment method you choose.",
  },
  {
    q: "Can I get a refund?",
    a: "If you're not satisfied within your first 7 days of a paid plan, we offer a full refund, no questions asked.",
  },
]
