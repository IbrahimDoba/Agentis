import type { Metadata } from "next"
import { PLAN_PRICES, PLAN_CREDIT_LIMITS, AI_CREDIT_COSTS, estimatedAiMessages, formatNaira } from "@/lib/plans"
import { PAYG_DEFAULT_NGN_PER_CREDIT, PAYG_TIERS, CREDIT_EXPIRY_MONTHS } from "@/lib/credits"

// One host and one name for every tag a search engine or AI assistant reads.
// The site answers on both dailzero.com and www.dailzero.com, so without a
// canonical each page exists twice; www is the host the sitemap and ads use.
export const SITE_URL = "https://www.dailzero.com"
export const SITE_NAME = "Dailzero"
export const SITE_TAGLINE = "AI WhatsApp agent for Nigerian businesses"
export const SITE_DESCRIPTION =
  "Dailzero is an AI WhatsApp agent for Nigerian businesses. It replies to customers in seconds on your own number and takes orders. From ₦20,000 a month."

const ORG_ID = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`
const APP_ID = `${SITE_URL}/#software`

export function absoluteUrl(path = "/"): string {
  if (path === "/" || path === "") return `${SITE_URL}/`
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`
}

interface PageMetadataInput {
  // Without the brand; it is appended here.
  title: string
  description: string
  path: string
  // Use the title exactly as given (the home page already names the brand).
  absoluteTitle?: boolean
  type?: "website" | "article"
  publishedTime?: string
  modifiedTime?: string
  keywords?: string[]
}

/** Title, description, canonical and share tags for one page, from one place. */
export function pageMetadata({
  title, description, path, absoluteTitle, type = "website", publishedTime, modifiedTime, keywords,
}: PageMetadataInput): Metadata {
  const url = absoluteUrl(path)
  const shareTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`
  return {
    title: shareTitle,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: url },
    openGraph: {
      title: shareTitle,
      description,
      url,
      siteName: SITE_NAME,
      type,
      locale: "en_NG",
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    twitter: { card: "summary_large_image", title: shareTitle, description },
  }
}

export interface Faq {
  q: string
  a: string
}

const PAID_PLANS = [
  { id: "basic", name: "Basic" },
  { id: "starter", name: "Starter" },
  { id: "pro", name: "Pro" },
] as const

const credits = (plan: string) => PLAN_CREDIT_LIMITS[plan].toLocaleString("en-NG")
const messages = (plan: string) => estimatedAiMessages(PLAN_CREDIT_LIMITS[plan])!.toLocaleString("en-NG")
const PAYG_MIN = PAYG_TIERS[0].amountNaira

/** One sentence per paid plan, built from the billing constants so it can't drift. */
export function planSummaries(): string[] {
  return PAID_PLANS.map(
    (p) => `${p.name}: ${formatNaira(PLAN_PRICES[p.id])} a month for ${credits(p.id)} credits (about ${messages(p.id)} AI messages)`
  )
}

export const PAYG_SUMMARY =
  `Pay as you go: buy credits from ${formatNaira(PAYG_MIN)}, at about ₦${PAYG_DEFAULT_NGN_PER_CREDIT.toFixed(2)} a credit, valid for ${CREDIT_EXPIRY_MONTHS} months, with no subscription`

// The questions people actually put to an assistant about a tool like this.
// Answers lead with the fact so a quoted first sentence stands on its own.
export const HOME_FAQS: Faq[] = [
  {
    q: "What is Dailzero?",
    a: "Dailzero is an AI WhatsApp agent for Nigerian businesses. It replies to your customers in seconds on your own WhatsApp number, day and night. It answers from your own prices and product details, sends product photos, takes orders and books appointments, and hands the chat to you when a person is needed.",
  },
  {
    q: "How much does Dailzero cost?",
    a: `Dailzero starts with a 7-day free trial. Monthly plans are ${planSummaries().join("; ")}. ${PAYG_SUMMARY}. A typical AI reply uses about ${AI_CREDIT_COSTS.text} credits.`,
  },
  {
    q: "Does Dailzero work with my existing WhatsApp number?",
    a: "Yes. You link the WhatsApp or WhatsApp Business number you already use by scanning a QR code or entering a pairing code, the same way you link WhatsApp Web. Your customers keep messaging the number they already know.",
  },
  {
    q: "Does Dailzero use the official WhatsApp API?",
    a: "Dailzero connects in two ways. Most businesses link the number they already use, by QR code or pairing code like WhatsApp Web, with no Meta verification and no Meta message fees. Businesses that need the official WhatsApp Business Platform (Meta's Cloud API) can be set up on it with the Dailzero team: Dailzero's app is approved by Meta for WhatsApp Business messaging, and Meta's own message fees apply on that route.",
  },
  {
    q: "Will using an AI agent get my WhatsApp number banned?",
    a: "Dailzero is built to keep that risk low: every message is queued and sent at a human pace, new numbers go through a warm-up period, and sending slows down automatically when WhatsApp signals a limit. No tool can promise a number will never be restricted, so we recommend using a new number normally for about two weeks before connecting it.",
  },
  {
    q: "Can I take over a conversation from the AI?",
    a: "Yes. You can reply from the Dailzero dashboard or straight from your phone, and the AI pauses on that chat as soon as you do. You switch it back on when you are done.",
  },
  {
    q: "Do I need a developer to set it up?",
    a: "No. You sign up, describe your business, add your products and prices, and link your number, all from the dashboard. Developers who want more can use the Dailzero API to send WhatsApp messages and run the agent from their own code.",
  },
  {
    q: "Can Dailzero send broadcasts and post WhatsApp Status?",
    a: `Yes. You can message all your customers at once, with each send paced to protect your number: a text broadcast costs ${AI_CREDIT_COSTS.text} credits per person, an image ${AI_CREDIT_COSTS.image} and a video ${AI_CREDIT_COSTS.video}. Dailzero can also post your WhatsApp Status on a schedule and save the contacts who message you so they can see it.`,
  },
  {
    q: "What kinds of businesses use Dailzero?",
    a: "Any business that sells or supports customers on WhatsApp: online shops and fashion vendors, restaurants, real estate agents, clinics, logistics companies, schools and online trainers, hotels and service businesses.",
  },
]

