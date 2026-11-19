import { pageMetadata } from "@/lib/seo"

export const metadata = pageMetadata({
  title: "Data deletion request",
  description:
    "Request deletion of your personal data from Dailzero, in line with the NDPR and Meta's WhatsApp Business Platform requirements.",
  path: "/data-deletion",
})

export default function DataDeletionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
