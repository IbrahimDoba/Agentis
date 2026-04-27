import { solutionMetadata } from "@/lib/solution-metadata"
import {
  HeartIcon,
  CalendarDaysIcon,
  ClockIcon,
  BellIcon,
  ShieldCheckIcon,
  CheckIcon,
} from "@heroicons/react/24/outline"
import { SolutionPageLayout } from "@/components/landing/SolutionPageLayout"

export const metadata = solutionMetadata({
  title: "Healthcare & Clinics",
  description: "Handle appointment booking, patient FAQs, and follow-ups on WhatsApp — so your front desk can focus on patients in the clinic.",
  slug: "healthcare",
  ogImage: "https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&w=1600&q=80",
  ogImageAlt: "Modern clinic — D-Zero AI for Healthcare",
  keywords: ["healthcare whatsapp bot", "clinic appointment booking", "patient AI assistant", "medical chatbot", "whatsapp appointment reminder"],
})

export default function HealthcareSolutionPage() {
  return (
    <SolutionPageLayout
      slug="healthcare"
      BadgeIcon={HeartIcon}
      badge="Healthcare & Clinics"
      heroImage="https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&w=1600&q=80"
      heroImageAlt="Modern clinic interior"
      heroTitle={<>Give Every Patient an<br />Instant, Helpful Response</>}
      heroSub="D-Zero AI handles appointment booking, FAQs, and follow-ups on WhatsApp — so your front desk can focus on patients in the clinic, not messages on a phone."
      floatingBadges={[
        { text: "Appointment Confirmed", Icon: CheckIcon },
        { text: "50% Fewer No-Shows", dot: true },
        { text: "24/7 Patient Support", dot: true },
      ]}
      stats={[
        { val: "50%", label: "Fewer no-shows" },
        { val: "80%", label: "Queries handled automatically" },
        { val: "24/7", label: "Patient availability" },
      ]}
      chatBotName="ClinicBot AI"
      chatTitle={<>From patient message to<br />confirmed appointment instantly</>}
      chatDesc="When a patient messages your clinic, D-Zero AI responds immediately — booking appointments, answering questions about services, and sending reminders to cut no-shows."
      chatPoints={[
        "Books, reschedules, and cancels appointments automatically",
        "Answers questions about services, pricing, and doctors",
        "Sends reminders 24 hours before every appointment",
        "Handles after-hours enquiries without staff involvement",
      ]}
      conversation={[
        { from: "customer", text: "Hi, I'd like to book an appointment with Dr. Patel please" },
        { from: "ai", text: "Hi! 👋 Dr. Patel has availability this Thursday at 2pm or Friday at 10am. Which works best?" },
        { from: "customer", text: "Thursday at 2pm please" },
        { from: "ai", text: "Can I take your full name and date of birth to complete the booking?" },
        { from: "customer", text: "Emma Johnson, 15/03/1990" },
        { from: "ai", text: "Booked! Emma, your appointment is Thursday at 2pm with Dr. Patel. A reminder will be sent 24 hours before. 🏥", badge: "Appointment Confirmed" },
      ]}
      painTitle="Sound familiar?"
      painPoints={[
        { title: "Overloaded receptionists", desc: "Your front desk spends most of the day on the phone booking and rescheduling appointments that could be automated." },
        { title: "Patients waiting hours for replies", desc: "Queries about services, costs, and availability sit unanswered — frustrating patients and losing bookings." },
        { title: "No-shows and last-minute cancellations", desc: "Patients forget appointments without reminders, leaving gaps in your schedule that cost the practice revenue." },
      ]}
      benefitsTitle="Everything your clinic needs on WhatsApp"
      benefits={[
        { Icon: CalendarDaysIcon, title: "Appointment Booking", desc: "Patients book, reschedule, or cancel directly on WhatsApp — synced with your schedule in real time." },
        { Icon: ShieldCheckIcon, title: "Service & Pricing Info", desc: "The AI answers questions about your services, doctors, costs, and accepted insurance without staff involvement." },
        { Icon: BellIcon, title: "Automated Reminders", desc: "Reduce no-shows with automatic appointment reminders sent via WhatsApp the day before." },
        { Icon: ClockIcon, title: "After-Hours Coverage", desc: "Patients interact with your clinic outside office hours — booking appointments while you're closed." },
      ]}
      stepsTitle="Up and running in minutes"
      steps={[
        { number: "1", title: "Connect your clinic's WhatsApp", desc: "Scan a QR code or use a pairing code. No IT team needed — live in under 5 minutes." },
        { number: "2", title: "Add your services and availability", desc: "Upload your service list, doctor schedules, and FAQs. The AI learns your clinic instantly." },
        { number: "3", title: "Handle every patient message automatically", desc: "Bookings, reminders, and FAQs are handled 24/7 from the moment you go live." },
      ]}
      showcaseImages={[
        { src: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80", alt: "Doctor with patient", badge: "Appointment Booked" },
        { src: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80", alt: "Clinic reception", badge: "Patient Supported", BadgeIcon: HeartIcon },
      ]}
      showcaseQuote="Our receptionist used to spend 3 hours a day just on WhatsApp messages. Now the AI handles them and she can actually focus on the patients in front of her."
      ctaTitle="Ready to give every patient an instant response?"
      ctaDesc="Join clinics using D-Zero AI to handle WhatsApp bookings and patient queries 24/7 — without adding to your front desk."
    />
  )
}
