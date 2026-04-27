import { solutionMetadata } from "@/lib/solution-metadata"
import {
  TruckIcon,
  MapPinIcon,
  BellAlertIcon,
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
  CheckIcon,
} from "@heroicons/react/24/outline"
import { SolutionPageLayout } from "@/components/landing/SolutionPageLayout"

export const metadata = solutionMetadata({
  title: "Logistics & Delivery",
  description: "Keep every customer informed with real-time delivery updates on WhatsApp — without adding to your support load.",
  slug: "logistics",
  ogImage: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1600&q=80",
  ogImageAlt: "Logistics warehouse — D-Zero AI for Logistics",
  keywords: ["logistics whatsapp bot", "delivery tracking AI", "order status chatbot", "last mile delivery updates", "whatsapp shipping notifications"],
})

export default function LogisticsSolutionPage() {
  return (
    <SolutionPageLayout
      slug="logistics"
      BadgeIcon={TruckIcon}
      badge="Logistics & Delivery"
      heroImage="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1600&q=80"
      heroImageAlt="Logistics warehouse"
      heroTitle={<>Keep Every Customer Informed.<br />Every Step of the Way.</>}
      heroSub="D-Zero AI gives your customers real-time delivery updates and handles tracking queries on WhatsApp — without adding a single person to your support team."
      floatingBadges={[
        { text: "Delivery Tracked", Icon: CheckIcon },
        { text: "75% Fewer Tickets", dot: true },
        { text: "Real-Time Updates", dot: true },
      ]}
      stats={[
        { val: "75%", label: "Fewer support tickets" },
        { val: "4×", label: "Faster query resolution" },
        { val: "24/7", label: "Customer updates" },
      ]}
      chatBotName="TrackBot AI"
      chatTitle={<>From tracking query to<br />instant answer in seconds</>}
      chatDesc="When a customer messages about their delivery, D-Zero AI pulls the live status instantly — no queue, no wait, no support agent needed. Your team handles the exceptions, not the routine."
      chatPoints={[
        "Gives live delivery status the moment a customer asks",
        "Sends proactive dispatch and delivery notifications",
        "Handles ETAs, address changes, and missed deliveries",
        "Escalates exceptions to a human agent automatically",
      ]}
      conversation={[
        { from: "customer", text: "Hi, I'm expecting a delivery today. Order #45892" },
        { from: "ai", text: "Hi! 👋 I can see order #45892. Your package left the depot at 8:14am and is currently 4 stops away." },
        { from: "customer", text: "Great! Any idea on the delivery time?" },
        { from: "ai", text: "Estimated delivery is between 2pm and 4pm today. You'll get a notification 30 minutes before arrival." },
        { from: "customer", text: "Perfect, thank you!" },
        { from: "ai", text: "You're welcome! Your driver will message when they're nearby. 📦", badge: "Delivery Tracked" },
      ]}
      painTitle="Sound familiar?"
      painPoints={[
        { title: "High volume of 'where is my order?' queries", desc: "Your support team spends most of the day answering tracking questions that could be answered automatically." },
        { title: "Delayed responses frustrate customers", desc: "Customers are anxious about their deliveries and get no update until they call — by then they're already angry." },
        { title: "Costly support operations", desc: "Scaling a support team to handle delivery queries is expensive, slow to hire, and hard to maintain." },
      ]}
      benefitsTitle="Everything your logistics operation needs on WhatsApp"
      benefits={[
        { Icon: MapPinIcon, title: "Real-Time Tracking", desc: "Connect your system and let the AI give customers live delivery status the moment they ask on WhatsApp." },
        { Icon: BellAlertIcon, title: "Proactive Updates", desc: "Automatically notify customers of dispatch, delays, and delivery confirmations before they even need to ask." },
        { Icon: ChatBubbleLeftRightIcon, title: "Query Handling", desc: "The AI handles estimated arrival times, address changes, and delivery exceptions without human involvement." },
        { Icon: ArrowPathIcon, title: "Smart Escalation", desc: "Complex issues are automatically flagged and routed to a human agent — only when truly needed." },
      ]}
      stepsTitle="Up and running in minutes"
      steps={[
        { number: "1", title: "Connect your WhatsApp number", desc: "Scan a QR code or use a pairing code. No code required — live in under 5 minutes." },
        { number: "2", title: "Connect your tracking system", desc: "Link your logistics backend via API so the AI can pull live delivery data in real time." },
        { number: "3", title: "Automate every delivery query", desc: "From dispatch to doorstep, every customer question is answered instantly — 24 hours a day." },
      ]}
      showcaseImages={[
        { src: "https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=800&q=80", alt: "Delivery van on street", badge: "Out for Delivery" },
        { src: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=800&q=80", alt: "Package delivery", badge: "Delivered", BadgeIcon: CheckIcon },
      ]}
      showcaseQuote="Our support volume dropped by 70% in the first month. Customers love getting instant tracking updates — and our team can actually focus on the issues that matter."
      ctaTitle="Ready to stop answering the same tracking questions all day?"
      ctaDesc="Join logistics companies using D-Zero AI to handle WhatsApp delivery queries 24/7 — automatically."
    />
  )
}
