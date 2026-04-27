import { solutionMetadata } from "@/lib/solution-metadata"
import {
  ShoppingBagIcon,
  ClockIcon,
  UserPlusIcon,
  TruckIcon,
  CheckIcon,
} from "@heroicons/react/24/outline"
import { SolutionPageLayout } from "@/components/landing/SolutionPageLayout"

export const metadata = solutionMetadata({
  title: "E-commerce & Retail",
  description: "Turn every WhatsApp message into a sale. D-Zero AI answers product questions, tracks orders, and converts browsers into buyers — 24/7, without a support team.",
  slug: "ecommerce",
  ogImage: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1600&q=80",
  ogImageAlt: "Retail shopping scene — D-Zero AI for E-commerce",
  keywords: ["ecommerce whatsapp bot", "retail AI agent", "whatsapp sales automation", "abandoned cart recovery", "product Q&A chatbot"],
})

export default function EcommerceSolutionPage() {
  return (
    <SolutionPageLayout
      slug="ecommerce"
      BadgeIcon={ShoppingBagIcon}
      badge="E-commerce & Retail"
      heroImage="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1600&q=80"
      heroImageAlt="Retail shopping scene"
      heroTitle={<>Turn Every WhatsApp Message<br />Into a Sale</>}
      heroSub="Your customers are already on WhatsApp. D-Zero AI answers product questions, tracks orders, and converts browsers into buyers — 24/7, without a support team."
      floatingBadges={[
        { text: "Response < 1s", dot: true },
        { text: "Lead Captured", Icon: CheckIcon },
        { text: "24/7 Active", dot: true },
      ]}
      stats={[
        { val: "3×", label: "Faster response time" },
        { val: "60%", label: "Reduction in support tickets" },
        { val: "24/7", label: "Always available" },
      ]}
      chatBotName="ShopBot AI"
      chatTitle={<>From first message to<br />captured lead in seconds</>}
      chatDesc="The moment a customer reaches out on WhatsApp, D-Zero AI steps in — answering questions, building rapport, and capturing lead details automatically. Your team wakes up to qualified prospects, not unanswered chats."
      chatPoints={[
        "Responds instantly — even at 2am",
        "Knows your full product catalogue",
        "Captures name, interest, and intent automatically",
        "Escalates complex queries to your team",
      ]}
      conversation={[
        { from: "customer", text: "Hi, I saw your ad for the leather jacket. Is size M still in stock?" },
        { from: "ai", text: "Hey! 👋 Yes, size M is available in black and brown. Which colour were you after?" },
        { from: "customer", text: "Black please. How much is shipping?" },
        { from: "ai", text: "Free shipping on orders over $50 — the jacket is $89, so you're covered! Want me to reserve one for you?" },
        { from: "customer", text: "Yes please!" },
        { from: "ai", text: "Done! I've got your details. Our team will follow up shortly to complete the order. 🛍️", badge: "Lead Captured" },
      ]}
      painTitle="Sound familiar?"
      painPoints={[
        {
          title: "Abandoned carts from slow replies",
          desc: "Customers ask about a product, wait hours for a reply, and buy from a competitor instead.",
        },
        {
          title: "Overwhelmed support staff",
          desc: "Your team spends all day answering the same questions about sizes, stock, and delivery.",
        },
        {
          title: "Leads lost outside business hours",
          desc: "Orders and enquiries that come in at night go unanswered until morning — by then it's too late.",
        },
      ]}
      benefitsTitle="Everything your store needs on WhatsApp"
      benefits={[
        {
          Icon: ShoppingBagIcon,
          title: "Instant Product Answers",
          desc: "The AI knows your full catalogue and answers stock, pricing, and spec questions the moment a customer asks.",
        },
        {
          Icon: ClockIcon,
          title: "24/7 Coverage",
          desc: "No shifts, no holidays. Every message is handled the moment it arrives — whether it's 2pm or 2am.",
        },
        {
          Icon: UserPlusIcon,
          title: "Automatic Lead Capture",
          desc: "Every conversation becomes a captured lead. The AI qualifies intent and logs details into your dashboard.",
        },
        {
          Icon: TruckIcon,
          title: "Order Status Updates",
          desc: "Connect your backend and let customers check their order status on WhatsApp without calling anyone.",
        },
      ]}
      stepsTitle="Up and running in minutes"
      steps={[
        {
          number: "1",
          title: "Connect your WhatsApp number",
          desc: "Scan a QR code or use a pairing code. No technical setup required — takes less than 5 minutes.",
        },
        {
          number: "2",
          title: "Train the AI on your store",
          desc: "Upload your product catalogue, paste your store URL, or add a custom knowledge base. The AI learns instantly.",
        },
        {
          number: "3",
          title: "Go live and watch leads roll in",
          desc: "Your AI agent handles every conversation from minute one — qualifying leads, answering questions, and capturing contact details.",
        },
      ]}
      showcaseImages={[
        {
          src: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=800&q=80",
          alt: "Online shopping on mobile",
          badge: "Order confirmed",
        },
        {
          src: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80",
          alt: "Retail store",
          badge: "Lead captured",
          BadgeIcon: UserPlusIcon,
        },
      ]}
      showcaseQuote="We went from missing half our after-hours enquiries to capturing every single one — without hiring anyone."
      ctaTitle="Ready to turn WhatsApp into your top sales channel?"
      ctaDesc="Join retailers using D-Zero AI to handle WhatsApp conversations 24/7 — without adding headcount."
    />
  )
}
