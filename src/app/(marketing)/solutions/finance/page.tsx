import { solutionMetadata } from "@/lib/solution-metadata"
import {
  BanknotesIcon,
  UserPlusIcon,
  ChatBubbleLeftRightIcon,
  ShieldCheckIcon,
  ClockIcon,
  CheckIcon,
} from "@heroicons/react/24/outline"
import { SolutionPageLayout } from "@/components/landing/SolutionPageLayout"

export const metadata = solutionMetadata({
  title: "Financial Services",
  description: "Answer every customer query, capture every lead, and qualify prospects automatically on WhatsApp.",
  slug: "finance",
  ogImage: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1600&q=80",
  ogImageAlt: "Financial services — D-Zero AI for Finance",
  keywords: ["financial services whatsapp bot", "loan lead qualification AI", "fintech chatbot", "whatsapp banking assistant", "financial product Q&A"],
})

export default function FinanceSolutionPage() {
  return (
    <SolutionPageLayout
      slug="finance"
      BadgeIcon={BanknotesIcon}
      badge="Financial Services"
      heroImage="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1600&q=80"
      heroImageAlt="Financial trading and analytics"
      heroTitle={<>Answer Every Query.<br />Capture Every Lead. Securely.</>}
      heroSub="D-Zero AI handles product enquiries, account FAQs, and lead qualification for financial services businesses on WhatsApp — compliantly and at scale."
      floatingBadges={[
        { text: "Lead Qualified", Icon: CheckIcon },
        { text: "Response < 1s", dot: true },
        { text: "Secure & Compliant", dot: true },
      ]}
      stats={[
        { val: "3×", label: "More leads qualified" },
        { val: "65%", label: "Support cost reduction" },
        { val: "24/7", label: "Always available" },
      ]}
      chatBotName="FinanceBot AI"
      chatTitle={<>From first enquiry to<br />qualified lead in minutes</>}
      chatDesc="When a prospect asks about a financial product, D-Zero AI responds instantly — explaining options, qualifying intent and eligibility, and handing off warm leads to your advisors."
      chatPoints={[
        "Answers product questions, rates, and eligibility instantly",
        "Qualifies income, product interest, and timeline automatically",
        "Directs sensitive data to secure channels — never stored in chat",
        "Hands off qualified leads to advisors with full context",
      ]}
      conversation={[
        { from: "customer", text: "Hi, I'm interested in a business loan. What rates do you offer?" },
        { from: "ai", text: "Hi! 👋 Our business loan rates start from 6.9% APR, with loans from £10,000 to £500,000. How much were you looking for?" },
        { from: "customer", text: "Around £50,000 over 3 years" },
        { from: "ai", text: "That would put your monthly repayments at around £1,520. Shall I take a few details to run a quick eligibility check?" },
        { from: "customer", text: "Yes please" },
        { from: "ai", text: "A specialist will be in touch within 2 hours with your full options. 💰", badge: "Lead Qualified" },
      ]}
      painTitle="Sound familiar?"
      painPoints={[
        { title: "High volume of repetitive queries", desc: "Customers ask the same questions about rates, products, and eligibility all day — taking up your advisors' time." },
        { title: "Slow lead response times", desc: "Prospects enquire about loans or investments and wait too long for a reply — by then they've gone to a competitor." },
        { title: "Support costs scaling with customers", desc: "Adding customers means adding support staff — an unsustainable model for growing financial businesses." },
      ]}
      benefitsTitle="Everything your financial services business needs on WhatsApp"
      benefits={[
        { Icon: ChatBubbleLeftRightIcon, title: "Product Q&A", desc: "The AI answers questions about your financial products, rates, and eligibility criteria instantly and accurately." },
        { Icon: UserPlusIcon, title: "Lead Qualification", desc: "Capture and qualify leads — income, product interest, timeline — before your advisors get involved." },
        { Icon: ShieldCheckIcon, title: "Secure & Compliant", desc: "No sensitive data stored in conversation. The AI directs customers to secure channels where required." },
        { Icon: ClockIcon, title: "24/7 Availability", desc: "Prospects can enquire about your products at any hour. Every message gets an immediate, intelligent reply." },
      ]}
      stepsTitle="Up and running in minutes"
      steps={[
        { number: "1", title: "Connect your WhatsApp number", desc: "Scan a QR code or use a pairing code. No technical setup required — live in under 5 minutes." },
        { number: "2", title: "Upload your product knowledge base", desc: "Add your products, rates, FAQs, and eligibility criteria. The AI learns everything instantly." },
        { number: "3", title: "Qualify every lead automatically", desc: "From the first message, your AI handles enquiries, qualifies leads, and passes them to your team ready to close." },
      ]}
      showcaseImages={[
        { src: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80", alt: "Business finance meeting", badge: "Lead Qualified" },
        { src: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=800&q=80", alt: "Professional financial advisor", badge: "Advisor Notified", BadgeIcon: CheckIcon },
      ]}
      showcaseQuote="Our advisors now spend their time closing deals, not answering basic product questions. The AI handles the top of the funnel — perfectly."
      ctaTitle="Ready to qualify every lead before your team gets involved?"
      ctaDesc="Join financial services businesses using D-Zero AI to handle WhatsApp enquiries 24/7 — compliantly and at scale."
    />
  )
}