function organization() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/logo-removed-bg.png`,
    description: SITE_DESCRIPTION,
    email: "support@dailzero.com",
    areaServed: { "@type": "Country", name: "Nigeria" },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@dailzero.com",
      url: absoluteUrl("/contact"),
      areaServed: "NG",
      availableLanguage: "English",
    },
  }
}

function website() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: "en-NG",
    publisher: { "@id": ORG_ID },
  }
}

function software() {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "WhatsApp AI agent",
    operatingSystem: "Web",
    url: `${SITE_URL}/`,
    description: SITE_DESCRIPTION,
    publisher: { "@id": ORG_ID },
    areaServed: { "@type": "Country", name: "Nigeria" },
    featureList: [
      "AI replies to WhatsApp customers 24/7 on your own number",
      "Answers from your own products, prices and business details",
      "Sends product photos, videos and documents",
      "Order taking, lead capture and appointment booking",
      "Human takeover from the dashboard or your phone",
      "Paced WhatsApp broadcasts",
      "Scheduled WhatsApp Status with Autopilot",
      "Developer API for WhatsApp messaging and AI chat",
    ],
    offers: [
      {
        "@type": "Offer",
        name: "Free trial",
        price: "0",
        priceCurrency: "NGN",
        description: `7 days, ${credits("free")} credits`,
        url: absoluteUrl("/pricing"),
      },
      ...PAID_PLANS.map((p) => ({
        "@type": "Offer",
        name: `${p.name} plan`,
        price: String(PLAN_PRICES[p.id]),
        priceCurrency: "NGN",
        description: `${credits(p.id)} credits a month, about ${messages(p.id)} AI messages`,
        url: absoluteUrl("/pricing"),
      })),
    ],
  }
}

function faqPage(faqs: Faq[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }
}

function breadcrumbs(trail: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: absoluteUrl(t.path),
    })),
  }
}

const graph = (...nodes: object[]) => ({ "@context": "https://schema.org", "@graph": nodes })

export function homeJsonLd() {
  return graph(organization(), website(), software(), faqPage(HOME_FAQS))
}

export function pricingJsonLd(faqs: Faq[]) {
  return graph(
    organization(),
    software(),
    faqPage(faqs),
    breadcrumbs([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }]),
  )
}

export function pageJsonLd(name: string, path: string, faqs?: Faq[]) {
  return graph(
    organization(),
    breadcrumbs([{ name: "Home", path: "/" }, { name, path }]),
    ...(faqs?.length ? [faqPage(faqs)] : []),
  )
}

export function articleJsonLd(post: {
  title: string; description: string; slug: string; publishedAt: string; updatedAt?: string; category: string; faqs?: Faq[]
}) {
  const url = absoluteUrl(`/blog/${post.slug}`)
  return graph(
    organization(),
    {
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      headline: post.title,
      description: post.description,
      url,
      mainEntityOfPage: url,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt ?? post.publishedAt,
      articleSection: post.category,
      inLanguage: "en-NG",
      author: { "@id": ORG_ID },
      publisher: { "@id": ORG_ID },
    },
    breadcrumbs([
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog" },
      { name: post.title, path: `/blog/${post.slug}` },
    ]),
    ...(post.faqs?.length ? [faqPage(post.faqs)] : []),
  )
}

/** Trim to a sentence-sized description that ends on a whole word. */
export function metaDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, " ").replace(/\.{3}$|…$/, "").trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "))
  if (stop > max * 0.5) return cut.slice(0, stop + 1)
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`
}
