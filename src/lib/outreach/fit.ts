// Deterministic fit scoring. Pure and cheap on purpose: it runs before the
// Claude call, so every point of precision here is an LLM call we don't pay for
// and, more importantly, an email a bad-fit business never receives.

export type FitInput = {
  vertical?: string | null
  city?: string | null
  whatsappNumber?: string | null
  website?: string | null
  instagram?: string | null
  reviewCount?: number | null
  research?: {
    hasPriceList?: boolean
    // "DM to order", "WhatsApp us", etc. in a bio or on a contact page — the
    // single strongest signal, because it proves they already sell in chat.
    sellsInDms?: boolean
    branchCount?: number | null
  } | null
}

export type FitResult = {
  score: number
  reasons: string[]
  disqualified: boolean
  disqualifiedReason: string | null
}

// The verticals with a dedicated solutions/* landing page, so the email has
// somewhere credible to send them beyond the demo.
export const SUPPORTED_VERTICALS = [
  "ecommerce",
  "restaurants",
  "real-estate",
  "finance",
  "healthcare",
  "logistics",
  "customer-support",
  "lead-generation",
  "appointment-booking",
] as const

const PRIORITY_CITIES = new Set(["lagos", "abuja", "port harcourt", "ibadan"])

// Above this a business has a call centre and a procurement process; DailZero is
// not the product and a cold email is not the motion.
const ENTERPRISE_REVIEW_COUNT = 2000
const ENTERPRISE_BRANCH_COUNT = 5

export function scoreFit(input: FitInput): FitResult {
  const research = input.research ?? {}

  if ((research.branchCount ?? 0) > ENTERPRISE_BRANCH_COUNT) {
    return disqualify(`chain with ${research.branchCount} branches`)
  }
  if ((input.reviewCount ?? 0) > ENTERPRISE_REVIEW_COUNT) {
    return disqualify(`${input.reviewCount} reviews — too large`)
  }

  let score = 0
  const reasons: string[] = []
  const add = (points: number, reason: string) => {
    score += points
    reasons.push(reason)
  }

  if (input.vertical && (SUPPORTED_VERTICALS as readonly string[]).includes(input.vertical)) {
    add(15, `${input.vertical} has a solutions page`)
  }
  if (input.whatsappNumber) add(25, "publishes a WhatsApp number")
  if (research.sellsInDms) add(10, "sells in DMs")
  if (research.hasPriceList) add(10, "published price list or menu")
  if (input.instagram) add(10, "active on Instagram")
  if (input.website) add(5, "has a website")

  const reviews = input.reviewCount ?? 0
  // Real traction but still owner-operated. Under 20 there may be no enquiry
  // volume to automate; over 500 they likely already have staff on it.
  if (reviews >= 20 && reviews <= 500) add(15, `${reviews} reviews — right size`)

  const city = input.city?.trim().toLowerCase()
  if (city && PRIORITY_CITIES.has(city)) add(10, `based in ${input.city}`)

  return {
    score: Math.min(score, 100),
    reasons,
    disqualified: false,
    disqualifiedReason: null,
  }
}

// Below this the personalization call is not worth making. Tuned against the
// first import batch, not derived from anything — raise it as list quality rises.
export const FIT_THRESHOLD = 45

function disqualify(reason: string): FitResult {
  return { score: 0, reasons: [], disqualified: true, disqualifiedReason: reason }
}
