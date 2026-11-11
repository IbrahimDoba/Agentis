import { Geist, Geist_Mono } from "next/font/google"

// Home page only for now; the dashboard keeps Space Grotesk until the owner
// has seen Geist on the landing page.
export const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
export const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
