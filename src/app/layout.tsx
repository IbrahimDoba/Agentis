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
  title: "Agentis — WhatsApp AI Agents for Business",
  description:
    "Automate your customer conversations on WhatsApp with AI. Never miss a lead, always respond instantly.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body className={spaceGrotesk.className}>
        <QueryProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
