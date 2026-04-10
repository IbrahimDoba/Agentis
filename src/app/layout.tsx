import type { Metadata } from "next"
import { Space_Grotesk } from "next/font/google"
import { ThemeProvider } from "@/components/ThemeProvider"
import { QueryProvider } from "@/components/QueryProvider"
import "./globals.css"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["300", "400", "500", "600", "700"],
})

export const metadata: Metadata = {
  metadataBase: new URL("https://dailzero.com"),
  title: "D-Zero AI — WhatsApp AI Agents for Business",
  description:
    "Automate your customer conversations on WhatsApp with AI. Never miss a lead, always respond instantly.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "D-Zero AI — WhatsApp AI Agents for Business",
    description:
      "Automate your customer conversations on WhatsApp with AI. Never miss a lead, always respond instantly.",
    url: "https://dailzero.com",
    siteName: "D-Zero AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "D-Zero AI — WhatsApp AI Agents for Business",
    description:
      "Automate your customer conversations on WhatsApp with AI. Never miss a lead, always respond instantly.",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <head>
        <script
          src="https://cdn.databuddy.cc/databuddy.js"
          data-client-id="5c77f52a-12ad-49f1-9ef0-e8c3f0c6a95a"
          crossOrigin="anonymous"
          async
        />
      </head>
      <body className={spaceGrotesk.className}>
        <QueryProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
