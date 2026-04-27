import { solutionMetadata } from "@/lib/solution-metadata"
import {
  HomeIcon,
  UserPlusIcon,
  ClockIcon,
  CalendarDaysIcon,
  BuildingOffice2Icon,
  CheckIcon,
} from "@heroicons/react/24/outline"
import { SolutionPageLayout } from "@/components/landing/SolutionPageLayout"

export const metadata = solutionMetadata({
  title: "Real Estate",
  description: "Qualify every lead and book every viewing automatically on WhatsApp — so you focus on closing deals.",
  slug: "real-estate",
  ogImage: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1600&q=80",
  ogImageAlt: "Modern property — D-Zero AI for Real Estate",
  keywords: ["real estate whatsapp bot", "property lead qualification", "viewing booking AI", "estate agent automation", "whatsapp property enquiry"],
})

export default function RealEstateSolutionPage() {
  return (
    <SolutionPageLayout
      slug="real-estate"
      BadgeIcon={HomeIcon}
      badge="Real Estate"
      heroImage="https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1600&q=80"
      heroImageAlt="Modern property exterior"
      heroTitle={<>Qualify Every Lead.<br />Book Every Viewing.</>}
      heroSub="D-Zero AI responds to property enquiries instantly, qualifies buyers and renters, and schedules viewings — so you focus on closing deals, not chasing replies."
      floatingBadges={[
        { text: "Viewing Booked", Icon: CheckIcon },
        { text: "Lead Qualified", dot: true },
        { text: "Response < 1s", dot: true },
      ]}
      stats={[
        { val: "5×", label: "More leads responded to" },
        { val: "70%", label: "Time saved on qualification" },
        { val: "24/7", label: "Instant responses" },
      ]}
      chatBotName="PropertyBot AI"
      chatTitle={<>From enquiry to booked<br />viewing in minutes</>}
      chatDesc="When a buyer messages about a property at 10pm, D-Zero AI responds instantly — answering questions, qualifying budget and timeline, and booking a viewing on the spot."
      chatPoints={[
        "Responds to every listing enquiry in under a second",
        "Qualifies budget, timeline, and location preference",
        "Books viewings directly from the WhatsApp conversation",
        "Knows your full property portfolio inside out",
      ]}
      conversation={[
        { from: "customer", text: "Hi, I saw the 3-bed on Oak Street. Is it still available?" },
        { from: "ai", text: "Hi! 👋 Yes, Oak Street is still available at £350,000. Would you like to arrange a viewing?" },
        { from: "customer", text: "Yes please! When can I come?" },
        { from: "ai", text: "We have tomorrow at 10am or Thursday at 2pm. Which works for you?" },
        { from: "customer", text: "Tomorrow at 10am" },
        { from: "ai", text: "Viewing confirmed for tomorrow at 10am. 🏠 I've noted your details — see you then!", badge: "Viewing Booked" },
      ]}
      painTitle="Sound familiar?"
      painPoints={[
        { title: "Leads going cold overnight", desc: "A buyer enquires at 10pm and hears back the next morning — by then, they've already moved on to another agent." },
        { title: "Time wasted on unqualified leads", desc: "Agents spend hours with tyre-kickers who aren't serious buyers or renters and have no budget to match." },
        { title: "Slow response to listing enquiries", desc: "High-volume listings mean some enquiries slip through the cracks and never get a follow-up." },
      ]}
      benefitsTitle="Everything your agency needs on WhatsApp"
      benefits={[
        { Icon: ClockIcon, title: "Instant Lead Response", desc: "Every WhatsApp enquiry gets an immediate, personalised reply — day or night, weekend or holiday." },
        { Icon: UserPlusIcon, title: "Lead Qualification", desc: "The AI asks the right questions — budget, timeline, location — so you only speak to serious prospects." },
        { Icon: CalendarDaysIcon, title: "Viewing Scheduling", desc: "Prospects book viewings directly through WhatsApp without any back-and-forth with your team." },
        { Icon: BuildingOffice2Icon, title: "Portfolio Knowledge", desc: "The AI knows your full property portfolio and answers questions about specs, price, and availability." },
      ]}
      stepsTitle="Up and running in minutes"
      steps={[
        { number: "1", title: "Connect your WhatsApp number", desc: "Scan a QR code or use a pairing code. No development work — live in under 5 minutes." },
        { number: "2", title: "Add your property portfolio", desc: "Upload your listings, pricing, and availability. The AI learns every property detail instantly." },
        { number: "3", title: "Respond to every enquiry automatically", desc: "From the moment you go live, every message is handled, qualified, and actioned — round the clock." },
      ]}
      showcaseImages={[
        { src: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=800&q=80", alt: "Modern house interior", badge: "Viewing Scheduled" },
        { src: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=800&q=80", alt: "House exterior", badge: "Lead Qualified", BadgeIcon: UserPlusIcon },
      ]}
      showcaseQuote="Our agents used to spend half their day chasing leads. Now the AI qualifies them first — we only step in when someone is genuinely ready to view."
      ctaTitle="Ready to respond to every lead the moment it arrives?"
      ctaDesc="Join estate agencies using D-Zero AI to handle WhatsApp enquiries 24/7 — without adding to your team."
    />
  )
}
