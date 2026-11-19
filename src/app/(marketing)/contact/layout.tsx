import { pageMetadata } from "@/lib/seo"

// The page itself is a client component, which cannot export metadata.
export const metadata = pageMetadata({
  title: "Contact us and book a demo",
  description:
    "Talk to the Dailzero team. Book a demo of the AI WhatsApp agent, ask a question about pricing or get help with your account.",
  path: "/contact",
})

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
