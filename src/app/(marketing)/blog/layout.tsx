import { pageMetadata } from "@/lib/seo"

// The page itself is a client component, which cannot export metadata.
export const metadata = pageMetadata({
  title: "Blog: WhatsApp automation for Nigerian businesses",
  description:
    "Practical guides on selling and supporting customers on WhatsApp with AI, written for Nigerian shops, restaurants, real estate agents, hotels, fintechs and agencies.",
  path: "/blog",
})

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
