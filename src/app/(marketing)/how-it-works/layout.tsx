import { pageMetadata } from "@/lib/seo"

// The page itself is a client component, which cannot export metadata.
export const metadata = pageMetadata({
  title: "How it works: set up your AI WhatsApp agent",
  description:
    "How Dailzero works, step by step: sign up, describe your business, add your products and prices, link your WhatsApp number and let the AI agent reply to customers.",
  path: "/how-it-works",
})

export default function HowItWorksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
