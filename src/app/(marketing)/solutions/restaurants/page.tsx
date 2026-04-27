import { solutionMetadata } from "@/lib/solution-metadata"
import {
  BuildingStorefrontIcon,
  CalendarDaysIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  BellIcon,
  CheckIcon,
} from "@heroicons/react/24/outline"
import { SolutionPageLayout } from "@/components/landing/SolutionPageLayout"

export const metadata = solutionMetadata({
  title: "Restaurants & Food",
  description: "Fill more tables, answer every order, and handle reservations automatically on WhatsApp — without extra staff.",
  slug: "restaurants",
  ogImage: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1600&q=80",
  ogImageAlt: "Restaurant dining room — D-Zero AI for Restaurants",
  keywords: ["restaurant whatsapp bot", "table reservation AI", "food ordering chatbot", "restaurant automation", "whatsapp booking system"],
})

export default function RestaurantsSolutionPage() {
  return (
    <SolutionPageLayout
      slug="restaurants"
      BadgeIcon={BuildingStorefrontIcon}
      badge="Restaurants & Food"
      heroImage="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1600&q=80"
      heroImageAlt="Restaurant dining room"
      heroTitle={<>Fill More Tables.<br />Zero Extra Staff.</>}
      heroSub="From reservations to menu questions to delivery updates — D-Zero AI handles it all on WhatsApp so your team can focus on the food."
      floatingBadges={[
        { text: "Booking Confirmed", Icon: CheckIcon },
        { text: "24/7 Reservations", dot: true },
        { text: "Zero No-Shows", dot: true },
      ]}
      stats={[
        { val: "40%", label: "Fewer no-shows" },
        { val: "2×", label: "More reservations captured" },
        { val: "24/7", label: "Booking availability" },
      ]}
      chatBotName="TableBot AI"
      chatTitle={<>From first message to<br />confirmed booking in seconds</>}
      chatDesc="When a customer messages to book a table, D-Zero AI handles the entire reservation flow — picking time, party size, and confirming — without your staff lifting a finger."
      chatPoints={[
        "Handles reservations, changes, and cancellations automatically",
        "Knows your menu, allergens, and opening hours",
        "Sends booking reminders to cut no-shows",
        "Takes delivery and takeaway orders after hours",
      ]}
      conversation={[
        { from: "customer", text: "Hi, do you have a table for 4 this Friday at 7pm?" },
        { from: "ai", text: "Hi! 👋 Yes, we have availability at 7:00pm and 7:30pm this Friday. Which time works best?" },
        { from: "customer", text: "7:30pm please — it's a birthday dinner!" },
        { from: "ai", text: "Lovely! Can I take a name and contact number to hold the table?" },
        { from: "customer", text: "Sarah, 07891234567" },
        { from: "ai", text: "Booked! 🎂 Table for 4 at 7:30pm Friday under Sarah. We'll send a reminder the morning before.", badge: "Booking Confirmed" },
      ]}
      painTitle="Sound familiar?"
      painPoints={[
        { title: "Missed reservations and calls", desc: "Customers try to book by WhatsApp and get no reply, then go elsewhere without a second thought." },
        { title: "Repetitive menu questions", desc: "Staff spend their shift answering 'Do you have a vegetarian option?' instead of serving tables." },
        { title: "No after-hours bookings", desc: "You lose reservations made at night because no one is available to respond until morning." },
      ]}
      benefitsTitle="Everything your restaurant needs on WhatsApp"
      benefits={[
        { Icon: CalendarDaysIcon, title: "Automated Reservations", desc: "Customers book a table directly on WhatsApp — date, time, party size, confirmed instantly with no staff needed." },
        { Icon: ChatBubbleLeftRightIcon, title: "Menu Q&A", desc: "The AI answers questions about your menu, allergens, specials, and opening times without interrupting your team." },
        { Icon: ClockIcon, title: "24/7 Coverage", desc: "Reservations and orders come in at all hours. Your AI handles every message the moment it arrives." },
        { Icon: BellIcon, title: "Booking Reminders", desc: "Automatically send reminders before each reservation to dramatically reduce no-shows." },
      ]}
      stepsTitle="Up and running in minutes"
      steps={[
        { number: "1", title: "Connect your WhatsApp number", desc: "Scan a QR code or use a pairing code. No technical setup needed — live in under 5 minutes." },
        { number: "2", title: "Add your menu and availability", desc: "Upload your menu, allergen info, and opening hours. The AI learns your restaurant instantly." },
        { number: "3", title: "Start taking bookings automatically", desc: "Every reservation, order, and question is handled from minute one — even while you sleep." },
      ]}
      showcaseImages={[
        { src: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80", alt: "Restaurant dining room full", badge: "Table Reserved" },
        { src: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80", alt: "Restaurant food plating", badge: "Order Confirmed", BadgeIcon: CheckIcon },
      ]}
      showcaseQuote="We used to miss at least 10 bookings a week because of WhatsApp messages we couldn't get to. Now every single one is handled automatically."
      ctaTitle="Ready to fill more tables without the extra workload?"
      ctaDesc="Join restaurants using D-Zero AI to handle WhatsApp reservations and orders 24/7 — without adding headcount."
    />
  )
}
