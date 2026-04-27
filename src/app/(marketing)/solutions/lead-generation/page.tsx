import { solutionMetadata } from "@/lib/solution-metadata"
import {
  BoltIcon,
  ClockIcon,
  UserPlusIcon,
  FunnelIcon,
  ArrowPathIcon,
  CheckIcon,
} from "@heroicons/react/24/outline"
import { SolutionPageLayout } from "@/components/landing/SolutionPageLayout"

export const metadata = solutionMetadata({
  title: "Lead Generation",
  description: "Never miss a lead again. D-Zero AI captures, qualifies, and logs every inbound WhatsApp lead automatically.",
  slug: "lead-generation",
  ogImage: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1600&q=80",
  ogImageAlt: "Lead generation — D-Zero AI for Sales Teams",
  keywords: ["whatsapp lead generation", "AI lead qualification", "sales automation chatbot", "inbound lead capture", "whatsapp sales bot"],
})

export default function LeadGenerationSolutionPage() {
  return (
    <SolutionPageLayout
      slug="lead-generation"
      BadgeIcon={BoltIcon}
      badge="Lead Generation"
      heroImage="https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1600&q=80"
      heroImageAlt="Sales team in a business meeting"
      heroTitle={<>Never Miss a Lead Again.</>}
      heroSub="D-Zero AI captures, qualifies, and logs every inbound WhatsApp lead — so your sales team only talks to prospects who are ready to buy."
      floatingBadges={[
        { text: "Lead Captured", Icon: CheckIcon },
        { text: "5× More Leads", dot: true },
        { text: "Response < 1s", dot: true },
      ]}
      stats={[
        { val: "5×", label: "More leads captured" },
        { val: "60%", label: "Better lead quality" },
        { val: "< 1s", label: "First response time" },
      ]}
      chatBotName="LeadBot AI"
      chatTitle={<>From first message to<br />qualified lead in seconds</>}
      chatDesc="The moment a prospect messages you on WhatsApp, D-Zero AI responds, qualifies their intent, and logs them as a lead — all before your sales team has even seen the notification."
      chatPoints={[
        "Responds to every inbound message in under a second",
        "Qualifies budget, interest, and buying timeline automatically",
        "Logs every lead to your D-Zero dashboard with full context",
        "Sends follow-up sequences to keep warm leads engaged",
      ]}
      conversation={[
        { from: "customer", text: "Hi, I saw your ad about solar panels. I'm interested for my home" },
        { from: "ai", text: "Hi! 👋 Great timing — we have a summer installation deal running. Is this for a residential property?" },
        { from: "customer", text: "Yes, a 3-bedroom house in Manchester" },
        { from: "ai", text: "Perfect. What's your average monthly electricity bill? This helps us size the right system for you." },
        { from: "customer", text: "About £180 a month" },
        { from: "ai", text: "Based on that, you could save around £1,200 a year. Our team will call within the hour with a tailored quote. ⚡", badge: "Lead Captured" },
      ]}
      painTitle="Sound familiar?"
      painPoints={[
        { title: "Leads going cold from slow replies", desc: "The first business to reply wins the customer. Slow responses lose deals to competitors who are faster." },
        { title: "Unqualified leads wasting sales time", desc: "Your team spends hours with prospects who have no budget or no real intent to buy." },
        { title: "No system for tracking WhatsApp enquiries", desc: "Leads come in on WhatsApp and fall through the cracks — no record, no follow-up, lost forever." },
      ]}
      benefitsTitle="Everything your sales team needs on WhatsApp"
      benefits={[
        { Icon: ClockIcon, title: "Instant Lead Response", desc: "Every enquiry gets an immediate, intelligent reply — capturing interest before it fades to a competitor." },
        { Icon: FunnelIcon, title: "Automatic Qualification", desc: "The AI asks the right questions and scores leads before passing them to your team — ready to close." },
        { Icon: UserPlusIcon, title: "Lead Logging", desc: "Every qualified lead is captured in your D-Zero dashboard automatically — no manual CRM entry needed." },
        { Icon: ArrowPathIcon, title: "Follow-Up Sequences", desc: "Automated follow-ups keep warm leads engaged until they're ready to speak to your sales team." },
      ]}
      stepsTitle="Up and running in minutes"
      steps={[
        { number: "1", title: "Connect your WhatsApp number", desc: "Scan a QR code or use a pairing code. No code needed — live in under 5 minutes." },
        { number: "2", title: "Define your qualification questions", desc: "Tell the AI what makes a qualified lead for your business. It learns your criteria instantly." },
        { number: "3", title: "Start capturing and qualifying automatically", desc: "Every inbound message is handled, qualified, and logged — so your team only deals with ready buyers." },
      ]}
      showcaseImages={[
        { src: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80", alt: "Business growth analytics", badge: "5× More Leads" },
        { src: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80", alt: "Sales professional", badge: "Lead Qualified", BadgeIcon: UserPlusIcon },
      ]}
      showcaseQuote="Our sales team used to waste 40% of their time on tyre-kickers. Now the AI pre-qualifies everyone — they only speak to people who are genuinely ready to buy."
      ctaTitle="Ready to capture every lead the moment it arrives?"
      ctaDesc="Join sales teams using D-Zero AI to qualify WhatsApp leads 24/7 — automatically and at scale."
    />
  )
}
