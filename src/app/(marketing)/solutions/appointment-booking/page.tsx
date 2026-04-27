import { solutionMetadata } from "@/lib/solution-metadata"
import {
  CalendarDaysIcon,
  ClockIcon,
  BellIcon,
  ArrowPathIcon,
  CheckIcon,
} from "@heroicons/react/24/outline"
import { SolutionPageLayout } from "@/components/landing/SolutionPageLayout"

export const metadata = solutionMetadata({
  title: "Appointment Booking",
  description: "Let customers book directly on WhatsApp. D-Zero AI handles your entire booking flow — no forms, no phone tag.",
  slug: "appointment-booking",
  ogImage: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=1600&q=80",
  ogImageAlt: "Appointment booking — D-Zero AI for Service Businesses",
  keywords: ["whatsapp appointment booking", "automated scheduling bot", "booking chatbot", "no-show reduction AI", "whatsapp calendar booking"],
})

export default function AppointmentBookingSolutionPage() {
  return (
    <SolutionPageLayout
      slug="appointment-booking"
      BadgeIcon={CalendarDaysIcon}
      badge="Appointment Booking"
      heroImage="https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=1600&q=80"
      heroImageAlt="Calendar and appointment planning"
      heroTitle={<>Let Customers Book<br />Directly on WhatsApp.</>}
      heroSub="D-Zero AI handles your entire booking flow on WhatsApp — no forms, no phone tag, no back-and-forth. Customers book in seconds, you focus on delivering great service."
      floatingBadges={[
        { text: "Appointment Booked", Icon: CheckIcon },
        { text: "40% Fewer No-Shows", dot: true },
        { text: "24/7 Booking", dot: true },
      ]}
      stats={[
        { val: "40%", label: "Fewer no-shows" },
        { val: "3×", label: "More bookings captured" },
        { val: "24/7", label: "Booking availability" },
      ]}
      chatBotName="BookBot AI"
      chatTitle={<>From first message to<br />confirmed booking in seconds</>}
      chatDesc="When a customer wants to book, D-Zero AI handles the entire flow — checking availability, confirming details, and sending a reminder — without anyone on your team lifting a finger."
      chatPoints={[
        "Handles bookings, reschedules, and cancellations automatically",
        "Only offers genuinely available slots from your live schedule",
        "Sends reminders before every appointment to cut no-shows",
        "Works for any service business — salons, clinics, consultants, and more",
      ]}
      conversation={[
        { from: "customer", text: "Hi, I'd like to book a haircut for Saturday" },
        { from: "ai", text: "Hi! 👋 We have slots on Saturday at 10am, 12pm, and 3pm. Any preference?" },
        { from: "customer", text: "12pm works great" },
        { from: "ai", text: "We have Jamie and Alex available at 12pm. Who would you prefer?" },
        { from: "customer", text: "Jamie please!" },
        { from: "ai", text: "Booked! Saturday 12pm with Jamie. A reminder will be sent Friday morning. ✂️", badge: "Appointment Booked" },
      ]}
      painTitle="Sound familiar?"
      painPoints={[
        { title: "Bookings lost to friction", desc: "Customers want to book on WhatsApp but have to fill out a form or call instead — so they don't bother." },
        { title: "Double-bookings and scheduling errors", desc: "Manual booking management leads to embarrassing mistakes that damage your reputation." },
        { title: "No-shows with no reminders", desc: "Customers forget appointments because no one followed up — leaving gaps in your schedule that cost you money." },
      ]}
      benefitsTitle="Everything your booking flow needs on WhatsApp"
      benefits={[
        { Icon: CalendarDaysIcon, title: "Conversational Booking", desc: "Customers book in natural conversation — date, time, service — confirmed instantly with no staff needed." },
        { Icon: ClockIcon, title: "Live Availability", desc: "The AI only offers slots that are genuinely available, synced with your real schedule in real time." },
        { Icon: BellIcon, title: "Automated Reminders", desc: "Reminders sent automatically before every appointment dramatically reduce costly no-shows." },
        { Icon: ArrowPathIcon, title: "Reschedules & Cancellations", desc: "Customers manage their own bookings without needing to call — freeing up your team completely." },
      ]}
      stepsTitle="Up and running in minutes"
      steps={[
        { number: "1", title: "Connect your WhatsApp number", desc: "Scan a QR code or use a pairing code. No technical knowledge needed — live in under 5 minutes." },
        { number: "2", title: "Add your services and availability", desc: "Tell the AI your services, team, and schedule. It learns instantly and only books available slots." },
        { number: "3", title: "Start taking bookings automatically", desc: "From day one, every booking, reminder, and reschedule is handled — 24 hours a day." },
      ]}
      showcaseImages={[
        { src: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=800&q=80", alt: "Appointment being scheduled", badge: "Booking Confirmed" },
        { src: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80", alt: "Professional at desk planning", badge: "Calendar Full", BadgeIcon: CalendarDaysIcon },
      ]}
      showcaseQuote="We went from 30% no-show rates to under 8% in the first month. The automated reminders alone paid for the tool ten times over."
      ctaTitle="Ready to fill your calendar without the back-and-forth?"
      ctaDesc="Join service businesses using D-Zero AI to handle WhatsApp bookings 24/7 — effortlessly."
    />
  )
}
