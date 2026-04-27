import { solutionMetadata } from "@/lib/solution-metadata"
import {
  ChatBubbleLeftRightIcon,
  BoltIcon,
  BookOpenIcon,
  ArrowPathIcon,
  ClockIcon,
  CheckIcon,
} from "@heroicons/react/24/outline"
import { SolutionPageLayout } from "@/components/landing/SolutionPageLayout"

export const metadata = solutionMetadata({
  title: "Customer Support",
  description: "24/7 automated customer support on WhatsApp — resolving queries instantly, escalating when needed, zero extra headcount.",
  slug: "customer-support",
  ogImage: "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=1600&q=80",
  ogImageAlt: "Customer support — D-Zero AI for Support Teams",
  keywords: ["whatsapp customer support bot", "automated support AI", "24/7 chatbot", "customer service automation", "whatsapp helpdesk"],
})

export default function CustomerSupportSolutionPage() {
  return (
    <SolutionPageLayout
      slug="customer-support"
      BadgeIcon={ChatBubbleLeftRightIcon}
      badge="Customer Support"
      heroImage="https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=1600&q=80"
      heroImageAlt="Person getting support on laptop"
      heroTitle={<>24/7 Customer Support.<br />Zero Extra Headcount.</>}
      heroSub="D-Zero AI answers every WhatsApp message instantly — resolving common queries, escalating complex ones, and keeping your customers happy around the clock."
      floatingBadges={[
        { text: "Issue Resolved", Icon: CheckIcon },
        { text: "90% Auto-Resolved", dot: true },
        { text: "Response < 1s", dot: true },
      ]}
      stats={[
        { val: "90%", label: "Queries resolved automatically" },
        { val: "< 1s", label: "Average response time" },
        { val: "24/7", label: "Coverage" },
      ]}
      chatBotName="SupportBot AI"
      chatTitle={<>From issue raised to<br />resolved in seconds</>}
      chatDesc="When a customer messages with a problem, D-Zero AI resolves it immediately — no queue, no wait. Only truly complex issues are escalated to your team, saving hours of handling time every day."
      chatPoints={[
        "Resolves common issues instantly without human involvement",
        "Answers from your knowledge base and FAQs accurately",
        "Escalates complex cases to your team with full context",
        "Logs every interaction in your dashboard automatically",
      ]}
      conversation={[
        { from: "customer", text: "Hi, my order arrived damaged. I need help please" },
        { from: "ai", text: "Hi, I'm really sorry to hear that! 😔 Can you share your order number so I can look into this right away?" },
        { from: "customer", text: "It's order #88234" },
        { from: "ai", text: "Found it! I can see your order placed on the 12th. I'm raising a replacement right now — no need to return the damaged item." },
        { from: "customer", text: "That's brilliant, thank you so much!" },
        { from: "ai", text: "Your replacement has been dispatched and will arrive in 2–3 working days. ✅", badge: "Issue Resolved" },
      ]}
      painTitle="Sound familiar?"
      painPoints={[
        { title: "Support team overwhelmed", desc: "Your team can't keep up with the volume of incoming messages, leading to long waits and frustrated customers." },
        { title: "Long response times losing customers", desc: "Customers wait hours for simple answers they needed immediately — and don't come back." },
        { title: "High support costs", desc: "Hiring more agents to handle volume is expensive and slow to scale. There's a smarter way." },
      ]}
      benefitsTitle="Everything your support team needs on WhatsApp"
      benefits={[
        { Icon: BoltIcon, title: "Instant Responses", desc: "Every message gets a reply in seconds — no queues, no wait times, no matter the hour." },
        { Icon: BookOpenIcon, title: "Knowledge Base Q&A", desc: "Upload your docs, FAQs, and product guides. The AI answers directly from your own content." },
        { Icon: ArrowPathIcon, title: "Smart Escalation", desc: "Complex issues are automatically identified and routed to your team with the full conversation context." },
        { Icon: ClockIcon, title: "Always On", desc: "No shifts, no holidays. Your AI handles every message the moment it arrives — 24 hours a day, 365 days a year." },
      ]}
      stepsTitle="Up and running in minutes"
      steps={[
        { number: "1", title: "Connect your WhatsApp number", desc: "Scan a QR code or use a pairing code. Live in under 5 minutes with no technical setup." },
        { number: "2", title: "Upload your support knowledge base", desc: "Add your FAQs, policies, and product guides. The AI knows your answers immediately." },
        { number: "3", title: "Resolve queries automatically", desc: "From the moment you go live, your AI handles every support message — instantly and accurately." },
      ]}
      showcaseImages={[
        { src: "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=800&q=80", alt: "Customer support team", badge: "Team Freed Up" },
        { src: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=800&q=80", alt: "Office workspace", badge: "Issue Resolved", BadgeIcon: CheckIcon },
      ]}
      showcaseQuote="We cut our support response time from 4 hours to under 2 seconds. Customers are happier, and our team actually has time to handle the cases that matter."
      ctaTitle="Ready to resolve 90% of support queries automatically?"
      ctaDesc="Join businesses using D-Zero AI to handle WhatsApp support 24/7 — without adding headcount."
    />
  )
}
